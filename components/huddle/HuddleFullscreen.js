'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { STAFF_GROUPS, matchesStaffMember } from '@/lib/data';
import { getHuddleCapacity, getTodayDateStr, getCliniciansForDate } from '@/lib/huddle';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS, DOW_NAMES } from '@/lib/demandPredictor';

const MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEMAND_COLOURS = {
  low: { bg: '#10b98122', text: '#34d399', label: 'LOW' },
  normal: { bg: '#3b82f622', text: '#60a5fa', label: 'NORMAL' },
  high: { bg: '#f59e0b22', text: '#fbbf24', label: 'HIGH' },
  'very-high': { bg: '#ef444422', text: '#f87171', label: 'VERY HIGH' },
  closed: { bg: '#64748b22', text: '#94a3b8', label: 'CLOSED' },
};

export default function HuddleFullscreen({ data, huddleData, onExit }) {
  const containerRef = useRef(null);
  const [clock, setClock] = useState(new Date());
  const [weather, setWeather] = useState(null);
  const [demandData, setDemandData] = useState(null);

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Enter browser fullscreen
  useEffect(() => {
    const el = containerRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    const onFsChange = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onExit]);

  // ESC key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onExit(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onExit]);

  // Load demand + weather
  useEffect(() => {
    async function load() {
      const w = await getWeatherForecast(16);
      setWeather(w);
      const today = new Date(); today.setHours(0,0,0,0);
      const todayDk = today.toISOString().split('T')[0];
      const todayW = w?.[todayDk] || null;
      const todayPred = predictDemand(today, todayW);

      // Build chart data: 5 past working days + today + 5 future working days
      const chartDays = [];
      let d = new Date(today);
      const pastDays = [];
      for (let i = 0; i < 20 && pastDays.length < 5; i++) {
        d = new Date(today); d.setDate(d.getDate() - (i + 1));
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          const dk = d.toISOString().split('T')[0];
          const pred = predictDemand(d, w?.[dk] || null);
          pastDays.unshift({ ...pred, date: d, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], isPast: true, isToday: false });
        }
      }
      chartDays.push(...pastDays);
      chartDays.push({ ...todayPred, date: today, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()], isPast: false, isToday: true, weather: todayW });
      for (let i = 0, count = 0; i < 20 && count < 5; i++) {
        d = new Date(today); d.setDate(d.getDate() + (i + 1));
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          const dk = d.toISOString().split('T')[0];
          const pred = predictDemand(d, w?.[dk] || null);
          chartDays.push({ ...pred, date: d, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], isPast: false, isToday: false });
          count++;
        }
      }
      setDemandData({ today: { ...todayPred, weather: todayW }, chartDays });
    }
    load();
  }, []);

  // Today's data
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  const dateKey = today.toISOString().split('T')[0];

  // Who's in
  const visibleStaff = allClinicians.filter(c => c.showWhosIn !== false && c.status !== 'left' && c.status !== 'administrative');

  const todayDateStr = getTodayDateStr();
  const todayCsvClinicians = useMemo(() => {
    if (!huddleData) return [];
    const dd = huddleData.dates?.includes(todayDateStr) ? todayDateStr : null;
    if (!dd) return [];
    return getCliniciansForDate(huddleData, dd);
  }, [huddleData, todayDateStr]);

  const csvPresentIds = useMemo(() => {
    const matched = new Set();
    allClinicians.forEach(c => {
      if (todayCsvClinicians.some(csvName => matchesStaffMember(csvName, c))) matched.add(c.id);
    });
    return matched;
  }, [allClinicians, todayCsvClinicians]);

  const hasCSV = todayCsvClinicians.length > 0;
  const absenceMap = useMemo(() => {
    const map = {};
    ensureArray(data.plannedAbsences).forEach(a => {
      if (dateKey >= a.startDate && dateKey <= a.endDate) map[a.clinicianId] = a.reason || 'Leave';
    });
    return map;
  }, [data.plannedAbsences, dateKey]);

  const categories = useMemo(() => {
    const inPractice = [], leaveAbsent = [], dayOff = [];
    visibleStaff.forEach(person => {
      if (person.longTermAbsent || person.status === 'longTermAbsent') { leaveAbsent.push({ person, reason: 'LTA' }); return; }
      if (absenceMap[person.id]) { leaveAbsent.push({ person, reason: absenceMap[person.id] }); return; }
      if (hasCSV && csvPresentIds.has(person.id)) { inPractice.push({ person }); return; }
      if (!hasCSV && person.buddyCover && ensureArray(data.weeklyRota?.[dayName])?.includes(person.id)) { inPractice.push({ person }); return; }
      dayOff.push({ person });
    });
    return { inPractice, leaveAbsent, dayOff };
  }, [visibleStaff, csvPresentIds, absenceMap, hasCSV, data.weeklyRota, dayName]);

  const gpTeam = categories.inPractice.filter(e => e.person.group === 'gp');
  const nursingTeam = categories.inPractice.filter(e => e.person.group === 'nursing');
  const othersTeam = categories.inPractice.filter(e => e.person.group !== 'gp' && e.person.group !== 'nursing');

  // Capacity
  const hs = data?.huddleSettings || {};
  const displayDate = huddleData?.dates?.includes(todayDateStr) ? todayDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs) : null;
  const urgentAm = capacity?.am?.total || 0;
  const urgentPm = capacity?.pm?.total || 0;
  const urgentTotal = urgentAm + urgentPm;
  const embAm = capacity?.am?.embargoed || 0;
  const embPm = capacity?.pm?.embargoed || 0;

  // Demand comparison
  const t = demandData?.today;
  const dc = t ? (DEMAND_COLOURS[t.demandLevel] || DEMAND_COLOURS.normal) : DEMAND_COLOURS.normal;
  const dowIdx = today.getDay() > 0 && today.getDay() < 6 ? (today.getDay() + 6) % 7 : 0;
  const monthIdx = today.getMonth();
  const typicalDayMonth = dowIdx < 5 ? Math.round(BASELINE + DOW_EFFECTS[dowIdx] + MONTH_EFFECTS[monthIdx]) : 0;
  const vsPct = t && typicalDayMonth > 0 ? Math.round(((t.predicted - typicalDayMonth) / typicalDayMonth) * 100) : 0;

  // Chart max
  const chartMax = demandData ? Math.max(...demandData.chartDays.filter(d => !d.isWeekend && !d.isBankHoliday).map(d => d.predicted || 0), 1) : 1;

  // Noticeboard messages
  const messages = ensureArray(data?.huddleMessages || []).slice(-3);

  // Weather
  const tw = demandData?.today?.weather;

  const PersonPill = ({ person, colour, bgColour }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', background: bgColour, marginBottom: '2px', fontSize: '11px' }}>
      <span style={{ color: colour, fontWeight: 600, minWidth: '18px' }}>{person.initials}</span>
      <span style={{ color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</span>
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#0f172a', color: '#e2e8f0', fontFamily: "'DM Sans', system-ui, sans-serif", display: 'flex', flexDirection: 'column', padding: '12px 16px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: '#10b981', borderRadius: '8px', padding: '4px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'white', lineHeight: 1 }}>{today.getDate()}</div>
            <div style={{ fontSize: '9px', color: 'white', opacity: 0.8, textTransform: 'uppercase' }}>{MONTH_NAMES_SHORT[today.getMonth()]}</div>
          </div>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>{dayName}</div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>{today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {tw && <span style={{ fontSize: '12px', color: '#64748b' }}>{Math.round(tw.temp)}°C · Feels {Math.round(tw.feelsLike)}°C{tw.precipMm > 0 ? ` · ${Math.round(tw.precipMm)}mm` : ''}</span>}
          <div style={{ fontSize: '32px', fontWeight: 300, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          <button onClick={onExit} style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #334155', color: '#94a3b8', fontSize: '11px', background: 'none', cursor: 'pointer' }}>ESC to exit</button>
        </div>
      </div>

      {/* Row 1: Demand band */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexShrink: 0 }}>
        {/* Demand hero */}
        <div style={{ flex: '0 0 200px', background: '#1e293b', borderRadius: '10px', padding: '14px' }}>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>Demand</div>
          <div style={{ fontSize: '48px', fontWeight: 800, color: dc.text, lineHeight: 1, margin: '4px 0' }}>{t?.predicted || '—'}</div>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>patient requests</div>
          {t && <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 6px', borderRadius: '4px', background: dc.bg, color: dc.text, fontSize: '9px', fontWeight: 600 }}>{dc.label}</span>}
          {t && vsPct !== 0 && (
            <div style={{ fontSize: '9px', color: '#64748b', marginTop: '4px' }}>
              <span style={{ color: vsPct >= 0 ? '#fbbf24' : '#34d399' }}>{Math.abs(vsPct)}% {vsPct >= 0 ? 'above' : 'below'}</span>
              {' '}typical {DOW_NAMES[dowIdx]} in {MONTH_NAMES_SHORT[monthIdx]}
            </div>
          )}
          {/* Compact factors */}
          {t && (
            <div style={{ display: 'flex', gap: '2px', marginTop: '8px' }}>
              {(() => {
                const f = t.factors || {};
                const factors = [];
                if (f.dayOfWeek) factors.push({ l: f.dayOfWeek.day?.slice(0,3), v: f.dayOfWeek.effect });
                if (f.month) factors.push({ l: MONTH_NAMES_SHORT[f.month.month-1], v: f.month.effect });
                if (f.trend) factors.push({ l: 'Trend', v: f.trend.effect });
                if (f.weather) factors.push({ l: `${Math.round(f.weather.actualTemp)}°`, v: f.weather.tempEffect });
                if (f.endOfMonth) factors.push({ l: `${today.getDate()}th`, v: f.endOfMonth });
                if (f.firstDayBack) factors.push({ l: '1st back', v: f.firstDayBack });
                if (f.schoolHoliday) factors.push({ l: 'Sch hol', v: f.schoolHoliday });
                factors.sort((a,b) => Math.abs(b.v) - Math.abs(a.v));
                return factors.slice(0,5).map((fac,i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', padding: '3px 2px', background: '#0f172a', borderRadius: '4px' }}>
                    <div style={{ fontSize: '8px', color: '#64748b' }}>{fac.l}</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: fac.v >= 0 ? '#60a5fa' : '#34d399' }}>{fac.v > 0 ? '+' : ''}{Math.round(fac.v)}</div>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Bar chart */}
        <div style={{ flex: 1, background: '#1e293b', borderRadius: '10px', padding: '12px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '3px' }}>
            {demandData?.chartDays.map((d, i) => {
              const pct = Math.max(8, (d.predicted / chartMax) * 100);
              const isToday = d.isToday;
              const isPast = d.isPast;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: '3px' }}>
                  {isToday && <div style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b' }}>{d.predicted}</div>}
                  <div style={{
                    width: '100%', borderRadius: '3px', height: `${pct}%`,
                    background: isToday ? '#f59e0b' : isPast ? '#334155' : '#1e3a5f',
                    border: !isToday && !isPast ? '1px dashed #38bdf855' : 'none',
                    boxShadow: isToday ? '0 0 10px #f59e0b44' : 'none',
                  }} />
                  <span style={{ fontSize: '9px', color: isToday ? '#f59e0b' : '#475569', fontWeight: isToday ? 600 : 400 }}>{d.dayName}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Urgent capacity */}
        <div style={{ flex: '0 0 180px', background: '#1e293b', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
          <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Urgent slots</div>
          {capacity ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <div><div style={{ fontSize: '24px', fontWeight: 800, color: '#fbbf24' }}>{urgentAm}</div><div style={{ fontSize: '8px', color: '#64748b' }}>AM</div></div>
                <div style={{ width: '1px', height: '24px', background: '#334155' }} />
                <div><div style={{ fontSize: '36px', fontWeight: 800, color: '#10b981' }}>{urgentTotal}</div><div style={{ fontSize: '8px', color: '#64748b' }}>Total</div></div>
                <div style={{ width: '1px', height: '24px', background: '#334155' }} />
                <div><div style={{ fontSize: '24px', fontWeight: 800, color: '#60a5fa' }}>{urgentPm}</div><div style={{ fontSize: '8px', color: '#64748b' }}>PM</div></div>
              </div>
              {(embAm + embPm) > 0 && <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '4px' }}>+{embAm + embPm} embargoed</div>}
            </>
          ) : (
            <div style={{ fontSize: '12px', color: '#475569', padding: '16px 0' }}>No CSV data</div>
          )}
        </div>
      </div>

      {/* Row 2: Who's in */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px', flex: 1, minHeight: 0 }}>
        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '10px 12px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }} /> Clinicians <span style={{ color: '#475569', fontWeight: 400 }}>{gpTeam.length}</span>
          </div>
          <div style={{ overflow: 'auto', maxHeight: 'calc(100% - 24px)' }}>
            {gpTeam.map(e => <PersonPill key={e.person.id} person={e.person} colour="#60a5fa" bgColour="#172554" />)}
          </div>
        </div>
        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '10px 12px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} /> Nursing <span style={{ color: '#475569', fontWeight: 400 }}>{nursingTeam.length}</span>
          </div>
          {nursingTeam.map(e => <PersonPill key={e.person.id} person={e.person} colour="#34d399" bgColour="#042f2e" />)}
          {othersTeam.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid #0f172a', margin: '6px 0', paddingTop: '6px', fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6' }} /> Others <span style={{ color: '#475569', fontWeight: 400 }}>{othersTeam.length}</span>
              </div>
              {othersTeam.map(e => <PersonPill key={e.person.id} person={e.person} colour="#a78bfa" bgColour="#1e1b4b" />)}
            </>
          )}
        </div>
        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '10px 12px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} /> Leave / absent <span style={{ color: '#475569', fontWeight: 400 }}>{categories.leaveAbsent.length}</span>
          </div>
          {categories.leaveAbsent.map(e => (
            <div key={e.person.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', background: '#450a0a', marginBottom: '2px', fontSize: '11px' }}>
              <span style={{ color: '#f87171', fontWeight: 600, minWidth: '18px' }}>{e.person.initials}</span>
              <span style={{ color: '#94a3b8', flex: 1 }}>{e.person.name}</span>
              <span style={{ fontSize: '9px', color: '#ef4444' }}>{e.reason}</span>
            </div>
          ))}
          {categories.leaveAbsent.length === 0 && <div style={{ fontSize: '11px', color: '#475569', padding: '4px 8px' }}>None</div>}
          <div style={{ borderTop: '1px solid #0f172a', margin: '6px 0', paddingTop: '6px', fontSize: '10px', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#475569' }} /> Day off <span style={{ color: '#475569', fontWeight: 400 }}>{categories.dayOff.length}</span>
          </div>
          {categories.dayOff.map(e => <PersonPill key={e.person.id} person={e.person} colour="#475569" bgColour="#0f172a" />)}
          {categories.dayOff.length === 0 && <div style={{ fontSize: '11px', color: '#475569', padding: '4px 8px' }}>None</div>}
        </div>
      </div>

      {/* Row 3: Noticeboard */}
      <div style={{ background: '#1e293b', borderRadius: '10px', padding: '8px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', flexShrink: 0 }}>Noticeboard</span>
          {messages.length > 0 ? messages.map((m, i) => (
            <div key={i} style={{ fontSize: '11px', color: '#94a3b8', padding: '2px 10px', background: '#0f172a', borderRadius: '6px' }}>
              <span style={{ color: '#475569', fontSize: '9px' }}>{m.author} {m.time}</span> — {m.text}
            </div>
          )) : (
            <div style={{ fontSize: '11px', color: '#475569' }}>No messages</div>
          )}
        </div>
      </div>
    </div>
  );
}
