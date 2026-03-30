'use client';
import { useState, useMemo, useEffect } from 'react';
import { getHuddleCapacity, getDateTotals, getBand, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, toLocalIso } from '@/lib/data';
import { predictDemand, getWeatherForecast } from '@/lib/demandPredictor';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEMAND = {
  low: { bg: '#10b981', text: '#fff', label: 'Low' },
  normal: { bg: '#3b82f6', text: '#fff', label: 'Normal' },
  high: { bg: '#f59e0b', text: '#fff', label: 'High' },
  'very-high': { bg: '#ef4444', text: '#fff', label: 'V.High' },
};
const BAND_VIBRANT = {
  over: { bg: '#3b82f6', text: '#fff' },
  good: { bg: '#10b981', text: '#fff' },
  tight: { bg: '#f59e0b', text: '#fff' },
  short: { bg: '#ef4444', text: '#fff' },
  none: { bg: '#e2e8f0', text: '#64748b' },
};
function vibrantBand(slots, target) {
  if (target <= 0) return BAND_VIBRANT.none;
  const pct = (slots / target) * 100;
  if (pct >= 120) return BAND_VIBRANT.over;
  if (pct >= 90) return BAND_VIBRANT.good;
  if (pct >= 80) return BAND_VIBRANT.tight;
  return BAND_VIBRANT.short;
}

export default function HuddleForward({ data, saveData, huddleData, setActiveSection }) {
  const [selectedDay, setSelectedDay] = useState(null);
  const [weather, setWeather] = useState(null);
  const hs = data?.huddleSettings || {};
  const saved = hs?.savedSlotFilters || {};
  const urgentOverrides = saved.urgent || null;
  const routineOverrides = saved.routine || null;
  const routineWeeklyTarget = hs?.routineWeeklyTarget || 0;
  const convRate = hs?.demandCapacity?.conversionRate ?? 0.25;
  const teamClinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    return (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians)).filter(c => c.status !== 'left');
  }, [data?.clinicians]);

  useEffect(() => { getWeatherForecast(16).then(w => setWeather(w)).catch(() => {}); }, []);

  const weeks = useMemo(() => {
    if (!huddleData) return [];
    const today = new Date(); today.setHours(0,0,0,0);
    const dow = today.getDay(); const off = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(today); mon.setDate(today.getDate() + off);
    const result = [];
    for (let w = 0; w < 6; w++) {
      const ws = new Date(mon); ws.setDate(mon.getDate() + w * 7);
      const days = [];
      let wUrg = 0, wRA = 0, wRE = 0, wRB = 0, wTarg = 0;
      for (let d = 0; d < 5; d++) {
        const date = new Date(ws); date.setDate(ws.getDate() + d);
        const dateStr = `${String(date.getDate()).padStart(2,'0')}-${date.toLocaleString('en-GB',{month:'short'})}-${date.getFullYear()}`;
        const isoKey = toLocalIso(date);
        const dayName = DAY_NAMES[date.getDay()];
        const hasData = huddleData.dates?.includes(dateStr);
        const isToday = isoKey === toLocalIso(today);
        const pred = predictDemand(date, weather?.[isoKey] || null);
        const isBH = pred?.isBankHoliday || false;
        const demandLevel = pred?.demandLevel || 'normal';
        const predicted = pred?.predicted ? Math.round(pred.predicted) : null;
        const urgCap = hasData && !isBH ? getHuddleCapacity(huddleData, dateStr, hs, urgentOverrides) : null;
        const amS = urgCap ? (urgCap.am.total||0) + (urgCap.am.embargoed||0) : 0;
        const pmS = urgCap ? (urgCap.pm.total||0) + (urgCap.pm.embargoed||0) : 0;
        const amT = hs?.expectedCapacity?.[dayName]?.am || 0;
        const pmT = hs?.expectedCapacity?.[dayName]?.pm || 0;
        const rTots = hasData && !isBH ? getDateTotals(huddleData, dateStr, hs, routineOverrides) : null;
        const rA = rTots?.available || 0, rE = rTots?.embargoed || 0, rB = rTots?.booked || 0;
        if (!isBH) { wUrg += amS + pmS; wRA += rA; wRE += rE; wRB += rB; wTarg += amT + pmT; }
        days.push({ date, dateStr, isoKey, dayName, dayShort: DAY_SHORT[date.getDay()], dayNum: date.getDate(),
          monthStr: date.toLocaleString('en-GB',{month:'short'}), hasData, isToday, isBH,
          amS, pmS, amT, pmT, rA, rE, rB, rTotal: rA+rE+rB,
          predicted, demandLevel, dc: DEMAND[demandLevel] || DEMAND.normal,
          needed: predicted ? Math.round(predicted * convRate) : 0,
          urgCap, routCap: hasData && !isBH ? getHuddleCapacity(huddleData, dateStr, hs, routineOverrides) : null,
        });
      }
      result.push({ days, ws, label: `${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`, wUrg, wTarg, wR: wRA+wRE+wRB, wRA, wRE, wRB });
    }
    return result;
  }, [huddleData, hs, urgentOverrides, routineOverrides, weather, convRate]);

  // Summaries
  const shortDays = useMemo(() => weeks.flatMap(w => w.days).filter(d => d.hasData && !d.isBH && (d.amT+d.pmT) > 0 && (d.amS+d.pmS) < (d.amT+d.pmT) * 0.8).sort((a,b) => a.date-b.date), [weeks]);
  const topDemandDays = useMemo(() => weeks.flatMap(w => w.days).filter(d => !d.isBH && d.predicted).sort((a,b) => b.predicted - a.predicted).slice(0,5), [weeks]);

  // Detail
  const detailDay = selectedDay ? weeks.flatMap(w => w.days).find(d => d.isoKey === selectedDay) : null;
  const detailClin = useMemo(() => {
    if (!detailDay) return { am:[], pm:[], rout:[] };
    const map = list => (list||[]).filter(c => (c.available||0)+(c.embargoed||0)+(c.booked||0) > 0).map(c => {
      const m = teamClinicians.find(tc => matchesStaffMember(c.name, tc));
      return { name: m?.name||c.name, initials: m?.initials||'?', loc: c.location, slots: (c.available||0)+(c.embargoed||0), bkd: c.booked||0 };
    }).sort((a,b) => (b.slots+b.bkd)-(a.slots+a.bkd));
    const routMerge = [...(detailDay.routCap?.am?.byClinician||[]), ...(detailDay.routCap?.pm?.byClinician||[])].reduce((a,c) => {
      const e = a.find(x => x.name === c.name);
      if (e) { e.available += c.available||0; e.embargoed += c.embargoed||0; e.booked += c.booked||0; e.location = e.location||c.location; }
      else a.push({...c});
      return a;
    }, []);
    return { am: map(detailDay.urgCap?.am?.byClinician), pm: map(detailDay.urgCap?.pm?.byClinician), rout: map(routMerge) };
  }, [detailDay, teamClinicians]);

  const updateTarget = v => saveData({ ...data, huddleSettings: { ...hs, routineWeeklyTarget: parseInt(v)||0 } }, false);

  if (!huddleData) return <div className="card p-12 text-center"><h2 className="text-lg font-semibold text-slate-900 mb-2">Upload appointment report</h2><p className="text-sm text-slate-500">Upload a CSV on the Today page first.</p></div>;

  return (
    <div className="space-y-6">
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <span className="text-sm font-semibold text-white">Capacity planning</span>
          <span className="text-xs text-slate-400 ml-auto">6-week forward view</span>
        </div>
        <div className="grid border-b border-slate-200 bg-slate-50" style={{gridTemplateColumns:'60px repeat(5, 1fr) 84px'}}>
          <div className="p-3"/>
          {['Mon','Tue','Wed','Thu','Fri'].map(d => <div key={d} className="p-3 text-center text-xs font-semibold text-slate-500">{d}</div>)}
          <div className="p-3 text-center text-xs font-semibold text-slate-500">Week</div>
        </div>

        {weeks.map((wk, wi) => (
          <div key={wi} className="grid border-b border-slate-200" style={{gridTemplateColumns:'60px repeat(5, 1fr) 84px'}}>
            <div className="p-3 border-r border-slate-100 flex flex-col justify-center">
              <div className="text-xs font-bold text-slate-800">Wk {wi+1}</div>
              <div className="text-[10px] text-slate-400">{wk.label}</div>
            </div>
            {wk.days.map((d, di) => {
              const sel = selectedDay === d.isoKey;
              if (d.isBH) return <div key={di} className="p-2 border-r border-slate-50"><div className="rounded-lg h-full bg-amber-50 flex items-center justify-center border border-amber-200"><span className="text-xs font-semibold text-amber-600">Bank hol</span></div></div>;
              if (!d.hasData) return <div key={di} className="p-2 border-r border-slate-50"><div className="rounded-lg h-full bg-slate-50 flex items-center justify-center"><span className="text-[10px] text-slate-300">No data</span></div></div>;
              const amVB = vibrantBand(d.amS, d.amT), pmVB = vibrantBand(d.pmS, d.pmT);
              return (
                <div key={di} className="p-2 border-r border-slate-50">
                  <div onClick={() => setSelectedDay(sel ? null : d.isoKey)}
                    className="rounded-lg h-full cursor-pointer transition-all duration-150"
                    style={{ padding: '6px', borderLeft: d.isToday ? '3px solid #10b981' : '3px solid transparent',
                      outline: sel ? '2px solid #6366f1' : 'none', outlineOffset: -1,
                      background: sel ? '#eef2ff' : 'transparent',
                      boxShadow: sel ? '0 0 0 1px #a5b4fc' : 'none' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">{d.dayNum}</span>
                      {d.predicted && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{background:d.dc.bg, color:d.dc.text}}>{d.predicted}</span>}
                    </div>
                    <div className="flex gap-1 mb-1.5">
                      <div className="flex-1 text-center rounded-md py-1" style={{background:amVB.bg}}>
                        <div className="text-sm font-bold" style={{color:amVB.text}}>{d.amS}</div>
                        <div className="text-[7px] font-bold" style={{color:amVB.text, opacity:0.8}}>AM</div>
                      </div>
                      <div className="flex-1 text-center rounded-md py-1" style={{background:pmVB.bg}}>
                        <div className="text-sm font-bold" style={{color:pmVB.text}}>{d.pmS}</div>
                        <div className="text-[7px] font-bold" style={{color:pmVB.text, opacity:0.8}}>PM</div>
                      </div>
                    </div>
                    <div className="rounded-md overflow-hidden flex" style={{height:12,background:'#f1f5f9'}}>
                      {d.rTotal > 0 && <>
                        {d.rA > 0 && <div style={{width:`${(d.rA/d.rTotal)*100}%`,height:12,backgroundColor:'#10b981',minWidth:1}}/>}
                        {d.rE > 0 && <div style={{width:`${(d.rE/d.rTotal)*100}%`,height:12,backgroundColor:'#f59e0b',minWidth:1}}/>}
                        {d.rB > 0 && <div style={{width:`${(d.rB/d.rTotal)*100}%`,height:12,backgroundColor:'#8b5cf6',minWidth:1}}/>}
                      </>}
                    </div>
                    <div className="text-center text-[9px] text-slate-400 mt-1">{d.rTotal} routine</div>
                  </div>
                </div>
              );
            })}
            <div className="p-2 flex flex-col justify-center gap-2">
              {wk.wUrg > 0 ? (<>
                <div className="rounded-md text-center py-1.5" style={{background: vibrantBand(wk.wUrg, wk.wTarg).bg}}>
                  <div className="text-sm font-bold" style={{color: vibrantBand(wk.wUrg, wk.wTarg).text}}>{wk.wUrg}</div>
                  <div className="text-[7px] font-bold" style={{color: vibrantBand(wk.wUrg, wk.wTarg).text, opacity:0.8}}>urgent</div>
                  {wk.wTarg > 0 && <div className="text-[8px]" style={{color: vibrantBand(wk.wUrg, wk.wTarg).text, opacity:0.6}}>/ {wk.wTarg}</div>}
                </div>
                <div className="rounded-md text-center py-1.5" style={{background: routineWeeklyTarget > 0 ? vibrantBand(wk.wR, routineWeeklyTarget).bg : '#8b5cf6'}}>
                  <div className="text-sm font-bold text-white">{wk.wR}</div>
                  <div className="text-[7px] font-bold text-white" style={{opacity:0.8}}>routine</div>
                  {routineWeeklyTarget > 0 && <div className="text-[8px] text-white" style={{opacity:0.6}}>/ {routineWeeklyTarget}</div>}
                </div>
              </>) : <div className="text-[10px] text-slate-300 text-center">—</div>}
            </div>
          </div>
        ))}
        <div className="px-5 py-2.5 bg-slate-50 flex items-center gap-5 flex-wrap text-[10px] text-slate-400">
          <span className="font-semibold text-slate-500">Key:</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/>Available</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/>Embargoed</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#8b5cf6'}}/>Booked</span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/>On target</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/>Tight</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#ef4444'}}/>Short</span>
          <span className="text-slate-300">|</span>
          {routineWeeklyTarget > 0
            ? <span>Routine target: <strong>{routineWeeklyTarget}</strong>/wk <button onClick={() => { const v = prompt('Weekly routine target:', routineWeeklyTarget); if (v) updateTarget(v); }} className="text-indigo-500 underline cursor-pointer ml-1" style={{background:'none',border:'none',fontSize:'inherit'}}>edit</button></span>
            : <button onClick={() => { const v = prompt('Set weekly routine slot target:','200'); if(v) updateTarget(v); }} className="text-indigo-500 underline cursor-pointer" style={{background:'none',border:'none',fontSize:'inherit'}}>Set routine target</button>}
        </div>
      </div>

      {/* Detail popup */}
      {detailDay && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr} — who and where</span>
            <button onClick={() => setSelectedDay(null)} className="text-white/60 hover:text-white text-sm font-bold" style={{background:'none',border:'none',cursor:'pointer'}}>✕</button>
          </div>
          <div className="grid grid-cols-3 gap-6 p-5">
            {[{label:'AM urgent',slots:detailDay.amS,target:detailDay.amT,list:detailClin.am,col:'#ef4444'},
              {label:'PM urgent',slots:detailDay.pmS,target:detailDay.pmT,list:detailClin.pm,col:'#3b82f6'},
              {label:'Routine',slots:detailDay.rTotal,list:detailClin.rout,col:'#8b5cf6'}].map((sec,i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold uppercase" style={{color:sec.col}}>{sec.label}</span>
                  <span className="text-sm font-extrabold" style={{color:sec.col}}>{sec.slots}</span>
                  {sec.target > 0 && <span className="text-[10px] text-slate-400">/ {sec.target}</span>}
                </div>
                <div className="space-y-1.5">
                  {sec.list.map((c,j) => {
                    const lc = c.loc ? LOCATION_COLOURS[c.loc] : null;
                    return <div key={j} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                      {lc && <div className="w-2 h-5 rounded-sm" style={{background:lc.bg}}/>}
                      <span className="text-xs text-slate-700 flex-1 truncate">{c.name}</span>
                      <span className="text-xs font-bold text-slate-800">{c.slots + c.bkd}</span>
                    </div>;
                  })}
                  {sec.list.length === 0 && <div className="text-xs text-slate-300 py-3 text-center">No slots</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summaries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Short days */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-5 py-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
            <span className="text-xs font-semibold text-white">Urgent capacity below target</span>
            <span className="text-xs text-white/60 ml-auto">{shortDays.length}</span>
          </div>
          <div className="p-4 space-y-2">
            {shortDays.length === 0 && <p className="text-sm text-slate-400 text-center py-3">All days meeting target</p>}
            {shortDays.slice(0,8).map((d,i) => {
              const urg = d.amS+d.pmS, targ = d.amT+d.pmT;
              return <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => setSelectedDay(d.isoKey)}>
                <span className="text-xs font-semibold text-slate-700 w-20">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${Math.min((urg/targ)*100,100)}%`, background: urg < targ*0.8 ? '#ef4444' : '#f59e0b'}}/>
                </div>
                <span className="text-xs font-bold text-red-600">{urg}</span>
                <span className="text-[10px] text-slate-400">/ {targ}</span>
              </div>;
            })}
          </div>
        </div>

        {/* Top 5 demand vs capacity gauges */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-amber-500 px-5 py-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span className="text-xs font-semibold text-white">Highest demand days</span>
          </div>
          <div className="p-4 space-y-3">
            {topDemandDays.map((d,i) => {
              const urg = d.amS + d.pmS;
              const coverage = d.needed > 0 ? Math.round((urg / d.needed) * 100) : 100;
              const arcPct = Math.min(coverage, 120) / 120;
              const col = coverage >= 90 ? '#10b981' : coverage >= 80 ? '#f59e0b' : '#ef4444';
              const verdict = coverage >= 90 ? 'OK' : coverage >= 80 ? 'Tight' : 'Short';
              return <div key={i} className="flex items-center gap-4 px-3 py-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => setSelectedDay(d.isoKey)}>
                <span className="text-xs font-semibold text-slate-700 w-20">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                <svg viewBox="0 0 60 34" style={{width:48,height:28,flexShrink:0}}>
                  <path d="M 6 30 A 24 24 0 0 1 54 30" fill="none" stroke="#e2e8f0" strokeWidth="5" strokeLinecap="round"/>
                  <path d="M 6 30 A 24 24 0 0 1 54 30" fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${arcPct * 75} 75`}/>
                  <text x="30" y="28" textAnchor="middle" fill={col} style={{fontSize:9,fontWeight:800}}>{coverage}%</text>
                </svg>
                <div className="flex-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{background:d.dc.bg,color:d.dc.text}}>{d.predicted} predicted</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold" style={{color:col}}>{verdict}</div>
                  <div className="text-[10px] text-slate-400">{urg} slots / {d.needed} need</div>
                </div>
              </div>;
            })}
          </div>
        </div>

        {/* Routine weeks */}
        {routineWeeklyTarget > 0 && (
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-3 flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <span className="text-xs font-semibold text-white">Weekly routine capacity</span>
            </div>
            <div className="p-4 space-y-2">
              {weeks.filter(w => w.wR > 0).map((w,i) => {
                const vb = vibrantBand(w.wR, routineWeeklyTarget);
                return <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50">
                  <span className="text-xs font-semibold text-slate-700 w-12">Wk {weeks.indexOf(w)+1}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full" style={{width:`${Math.min((w.wR/routineWeeklyTarget)*100,100)}%`,background:vb.bg}}/>
                  </div>
                  <span className="text-xs font-bold" style={{color:vb.bg}}>{w.wR}</span>
                  <span className="text-[10px] text-slate-400">/ {routineWeeklyTarget}</span>
                </div>;
              })}
            </div>
          </div>
        )}

        {/* Week trend */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-slate-700 to-slate-600 px-5 py-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span className="text-xs font-semibold text-white">Week-on-week</span>
          </div>
          <div className="p-4 space-y-2">
            {weeks.filter(w => w.wUrg > 0).map((w,i,arr) => {
              const delta = i > 0 ? w.wUrg - arr[i-1].wUrg : 0;
              return <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-50">
                <span className="text-xs font-semibold text-slate-700 w-12">Wk {weeks.indexOf(w)+1}</span>
                <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-slate-800">{w.wUrg}</span><span className="text-[10px] text-slate-400">urg</span></div>
                <div className="flex items-center gap-1.5"><span className="text-sm font-bold" style={{color:'#8b5cf6'}}>{w.wR}</span><span className="text-[10px] text-slate-400">rout</span></div>
                {delta !== 0 && <span className={`text-xs font-bold ml-auto ${delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{delta > 0 ? '↑' : '↓'}{Math.abs(delta)} urg</span>}
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
