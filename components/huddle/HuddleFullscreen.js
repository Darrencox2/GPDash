'use client';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { STAFF_GROUPS, matchesStaffMember } from '@/lib/data';
import { getHuddleCapacity, getTodayDateStr, getCliniciansForDate, getNDayAvailability } from '@/lib/huddle';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS, DOW_NAMES } from '@/lib/demandPredictor';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ROLE_COLOURS = {
  'GP Partner': { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' },
  'Associate Partner': { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' },
  'Salaried GP': { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' },
  'Locum': { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' },
  'GP Registrar': { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' },
  'Medical Student': { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' },
  'ANP': { bg: '#f5f3ff', init: '#ede9fe', text: '#6d28d9' },
  'Paramedic Practitioner': { bg: '#f5f3ff', init: '#ede9fe', text: '#6d28d9' },
  'Pharmacist': { bg: '#f5f3ff', init: '#ede9fe', text: '#6d28d9' },
  'Physiotherapist': { bg: '#f5f3ff', init: '#ede9fe', text: '#6d28d9' },
  'Practice Nurse': { bg: '#ecfdf5', init: '#d1fae5', text: '#047857' },
  'Nurse Associate': { bg: '#ecfdf5', init: '#d1fae5', text: '#047857' },
  'HCA': { bg: '#ecfdf5', init: '#d1fae5', text: '#047857' },
};
const GROUP_COLOURS = {
  gp: { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' },
  nursing: { bg: '#ecfdf5', init: '#d1fae5', text: '#047857', dot: '#10b981' },
  allied: { bg: '#f5f3ff', init: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
  admin: { bg: '#f8fafc', init: '#f1f5f9', text: '#64748b', dot: '#94a3b8' },
};
const DEMAND_COLOURS = {
  low: { bg: '#d1fae5', text: '#065f46', colour: '#10b981', label: 'Low demand' },
  normal: { bg: '#dbeafe', text: '#1e40af', colour: '#3b82f6', label: 'Normal' },
  high: { bg: '#fef3c7', text: '#92400e', colour: '#f59e0b', label: 'High demand' },
  'very-high': { bg: '#fee2e2', text: '#991b1b', colour: '#ef4444', label: 'Very high' },
  closed: { bg: '#f1f5f9', text: '#64748b', colour: '#94a3b8', label: 'Closed' },
};
const MSG_COLOURS = [
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#ede9fe', text: '#5b21b6' },
];

export default function HuddleFullscreen({ data, huddleData, onExit }) {
  const containerRef = useRef(null);
  const [clock, setClock] = useState(new Date());
  const [weather, setWeather] = useState(null);
  const [demandData, setDemandData] = useState(null);
  const [tickerIdx, setTickerIdx] = useState(0);

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  const dateKey = today.toISOString().split('T')[0];
  const todayDateStr = getTodayDateStr();
  const hs = data?.huddleSettings || {};

  // Clock
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t); }, []);

  // Ticker
  const messages = ensureArray(data?.huddleMessages || []);
  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => setTickerIdx(i => (i + 1) % messages.length), 60000);
    return () => clearInterval(t);
  }, [messages.length]);

  // Fullscreen API
  useEffect(() => {
    const el = containerRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    const onFs = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e) => { if (e.key === 'Escape') onExit(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onExit]);

  // Demand + weather
  useEffect(() => {
    async function load() {
      const w = await getWeatherForecast(16);
      setWeather(w);
      const todayDk = today.toISOString().split('T')[0];
      const todayW = w?.[todayDk] || null;
      const todayPred = predictDemand(today, todayW);

      const chartDays = [];
      // Past 5 working days
      const past = [];
      for (let i = 1; i <= 20 && past.length < 5; i++) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        if (d.getDay() > 0 && d.getDay() < 6) {
          const dk = d.toISOString().split('T')[0];
          past.unshift({ ...predictDemand(d, w?.[dk] || null), dayName: ['S','M','T','W','T','F','S'][d.getDay()], isPast: true, isToday: false });
        }
      }
      chartDays.push(...past);
      chartDays.push({ ...todayPred, dayName: 'Today', isPast: false, isToday: true, weather: todayW });
      // Future 5 working days
      for (let i = 1, c = 0; i <= 20 && c < 5; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        if (d.getDay() > 0 && d.getDay() < 6) {
          const dk = d.toISOString().split('T')[0];
          chartDays.push({ ...predictDemand(d, w?.[dk] || null), dayName: ['S','M','T','W','T','F','S'][d.getDay()], isPast: false, isToday: false });
          c++;
        }
      }
      setDemandData({ today: { ...todayPred, weather: todayW }, chartDays });
    }
    load();
  }, [today]);

  // Who's in
  const visibleStaff = allClinicians.filter(c => c.showWhosIn !== false && c.status !== 'left' && c.status !== 'administrative');
  const todayCsvClinicians = useMemo(() => {
    if (!huddleData?.dates?.includes(todayDateStr)) return [];
    return getCliniciansForDate(huddleData, todayDateStr);
  }, [huddleData, todayDateStr]);
  const csvPresentIds = useMemo(() => {
    const s = new Set();
    allClinicians.forEach(c => { if (todayCsvClinicians.some(n => matchesStaffMember(n, c))) s.add(c.id); });
    return s;
  }, [allClinicians, todayCsvClinicians]);
  const hasCSV = todayCsvClinicians.length > 0;
  const absenceMap = useMemo(() => {
    const m = {};
    ensureArray(data.plannedAbsences).forEach(a => { if (dateKey >= a.startDate && dateKey <= a.endDate) m[a.clinicianId] = a.reason || 'Leave'; });
    return m;
  }, [data.plannedAbsences, dateKey]);
  const categories = useMemo(() => {
    const inP = [], leave = [], off = [];
    visibleStaff.forEach(p => {
      if (p.longTermAbsent || p.status === 'longTermAbsent') { leave.push({ person: p, reason: 'LTA' }); return; }
      if (absenceMap[p.id]) { leave.push({ person: p, reason: absenceMap[p.id] }); return; }
      if (hasCSV && csvPresentIds.has(p.id)) { inP.push({ person: p }); return; }
      if (!hasCSV && p.buddyCover && ensureArray(data.weeklyRota?.[dayName])?.includes(p.id)) { inP.push({ person: p }); return; }
      off.push({ person: p });
    });
    return { inPractice: inP, leaveAbsent: leave, dayOff: off };
  }, [visibleStaff, csvPresentIds, absenceMap, hasCSV, data.weeklyRota, dayName]);
  const gpTeam = categories.inPractice.filter(e => e.person.group === 'gp');
  const nursingTeam = categories.inPractice.filter(e => e.person.group === 'nursing');
  const othersTeam = categories.inPractice.filter(e => e.person.group !== 'gp' && e.person.group !== 'nursing');

  // Capacity
  const displayDate = huddleData?.dates?.includes(todayDateStr) ? todayDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs) : null;
  const mergedClinicians = useMemo(() => {
    if (!capacity) return [];
    const m = {};
    [...(capacity.am?.byClinician || []), ...(capacity.pm?.byClinician || [])].forEach(c => {
      if (!m[c.name]) m[c.name] = { name: c.name, available: 0, embargoed: 0, booked: 0 };
      m[c.name].available += c.available || 0;
      m[c.name].embargoed += c.embargoed || 0;
      m[c.name].booked += c.booked || 0;
    });
    return Object.values(m).sort((a, b) => (b.available + b.embargoed) - (a.available + a.embargoed));
  }, [capacity]);
  const urgentAm = capacity?.am?.total || 0;
  const urgentPm = capacity?.pm?.total || 0;
  const urgentTotal = urgentAm + urgentPm;

  // Routine gauges
  const routineGauges = useMemo(() => {
    if (!huddleData) return [{ pct: 0 }, { pct: 0 }, { pct: 0 }, { pct: 0 }];
    const allOverrides = {};
    (hs?.knownSlotTypes || []).forEach(s => { allOverrides[s] = true; });
    if (huddleData?.allSlotTypes) huddleData.allSlotTypes.forEach(s => { allOverrides[s] = true; });
    const days = getNDayAvailability(huddleData, hs, 30, allOverrides);
    return [
      { label: '0-7 days', start: 0, end: 7 },
      { label: '8-14 days', start: 7, end: 14 },
      { label: '15-21 days', start: 14, end: 21 },
      { label: '22-28 days', start: 21, end: 28 },
    ].map(({ label, start, end }) => {
      const slice = days.slice(start, end).filter(d => d.available !== null && !d.isWeekend);
      const avail = slice.reduce((s, d) => s + (d.available || 0) + (d.embargoed || 0), 0);
      const booked = slice.reduce((s, d) => s + (d.booked || 0), 0);
      const total = avail + booked;
      const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
      const colour = pct > 50 ? '#10b981' : pct >= 20 ? '#f59e0b' : '#ef4444';
      return { label, pct, colour };
    });
  }, [huddleData, hs]);

  // Demand
  const t = demandData?.today;
  const dc = t ? (DEMAND_COLOURS[t.demandLevel] || DEMAND_COLOURS.normal) : DEMAND_COLOURS.normal;
  const dowIdx = today.getDay() > 0 && today.getDay() < 6 ? (today.getDay() + 6) % 7 : 0;
  const monthIdx = today.getMonth();
  const typicalDayMonth = dowIdx < 5 ? Math.round(BASELINE + DOW_EFFECTS[dowIdx] + MONTH_EFFECTS[monthIdx]) : 0;
  const vsPct = t && typicalDayMonth > 0 ? Math.round(((t.predicted - typicalDayMonth) / typicalDayMonth) * 100) : 0;
  const chartMax = demandData ? Math.max(...demandData.chartDays.filter(d => !d.isWeekend && !d.isBankHoliday).map(d => d.predicted || 0), 1) : 1;
  const tw = demandData?.today?.weather;

  // Top factors
  const topFactors = useMemo(() => {
    if (!t?.factors) return [];
    const f = t.factors;
    const list = [];
    if (f.dayOfWeek) list.push({ l: f.dayOfWeek.day?.slice(0,3), v: f.dayOfWeek.effect });
    if (f.month) list.push({ l: MONTH_SHORT[f.month.month-1], v: f.month.effect });
    if (f.trend) list.push({ l: 'Trend', v: f.trend.effect });
    if (f.weather) list.push({ l: `${Math.round(f.weather.actualTemp)}°`, v: f.weather.tempEffect });
    if (f.endOfMonth) list.push({ l: `${today.getDate()}th`, v: f.endOfMonth });
    if (f.firstDayBack) list.push({ l: '1st back', v: f.firstDayBack });
    if (f.schoolHoliday) list.push({ l: 'Sch hol', v: f.schoolHoliday });
    if (f.firstWeekBack) list.push({ l: 'Term', v: f.firstWeekBack });
    if (f.shortWeek) list.push({ l: `${f.shortWeek.workingDays}d wk`, v: f.shortWeek.effect });
    list.sort((a,b) => Math.abs(b.v) - Math.abs(a.v));
    return list.slice(0, 3);
  }, [t, today]);

  const PersonCard = ({ person, delay, reason }) => {
    const gc = GROUP_COLOURS[person.group] || GROUP_COLOURS.admin;
    const rc = ROLE_COLOURS[person.role] || { bg: gc.bg, init: gc.init, text: gc.text };
    return (
      <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 mb-1 opacity-0"
        style={{ background: rc.bg, animation: `slideIn 0.4s ease ${delay}s forwards` }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0"
          style={{ background: rc.init, color: rc.text }}>{person.initials}</div>
        <span className="text-xs text-slate-900 truncate flex-1">{person.name}</span>
        {reason && <span className="text-[10px] text-red-500 flex-shrink-0">{reason}</span>}
      </div>
    );
  };

  const GaugeSVG = ({ pct, colour, label, delay }) => {
    const size = 110, r = 42, sw = 8, cx = size/2, cy = size/2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (circ * pct / 100);
    const glowDur = `${6 + delay * 2}s`;
    return (
      <div className="text-center opacity-0" style={{ animation: `fadeScale 0.6s ease ${0.3 + delay * 0.15}s forwards` }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
          style={{ filter: 'drop-shadow(0 0 2px rgba(16,185,129,0.2))', animation: `gaugeGlow ${glowDur} ease-in-out infinite` }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={colour} strokeWidth={sw} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ animation: `gaugeSweep 1.2s ease ${0.5 + delay * 0.2}s forwards`, '--target-offset': offset }} />
          <text x={cx} y={cy - 2} textAnchor="middle" fill={colour} style={{ fontSize: '24px', fontWeight: 800 }}>{pct}%</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '11px' }}>avail</text>
        </svg>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden"
      style={{ background: '#f8fafc', fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeScale { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.5) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes badgePop { from { opacity: 0; transform: scale(0.5); } to { opacity: 1; transform: scale(1); } }
        @keyframes growBar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes liveDot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.82; } }
        @keyframes gaugeGlow { 0%, 100% { filter: drop-shadow(0 0 2px rgba(16,185,129,0.15)); } 50% { filter: drop-shadow(0 0 8px rgba(16,185,129,0.4)); } }
        @keyframes gaugeSweep { to { stroke-dashoffset: var(--target-offset); } }
        @keyframes barBreath { 0%, 100% { opacity: 1; } 50% { opacity: 0.88; } }
      `}</style>

      {/* Header */}
      <div className="flex items-center px-5 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <div className="bg-emerald-500 rounded-lg px-3.5 py-1 text-center">
            <div className="text-xl font-extrabold text-white leading-none">{today.getDate()}</div>
            <div className="text-[8px] text-white/80 uppercase">{MONTH_SHORT[today.getMonth()]}</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">{dayName}</div>
            <div className="text-xs text-slate-400">{today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: 'liveDot 2s ease infinite' }} />
            <span className="text-xs text-slate-400">Live</span>
          </div>
          {tw && <span className="text-xs text-slate-500">{Math.round(tw.temp)}°C · Feels {Math.round(tw.feelsLike)}°C{tw.precipMm > 0 ? ` · ${Math.round(tw.precipMm)}mm` : ''}</span>}
          <div className="text-3xl font-light text-slate-300 tabular-nums">{clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
          <button onClick={onExit} className="px-3 py-1 rounded-lg border border-slate-200 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors">Exit fullscreen</button>
        </div>
      </div>

      {/* Noticeboard ticker */}
      {messages.length > 0 && (
        <div className="flex items-center gap-3 px-5 bg-gradient-to-r from-slate-800 to-slate-700 flex-shrink-0 overflow-hidden" style={{ height: 38 }}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">Notice</span>
          </div>
          <div className="flex-1 overflow-hidden" style={{ height: 38 }}>
            <div className="flex flex-col transition-transform duration-700" style={{ transform: `translateY(-${tickerIdx * 38}px)` }}>
              {messages.map((m, i) => {
                const mc = MSG_COLOURS[i % MSG_COLOURS.length];
                return (
                  <div key={i} className="flex items-center gap-2 flex-shrink-0 text-sm" style={{ height: 38 }}>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: mc.bg, color: mc.text }}>{m.author} {m.time}</span>
                    <span className="text-slate-200 truncate">{m.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 4-quadrant grid */}
      <div className="grid grid-cols-2 flex-1 gap-2 p-2 min-h-0">

        {/* TL: Demand predictor */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-3.5 py-2 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <span className="text-xs font-semibold text-white">Predicted demand</span>
            </div>
            <span className="text-[10px] text-slate-500">Model v2.0</span>
          </div>
          <div className="flex gap-3 p-3 flex-1">
            <div className="min-w-[130px] flex flex-col">
              <div className="text-[52px] font-extrabold leading-none opacity-0" style={{ color: dc.colour, animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards' }}>{t?.predicted || '—'}</div>
              <div className="text-xs text-slate-400 mt-1">patient requests</div>
              {t && <div className="mt-1.5 opacity-0" style={{ animation: 'badgePop 0.6s ease 0.3s forwards' }}><span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: dc.bg, color: dc.text }}>{dc.label}</span></div>}
              {t && vsPct !== 0 && <div className="text-[10px] text-slate-400 mt-1.5" style={{ animation: 'breathe 4s ease-in-out 2s infinite' }}><span style={{ color: dc.colour }}>{Math.abs(vsPct)}% {vsPct >= 0 ? 'above' : 'below'}</span> typical {DOW_NAMES[dowIdx]} in {MONTH_SHORT[monthIdx]}</div>}
              <div className="flex gap-1 mt-auto pt-2">
                {topFactors.map((f, i) => (
                  <div key={i} className="flex-1 text-center p-1 bg-slate-50 rounded border border-slate-200 opacity-0" style={{ animation: `fadeScale 0.4s ease ${0.5 + i * 0.1}s forwards` }}>
                    <div className="text-[8px] text-slate-400">{f.l}</div>
                    <div className={`text-sm font-bold ${f.v >= 0 ? 'text-blue-500' : 'text-emerald-500'}`}>{f.v > 0 ? '+' : ''}{Math.round(f.v)}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 flex items-end gap-0.5">
              {demandData?.chartDays.map((d, i) => {
                const pct = Math.max(8, (d.predicted / chartMax) * 100);
                const delay = 0.1 + i * 0.05;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5">
                    {d.isToday && <div className="text-[9px] font-bold opacity-0" style={{ color: '#f59e0b', animation: `fadeScale 0.4s ease 1s forwards` }}>{d.predicted}</div>}
                    <div className="w-full rounded-sm" style={{
                      height: `${pct}%`, transformOrigin: 'bottom',
                      background: d.isToday ? '#f59e0b' : d.isPast ? '#cbd5e1' : '#bfdbfe',
                      border: !d.isToday && !d.isPast ? '1px dashed #93c5fd' : 'none',
                      animation: `growBar 0.8s ease ${delay}s forwards${d.isToday ? ', barBreath 5s ease 3s infinite' : ''}`,
                      transform: 'scaleY(0)',
                    }} />
                    <span className={`text-[8px] ${d.isToday ? 'text-amber-500 font-semibold' : 'text-slate-400'}`}>{d.dayName}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* TR: Urgent on the day */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-3.5 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold text-white">Urgent on the day</span>
            <span className="text-[10px] text-white/70">Available slots</span>
          </div>
          <div className="p-3 flex-1 flex flex-col">
            <div className="flex items-center justify-center gap-6 mb-3">
              <div className="text-center"><div className="text-4xl font-extrabold text-amber-500 leading-none opacity-0" style={{ animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.1s forwards' }}>{urgentAm}</div><div className="text-xs text-slate-400 mt-1">Morning</div></div>
              <div className="w-px h-9 bg-slate-200" />
              <div className="text-center"><div className="text-[56px] font-extrabold text-emerald-500 leading-none opacity-0" style={{ animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.2s forwards' }}>{urgentTotal}</div><div className="text-xs text-slate-400 mt-1">Total</div></div>
              <div className="w-px h-9 bg-slate-200" />
              <div className="text-center"><div className="text-4xl font-extrabold text-blue-500 leading-none opacity-0" style={{ animation: 'popIn 0.6s cubic-bezier(0.34,1.56,0.64,1) 0.3s forwards' }}>{urgentPm}</div><div className="text-xs text-slate-400 mt-1">Afternoon</div></div>
            </div>
            <div className="grid grid-cols-2 gap-1 flex-1 content-start">
              {mergedClinicians.slice(0, 6).map((c, i) => {
                const matched = allClinicians.find(tc => matchesStaffMember(c.name, tc));
                const name = matched?.name || c.name;
                return (
                  <div key={i} className="flex items-center justify-between px-2.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200 opacity-0"
                    style={{ animation: `slideIn 0.4s ease ${0.3 + i * 0.1}s forwards` }}>
                    <span className="text-xs text-slate-600 truncate mr-2">{name}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-xs font-semibold">{c.available}</span>
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-xs font-semibold">{c.embargoed}</span>
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs font-semibold">{c.booked}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* BL: Who's in */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-3.5 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold text-white">Who's in today</span>
            <span className="text-[10px] text-white/60">{categories.inPractice.length} in · {categories.leaveAbsent.length} absent</span>
          </div>
          <div className="p-3 flex-1 overflow-hidden">
            <div className="grid grid-cols-3 gap-2 h-full">
              <div className="overflow-hidden">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Clinicians <span className="text-slate-300">{gpTeam.length}</span></div>
                {gpTeam.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.1 + i * 0.05} />)}
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Nursing <span className="text-slate-300">{nursingTeam.length}</span></div>
                {nursingTeam.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.15 + i * 0.05} />)}
                {othersTeam.length > 0 && (
                  <>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-2 mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Others <span className="text-slate-300">{othersTeam.length}</span></div>
                    {othersTeam.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.3 + i * 0.05} />)}
                  </>
                )}
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Absent <span className="text-slate-300">{categories.leaveAbsent.length}</span></div>
                {categories.leaveAbsent.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.2 + i * 0.05} reason={e.reason} />)}
                {categories.leaveAbsent.length === 0 && <div className="text-xs text-slate-300 px-2">None</div>}
                {categories.dayOff.length > 0 && <div className="text-[10px] text-slate-300 mt-3">+ {categories.dayOff.length} day off</div>}
              </div>
            </div>
          </div>
        </div>

        {/* BR: Routine capacity gauges */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-3.5 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-xs font-semibold text-white">Routine capacity</span>
            <span className="text-[10px] text-white/70">30-day booking gauges</span>
          </div>
          <div className="p-3 flex-1 flex items-center justify-center">
            <div className="flex gap-5 justify-center items-center">
              {routineGauges.map((g, i) => <GaugeSVG key={i} pct={g.pct} colour={g.colour} label={g.label} delay={i} />)}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
