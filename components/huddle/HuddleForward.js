'use client';
import { useState, useMemo } from 'react';
import { getHuddleCapacity, getDateTotals, getBand, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, toLocalIso } from '@/lib/data';
import { predictDemand, getWeatherForecast } from '@/lib/demandPredictor';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEMAND_COLOURS = {
  low: { bg: '#dcfce7', text: '#166534', label: 'Low' },
  normal: { bg: '#dbeafe', text: '#1e40af', label: 'Normal' },
  high: { bg: '#fef3c7', text: '#92400e', label: 'High' },
  'very-high': { bg: '#fee2e2', text: '#991b1b', label: 'V.High' },
};

export default function HuddleForward({ data, saveData, huddleData, setActiveSection }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [weather, setWeather] = useState(null);
  const hs = data?.huddleSettings || {};
  const saved = hs?.savedSlotFilters || {};
  const urgentOverrides = saved.urgent || null;
  const routineOverrides = saved.routine || null;
  const routineWeeklyTarget = hs?.routineWeeklyTarget || 0;
  const teamClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    return (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians)).filter(c => c.status !== 'left');
  }, [data?.clinicians]);

  // Load weather once
  useState(() => { getWeatherForecast(16).then(w => setWeather(w)).catch(() => {}); });

  // Build 6 weeks of data
  const weeks = useMemo(() => {
    if (!huddleData) return [];
    const today = new Date(); today.setHours(0,0,0,0);
    const dow = today.getDay(); const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + mondayOffset);
    const result = [];

    for (let w = 0; w < 6; w++) {
      const weekStart = new Date(thisMonday); weekStart.setDate(thisMonday.getDate() + w * 7);
      const days = [];
      let weekUrgent = 0, weekRoutineAvail = 0, weekRoutineEmb = 0, weekRoutineBooked = 0;
      let weekTargetUrgent = 0;

      for (let d = 0; d < 5; d++) {
        const date = new Date(weekStart); date.setDate(weekStart.getDate() + d);
        const dateStr = `${String(date.getDate()).padStart(2,'0')}-${date.toLocaleString('en-GB',{month:'short'})}-${date.getFullYear()}`;
        const isoKey = toLocalIso(date);
        const dayName = DAY_NAMES[date.getDay()];
        const hasData = huddleData.dates?.includes(dateStr);
        const isToday = isoKey === toLocalIso(today);

        // Urgent capacity
        const urgentCap = hasData ? getHuddleCapacity(huddleData, dateStr, hs, urgentOverrides) : null;
        const amSlots = urgentCap ? (urgentCap.am.total||0) + (urgentCap.am.embargoed||0) : 0;
        const pmSlots = urgentCap ? (urgentCap.pm.total||0) + (urgentCap.pm.embargoed||0) : 0;
        const amTarget = hs?.expectedCapacity?.[dayName]?.am || 0;
        const pmTarget = hs?.expectedCapacity?.[dayName]?.pm || 0;
        const amBand = amTarget > 0 ? getBand(amSlots, amTarget) : null;
        const pmBand = pmTarget > 0 ? getBand(pmSlots, pmTarget) : null;

        // Routine capacity
        const routineCap = hasData ? getHuddleCapacity(huddleData, dateStr, hs, routineOverrides) : null;
        const routineTotals = hasData ? getDateTotals(huddleData, dateStr, hs, routineOverrides) : null;
        const rAvail = routineTotals?.available || 0;
        const rEmb = routineTotals?.embargoed || 0;
        const rBooked = routineTotals?.booked || 0;
        const rTotal = rAvail + rEmb + rBooked;

        // Demand prediction
        const wKey = isoKey;
        const dayWeather = weather?.[wKey] || null;
        const pred = predictDemand(date, dayWeather);
        const demandLevel = pred?.demandLevel || 'normal';
        const predicted = pred?.predicted ? Math.round(pred.predicted) : null;

        weekUrgent += amSlots + pmSlots;
        weekRoutineAvail += rAvail; weekRoutineEmb += rEmb; weekRoutineBooked += rBooked;
        weekTargetUrgent += amTarget + pmTarget;

        days.push({ date, dateStr, isoKey, dayName, dayShort: DAY_SHORT[date.getDay()], dayNum: date.getDate(),
          monthStr: date.toLocaleString('en-GB',{month:'short'}), hasData, isToday,
          amSlots, pmSlots, amTarget, pmTarget, amBand, pmBand,
          rAvail, rEmb, rBooked, rTotal,
          predicted, demandLevel, demandCol: DEMAND_COLOURS[demandLevel] || DEMAND_COLOURS.normal,
          urgentCap, routineCap,
        });
      }
      const weekStartLabel = `${weekStart.getDate()} ${weekStart.toLocaleString('en-GB',{month:'short'})}`;
      result.push({ days, weekStart, weekStartLabel, weekUrgent, weekTargetUrgent,
        weekRoutine: weekRoutineAvail + weekRoutineEmb + weekRoutineBooked,
        weekRoutineAvail, weekRoutineEmb, weekRoutineBooked });
    }
    return result;
  }, [huddleData, hs, urgentOverrides, routineOverrides, weather]);

  // Summaries
  const shortDays = useMemo(() => {
    const result = [];
    weeks.forEach(w => w.days.forEach(d => {
      if (!d.hasData) return;
      const urgent = d.amSlots + d.pmSlots;
      const target = d.amTarget + d.pmTarget;
      if (target > 0 && urgent < target * 0.8) result.push({ ...d, urgent, target, deficit: target - urgent });
    }));
    return result.sort((a, b) => a.date - b.date);
  }, [weeks]);

  const highDemandDays = useMemo(() => {
    return weeks.flatMap(w => w.days).filter(d => d.demandLevel === 'very-high' || d.demandLevel === 'high').sort((a, b) => a.date - b.date);
  }, [weeks]);

  const lowRoutineWeeks = useMemo(() => {
    if (!routineWeeklyTarget) return [];
    return weeks.filter(w => w.weekRoutine > 0 && w.weekRoutine < routineWeeklyTarget * 0.9);
  }, [weeks, routineWeeklyTarget]);

  // Detail popup
  const detailDay = selectedDay ? weeks.flatMap(w => w.days).find(d => d.isoKey === selectedDay) : null;
  const detailClinicians = useMemo(() => {
    if (!detailDay?.urgentCap) return { am: [], pm: [], routine: [] };
    const mapClin = (list) => (list || []).filter(c => (c.available||0) + (c.embargoed||0) + (c.booked||0) > 0).map(c => {
      const matched = teamClinicians.find(tc => matchesStaffMember(c.name, tc));
      return { name: matched?.name || c.name, initials: matched?.initials || '?', location: c.location, slots: (c.available||0) + (c.embargoed||0), booked: c.booked||0 };
    }).sort((a, b) => (b.slots + b.booked) - (a.slots + a.booked));
    return {
      am: mapClin(detailDay.urgentCap?.am?.byClinician),
      pm: mapClin(detailDay.urgentCap?.pm?.byClinician),
      routine: mapClin(detailDay.routineCap?.am?.byClinician?.concat(detailDay.routineCap?.pm?.byClinician || []).reduce((acc, c) => {
        const existing = acc.find(a => a.name === c.name);
        if (existing) { existing.available += (c.available||0); existing.embargoed += (c.embargoed||0); existing.booked += (c.booked||0); existing.location = existing.location || c.location; }
        else acc.push({ ...c });
        return acc;
      }, []) || []),
    };
  }, [detailDay, teamClinicians]);

  const updateRoutineTarget = (val) => {
    saveData({ ...data, huddleSettings: { ...hs, routineWeeklyTarget: parseInt(val) || 0 } }, false);
  };

  if (!huddleData) return (
    <div className="card p-12 text-center">
      <h2 className="text-lg font-semibold text-slate-900 mb-2">Upload appointment report</h2>
      <p className="text-sm text-slate-500">Upload a CSV on the Today page to see capacity planning data.</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Main calendar card */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <span className="text-sm font-semibold text-white">Capacity planning</span>
          <span className="text-xs text-slate-400 ml-auto">6-week forward view</span>
        </div>

        {/* Header */}
        <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: '56px repeat(5, 1fr) 80px' }}>
          <div className="p-2" />
          {['Mon','Tue','Wed','Thu','Fri'].map(d => <div key={d} className="p-2 text-center text-xs font-semibold text-slate-500">{d}</div>)}
          <div className="p-2 text-center text-xs font-semibold text-slate-500">Totals</div>
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid border-b border-slate-200" style={{ gridTemplateColumns: '56px repeat(5, 1fr) 80px' }}>
            {/* Week label */}
            <div className="p-2 border-r border-slate-100 flex flex-col justify-center">
              <div className="text-xs font-semibold text-slate-800">Wk {wi + 1}</div>
              <div className="text-[10px] text-slate-400">{week.weekStartLabel}</div>
            </div>

            {/* Days */}
            {week.days.map((day, di) => {
              if (!day.hasData) return (
                <div key={di} className="p-1 border-r border-slate-50">
                  <div className="rounded-md h-full bg-slate-50 flex items-center justify-center">
                    <span className="text-[10px] text-slate-300">No data</span>
                  </div>
                </div>
              );
              const urgentTotal = day.amSlots + day.pmSlots;
              return (
                <div key={di} className="p-1 border-r border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSelectedDay(selectedDay === day.isoKey ? null : day.isoKey)}>
                  <div className="rounded-md h-full" style={{ padding: '3px 4px', borderLeft: day.isToday ? '3px solid #10b981' : '3px solid transparent' }}>
                    {/* Date + prediction */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-semibold text-slate-700">{day.dayNum}</span>
                      {day.predicted && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: day.demandCol.bg, color: day.demandCol.text }}>{day.predicted}</span>}
                    </div>
                    {/* AM / PM urgent */}
                    <div className="flex gap-1 mb-1">
                      <div className="flex-1 text-center rounded py-0.5" style={{ background: day.amBand?.tint || '#f8fafc' }}>
                        <div className="text-sm font-bold" style={{ color: day.amBand?.colour || '#64748b' }}>{day.amSlots}</div>
                        <div className="text-[7px] font-semibold" style={{ color: day.amBand?.colour || '#94a3b8' }}>AM</div>
                      </div>
                      <div className="flex-1 text-center rounded py-0.5" style={{ background: day.pmBand?.tint || '#f8fafc' }}>
                        <div className="text-sm font-bold" style={{ color: day.pmBand?.colour || '#64748b' }}>{day.pmSlots}</div>
                        <div className="text-[7px] font-semibold" style={{ color: day.pmBand?.colour || '#94a3b8' }}>PM</div>
                      </div>
                    </div>
                    {/* Routine bar */}
                    <div className="rounded overflow-hidden flex" style={{ height: 14, background: '#f1f5f9' }}>
                      {day.rTotal > 0 && <>
                        {day.rAvail > 0 && <div style={{ width: `${(day.rAvail/day.rTotal)*100}%`, height: 14, backgroundColor: '#10b981', display: 'block', minWidth: 1 }} />}
                        {day.rEmb > 0 && <div style={{ width: `${(day.rEmb/day.rTotal)*100}%`, height: 14, backgroundColor: '#fbbf24', display: 'block', minWidth: 1 }} />}
                        {day.rBooked > 0 && <div style={{ width: `${(day.rBooked/day.rTotal)*100}%`, height: 14, backgroundColor: '#cbd5e1', display: 'block', minWidth: 1 }} />}
                      </>}
                    </div>
                    <div className="text-center text-[9px] text-slate-400 mt-0.5">{day.rTotal} routine</div>
                  </div>
                </div>
              );
            })}

            {/* Week totals */}
            <div className="p-1.5 flex flex-col justify-center gap-1">
              {week.weekUrgent > 0 ? (<>
                <div className="rounded text-center py-1" style={{ background: week.weekTargetUrgent > 0 ? getBand(week.weekUrgent, week.weekTargetUrgent).tint : '#f8fafc' }}>
                  <div className="text-sm font-bold" style={{ color: week.weekTargetUrgent > 0 ? getBand(week.weekUrgent, week.weekTargetUrgent).colour : '#334155' }}>{week.weekUrgent}</div>
                  <div className="text-[7px] font-semibold" style={{ color: week.weekTargetUrgent > 0 ? getBand(week.weekUrgent, week.weekTargetUrgent).colour : '#94a3b8' }}>urgent</div>
                  {week.weekTargetUrgent > 0 && <div className="text-[8px] text-slate-400">/ {week.weekTargetUrgent}</div>}
                </div>
                <div className="rounded text-center py-1" style={{ background: routineWeeklyTarget > 0 ? getBand(week.weekRoutine, routineWeeklyTarget).tint : '#f0fdf4' }}>
                  <div className="text-sm font-bold" style={{ color: routineWeeklyTarget > 0 ? getBand(week.weekRoutine, routineWeeklyTarget).colour : '#047857' }}>{week.weekRoutine}</div>
                  <div className="text-[7px] font-semibold" style={{ color: routineWeeklyTarget > 0 ? getBand(week.weekRoutine, routineWeeklyTarget).colour : '#059669' }}>routine</div>
                  {routineWeeklyTarget > 0 && <div className="text-[8px] text-slate-400">/ {routineWeeklyTarget}</div>}
                </div>
              </>) : <div className="text-[10px] text-slate-300 text-center">—</div>}
            </div>
          </div>
        ))}

        {/* Legend */}
        <div className="px-4 py-2 bg-slate-50 flex items-center gap-4 flex-wrap text-[10px] text-slate-400">
          <span className="font-semibold text-slate-500">Key:</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:'#10b981'}}/>Available</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:'#fbbf24'}}/>Embargoed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:'#cbd5e1'}}/>Booked</span>
          <span className="mx-2">|</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:'#dcfce7'}}/>On target</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:'#fef3c7'}}/>Tight</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{background:'#fee2e2'}}/>Short</span>
          <span className="mx-2">|</span>
          {routineWeeklyTarget > 0
            ? <span>Routine target: {routineWeeklyTarget}/week</span>
            : <button onClick={() => updateRoutineTarget(200)} className="text-indigo-500 underline cursor-pointer" style={{background:'none',border:'none',fontSize:'inherit'}}>Set routine target</button>
          }
        </div>
      </div>

      {/* Detail popup */}
      {detailDay && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr} — slot detail</span>
            <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-white text-xs" style={{background:'none',border:'none',cursor:'pointer'}}>✕ Close</button>
          </div>
          <div className="grid grid-cols-3 gap-4 p-4">
            {[
              { label: 'AM urgent', slots: detailDay.amSlots, target: detailDay.amTarget, band: detailDay.amBand, list: detailClinicians.am, col: '#ef4444' },
              { label: 'PM urgent', slots: detailDay.pmSlots, target: detailDay.pmTarget, band: detailDay.pmBand, list: detailClinicians.pm, col: '#3b82f6' },
              { label: 'Routine', slots: detailDay.rTotal, list: detailClinicians.routine, col: '#10b981' },
            ].map((sec, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase" style={{ color: sec.col }}>{sec.label}</span>
                  <span className="text-xs font-bold" style={{ color: sec.band?.colour || sec.col }}>{sec.slots}</span>
                  {sec.target > 0 && <span className="text-[10px] text-slate-400">/ {sec.target}</span>}
                </div>
                <div className="space-y-1">
                  {sec.list.map((c, j) => {
                    const lc = c.location ? LOCATION_COLOURS[c.location] : null;
                    return (
                      <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50">
                        {lc && <div className="w-1.5 h-4 rounded-sm" style={{ background: lc.bg }} />}
                        <span className="text-xs text-slate-700 flex-1 truncate">{c.name}</span>
                        <span className="text-xs font-bold text-slate-800">{c.slots + c.booked}</span>
                      </div>
                    );
                  })}
                  {sec.list.length === 0 && <div className="text-xs text-slate-300 py-2">No slots</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summaries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Short days */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-4 py-2.5 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
            <span className="text-xs font-semibold text-white">Days with urgent capacity below target</span>
            <span className="text-xs text-white/60 ml-auto">{shortDays.length} day{shortDays.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-3 space-y-1">
            {shortDays.length === 0 && <p className="text-xs text-slate-400 text-center py-2">All days are meeting urgent targets</p>}
            {shortDays.slice(0, 8).map((d, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50">
                <span className="text-xs font-semibold text-slate-700 w-20">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min((d.urgent / d.target) * 100, 100)}%`, background: d.urgent < d.target * 0.8 ? '#ef4444' : '#f59e0b' }} />
                </div>
                <span className="text-xs font-bold" style={{ color: '#ef4444' }}>{d.urgent}</span>
                <span className="text-[10px] text-slate-400">/ {d.target}</span>
              </div>
            ))}
          </div>
        </div>

        {/* High demand days */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-4 py-2.5 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span className="text-xs font-semibold text-white">High demand days ahead</span>
            <span className="text-xs text-white/60 ml-auto">{highDemandDays.length} day{highDemandDays.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="p-3 space-y-1">
            {highDemandDays.length === 0 && <p className="text-xs text-slate-400 text-center py-2">No high demand days predicted</p>}
            {highDemandDays.slice(0, 8).map((d, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50">
                <span className="text-xs font-semibold text-slate-700 w-20">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: d.demandCol.bg, color: d.demandCol.text }}>{d.predicted} requests</span>
                <span className="text-[10px] text-slate-400 ml-auto">{d.amSlots + d.pmSlots} urgent slots</span>
              </div>
            ))}
          </div>
        </div>

        {/* Low routine weeks */}
        {routineWeeklyTarget > 0 && (
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <span className="text-xs font-semibold text-white">Routine capacity below target</span>
              <span className="text-xs text-white/60 ml-auto">{lowRoutineWeeks.length} week{lowRoutineWeeks.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-3 space-y-1">
              {lowRoutineWeeks.length === 0 && <p className="text-xs text-slate-400 text-center py-2">All weeks meeting routine target</p>}
              {lowRoutineWeeks.map((w, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50">
                  <span className="text-xs font-semibold text-slate-700 w-20">Wk {weeks.indexOf(w) + 1}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min((w.weekRoutine / routineWeeklyTarget) * 100, 100)}%` }} />
                  </div>
                  <span className="text-xs font-bold text-amber-600">{w.weekRoutine}</span>
                  <span className="text-[10px] text-slate-400">/ {routineWeeklyTarget}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Week-on-week trend */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-4 py-2.5 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span className="text-xs font-semibold text-white">Week-on-week capacity</span>
          </div>
          <div className="p-3 space-y-1.5">
            {weeks.filter(w => w.weekUrgent > 0).map((w, i) => {
              const prev = i > 0 ? weeks.filter(ww => ww.weekUrgent > 0)[i - 1] : null;
              const delta = prev ? w.weekUrgent - prev.weekUrgent : 0;
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-50">
                  <span className="text-xs font-semibold text-slate-700 w-16">Wk {weeks.indexOf(w) + 1}</span>
                  <span className="text-xs font-bold text-slate-800 w-12">{w.weekUrgent}</span>
                  <span className="text-[10px] text-slate-400">urgent</span>
                  <span className="text-xs font-bold w-12 ml-2" style={{ color: '#047857' }}>{w.weekRoutine}</span>
                  <span className="text-[10px] text-slate-400">routine</span>
                  {delta !== 0 && <span className={`text-[10px] font-semibold ml-auto ${delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{delta > 0 ? '↑' : '↓'}{Math.abs(delta)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
