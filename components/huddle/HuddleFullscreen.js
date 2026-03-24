'use client';
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { STAFF_GROUPS, matchesStaffMember } from '@/lib/data';
import { getHuddleCapacity, getTodayDateStr, getCliniciansForDate, getNDayAvailability } from '@/lib/huddle';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS, DOW_NAMES } from '@/lib/demandPredictor';

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DEFAULT_CAPACITY_CARDS = [
  { id: 'minorIllness', title: 'Minor Illness', colour: 'violet' },
  { id: 'physio', title: 'Physiotherapy', colour: 'sky' },
];
const DEMAND_COLOURS = {
  low: { bg: '#10b98122', text: '#34d399', label: 'LOW DEMAND' },
  normal: { bg: '#3b82f622', text: '#60a5fa', label: 'NORMAL' },
  high: { bg: '#f59e0b22', text: '#fbbf24', label: 'HIGH DEMAND' },
  'very-high': { bg: '#ef444422', text: '#f87171', label: 'VERY HIGH' },
  closed: { bg: '#64748b22', text: '#94a3b8', label: 'CLOSED' },
};
const MSG_COLOURS = [
  { bg: '#fef3c7', text: '#92400e' },
  { bg: '#dbeafe', text: '#1e40af' },
  { bg: '#fce7f3', text: '#9d174d' },
  { bg: '#d1fae5', text: '#065f46' },
  { bg: '#ede9fe', text: '#5b21b6' },
];

// ── Isolated clock ──────────────────────────────────────────────
const LiveClock = memo(function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return <div className="text-4xl font-light text-slate-300 tabular-nums">{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>;
});

// ── Isolated ticker ─────────────────────────────────────────────
const NoticeTicker = memo(function NoticeTicker({ messages }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (messages.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % messages.length), 60000);
    return () => clearInterval(t);
  }, [messages.length]);
  if (messages.length === 0) return null;
  const ITEM_H = 52;
  return (
    <div className="flex items-center gap-4 px-6 flex-shrink-0 overflow-hidden" style={{ height: ITEM_H, background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span className="text-sm font-semibold text-amber-400 uppercase tracking-wider">Noticeboard</span>
      </div>
      <div className="flex-1 overflow-hidden" style={{ height: ITEM_H }}>
        <div className="flex flex-col transition-transform duration-700" style={{ transform: `translateY(-${idx * ITEM_H}px)` }}>
          {messages.map((m, i) => {
            const mc = MSG_COLOURS[i % MSG_COLOURS.length];
            return (
              <div key={i} className="flex items-center gap-3 flex-shrink-0" style={{ height: ITEM_H }}>
                <span className="px-3 py-1 rounded-full text-sm font-semibold" style={{ background: mc.bg, color: mc.text }}>{m.author} {m.time}</span>
                <span className="text-base text-slate-200 truncate">{m.text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

// ── Isolated gauge ──────────────────────────────────────────────
const GaugeSVG = memo(function GaugeSVG({ pct, colour, label, delay }) {
  const size = 130, r = 50, sw = 10, cx = size/2, cy = size/2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * pct / 100);
  return (
    <div className="text-center fs-fadein" style={{ animationDelay: `${0.3 + delay * 0.15}s` }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="fs-gauge-glow">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={colour} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="fs-gauge-sweep" style={{ '--target': offset, animationDelay: `${0.5 + delay * 0.2}s` }} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill={colour} style={{ fontSize: '28px', fontWeight: 800 }}>{pct}%</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '12px' }}>avail</text>
      </svg>
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────
export default function HuddleFullscreen({ data, huddleData, onExit }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [demandData, setDemandData] = useState(null);

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  const dateKey = today.toISOString().split('T')[0];
  const todayDateStr = getTodayDateStr();
  const hs = data?.huddleSettings || {};
  const messages = ensureArray(data?.huddleMessages || []);

  // Fullscreen API
  useEffect(() => {
    const el = containerRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    const onFs = () => { if (!document.fullscreenElement) onExit(); };
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e) => { if (e.key === 'Escape') onExit(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [onExit]);

  // Demand + weather
  useEffect(() => {
    async function load() {
      const w = await getWeatherForecast(16);
      const todayDk = today.toISOString().split('T')[0];
      const todayW = w?.[todayDk] || null;
      const todayPred = predictDemand(today, todayW);
      const chartDays = [];
      for (let i = 14; i >= 1; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const isWE = d.getDay() === 0 || d.getDay() === 6;
        const dk = d.toISOString().split('T')[0];
        const pred = isWE ? null : predictDemand(d, w?.[dk] || null);
        chartDays.push({ predicted: pred?.predicted || null, date: d, dk, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], dayNum: d.getDate(), isPast: true, isToday: false, isBH: pred?.isBankHoliday || false, isWE, confidence: pred?.confidence || { low: null, high: null } });
      }
      chartDays.push({ ...todayPred, date: today, dk: todayDk, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()], dayNum: today.getDate(), isPast: false, isToday: true, isBH: false, isWE: false, weather: todayW });
      for (let i = 1; i <= 14; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const isWE = d.getDay() === 0 || d.getDay() === 6;
        const dk = d.toISOString().split('T')[0];
        const pred = isWE ? null : predictDemand(d, w?.[dk] || null);
        chartDays.push({ predicted: pred?.predicted || null, date: d, dk, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], dayNum: d.getDate(), isPast: false, isToday: false, isBH: pred?.isBankHoliday || false, isWE, confidence: pred?.confidence || { low: null, high: null } });
      }
      setDemandData({ today: { ...todayPred, weather: todayW }, chartDays });
    }
    load();
  }, [today]);

  // Chart.js (runs once)
  useEffect(() => {
    if (!demandData || !chartRef.current) return;
    const loadChart = async () => {
      if (!window.Chart) await new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'; s.onload = r; document.head.appendChild(s); });
      if (chartInstance.current) chartInstance.current.destroy();
      const days = demandData.chartDays;
      const todayIdx = days.findIndex(d => d.isToday);
      const isClosed = days.map(d => d.isWE || d.isBH);
      const isBH = days.map(d => d.isBH);
      const labels = days.map(d => d.isBH ? 'BH' : d.isWE ? d.dayName : `${d.dayName} ${d.dayNum}`);
      const values = days.map((d, i) => isClosed[i] ? null : d.predicted);
      const lows = days.map((d, i) => isClosed[i] ? null : d.confidence?.low);
      const highs = days.map((d, i) => isClosed[i] ? null : d.confidence?.high);
      chartInstance.current = new window.Chart(chartRef.current, {
        type: 'line',
        data: { labels, datasets: [
          { data: highs, fill: '+1', backgroundColor: 'rgba(56,189,248,0.07)', borderWidth: 0, pointRadius: 0, tension: 0.3, spanGaps: true },
          { data: lows, fill: false, borderWidth: 0, pointRadius: 0, tension: 0.3, spanGaps: true },
          { data: values, borderWidth: 2.5, tension: 0.3, spanGaps: false, borderColor: '#38bdf8',
            pointRadius: (ctx) => { if (values[ctx.dataIndex] === null) return 0; return ctx.dataIndex === todayIdx ? 8 : 2.5; },
            pointBackgroundColor: (ctx) => ctx.dataIndex === todayIdx ? '#f59e0b' : ctx.dataIndex < todayIdx ? '#94a3b8' : '#38bdf8',
            pointBorderColor: (ctx) => ctx.dataIndex === todayIdx ? '#fbbf24' : 'transparent',
            pointBorderWidth: (ctx) => ctx.dataIndex === todayIdx ? 4 : 0,
            segment: { borderColor: (ctx) => ctx.p0DataIndex < todayIdx ? '#94a3b8' : '#38bdf8', borderDash: (ctx) => ctx.p0DataIndex >= todayIdx ? [5,4] : undefined },
          },
        ]},
        plugins: [{
          id: 'shade', beforeDraw(chart) {
            const ctx = chart.ctx, xs = chart.scales.x, ys = chart.scales.y, bw = (xs.getPixelForValue(1) - xs.getPixelForValue(0)) * 0.5;
            ctx.save(); for (let i = 0; i < isClosed.length; i++) { if (isClosed[i]) { const x = xs.getPixelForValue(i); ctx.fillStyle = isBH[i] ? '#1c1917' : '#1e293b'; ctx.fillRect(x-bw, ys.top, bw*2, ys.bottom-ys.top); if (isBH[i]) { ctx.fillStyle = '#f59e0b33'; ctx.fillRect(x-bw, ys.top, bw*2, 3); } } } ctx.restore();
          }
        }, {
          id: 'todayLine', afterDraw(chart) {
            const ctx = chart.ctx, x = chart.scales.x.getPixelForValue(todayIdx), y = chart.scales.y;
            ctx.save(); ctx.beginPath(); ctx.setLineDash([3,3]); ctx.strokeStyle = '#f59e0b44'; ctx.lineWidth = 1; ctx.moveTo(x, y.top); ctx.lineTo(x, y.bottom); ctx.stroke(); ctx.restore();
          }
        }],
        options: { responsive: true, maintainAspectRatio: false, animation: { duration: 1200 },
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: {
            x: { ticks: { font: { size: 10 }, color: (ctx) => { if (isBH[ctx.index]) return '#f59e0b88'; if (isClosed[ctx.index]) return '#334155'; if (ctx.index === todayIdx) return '#f59e0b'; return '#64748b'; }, maxRotation: 0 }, grid: { display: false } },
            y: { position: 'right', min: 40, max: 220, ticks: { font: { size: 10 }, color: '#475569', stepSize: 40 }, grid: { color: '#1e293b', lineWidth: 0.5 }, border: { display: false } },
          },
        },
      });
    };
    loadChart();
    return () => { if (chartInstance.current) chartInstance.current.destroy(); };
  }, [demandData]);

  // ── Who's in ──────────────────────────────────────────────────
  const visibleStaff = allClinicians.filter(c => c.showWhosIn !== false && c.status !== 'left' && c.status !== 'administrative');
  const todayCsvClinicians = useMemo(() => { if (!huddleData?.dates?.includes(todayDateStr)) return []; return getCliniciansForDate(huddleData, todayDateStr); }, [huddleData, todayDateStr]);
  const csvPresentIds = useMemo(() => { const s = new Set(); allClinicians.forEach(c => { if (todayCsvClinicians.some(n => matchesStaffMember(n, c))) s.add(c.id); }); return s; }, [allClinicians, todayCsvClinicians]);
  const hasCSV = todayCsvClinicians.length > 0;
  const absenceMap = useMemo(() => { const m = {}; ensureArray(data.plannedAbsences).forEach(a => { if (dateKey >= a.startDate && dateKey <= a.endDate) m[a.clinicianId] = a.reason || 'Leave'; }); return m; }, [data.plannedAbsences, dateKey]);
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

  // ── Capacity ──────────────────────────────────────────────────
  const displayDate = huddleData?.dates?.includes(todayDateStr) ? todayDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs) : null;
  const mergedClinicians = useMemo(() => {
    if (!capacity) return [];
    const m = {};
    [...(capacity.am?.byClinician || []), ...(capacity.pm?.byClinician || [])].forEach(c => {
      if (!m[c.name]) m[c.name] = { name: c.name, available: 0, embargoed: 0, booked: 0 };
      m[c.name].available += c.available || 0; m[c.name].embargoed += c.embargoed || 0; m[c.name].booked += c.booked || 0;
    });
    return Object.values(m).sort((a, b) => (b.available + b.embargoed) - (a.available + a.embargoed));
  }, [capacity]);
  const urgentAm = capacity?.am?.total || 0, urgentPm = capacity?.pm?.total || 0, urgentTotal = urgentAm + urgentPm;

  // ── Routine gauges ────────────────────────────────────────────
  const allSlotsOverrides = useMemo(() => { const o = {}; (hs?.knownSlotTypes || []).forEach(s => { o[s] = true; }); if (huddleData?.allSlotTypes) huddleData.allSlotTypes.forEach(s => { o[s] = true; }); return o; }, [hs, huddleData]);
  const routineDays = useMemo(() => huddleData ? getNDayAvailability(huddleData, hs, 30, allSlotsOverrides) : [], [huddleData, hs, allSlotsOverrides]);
  const routineGauges = useMemo(() => {
    return [{ label: '0-7 days', start: 0, end: 7 }, { label: '8-14 days', start: 7, end: 14 }, { label: '15-21 days', start: 14, end: 21 }, { label: '22-28 days', start: 21, end: 28 }].map(({ label, start, end }) => {
      const slice = routineDays.slice(start, end).filter(d => d.available !== null && !d.isWeekend);
      const avail = slice.reduce((s, d) => s + (d.available || 0) + (d.embargoed || 0), 0);
      const booked = slice.reduce((s, d) => s + (d.booked || 0), 0);
      const total = avail + booked; const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
      return { label, pct, colour: pct > 50 ? '#10b981' : pct >= 20 ? '#f59e0b' : '#ef4444' };
    });
  }, [routineDays]);

  // ── Capacity cards (7-day) ────────────────────────────────────
  const capacityCards = hs?.capacityCards || DEFAULT_CAPACITY_CARDS;
  const cardData = useMemo(() => {
    if (!huddleData) return [];
    return capacityCards.map(card => {
      const saved = hs?.savedSlotFilters || {};
      const overrides = saved[card.id] || allSlotsOverrides;
      const days = getNDayAvailability(huddleData, hs, 7, overrides);
      const working = days.filter(d => d.available !== null && !d.isWeekend);
      const avail = working.reduce((s, d) => s + (d.available || 0), 0);
      const emb = working.reduce((s, d) => s + (d.embargoed || 0), 0);
      const booked = working.reduce((s, d) => s + (d.booked || 0), 0);
      return { ...card, avail, emb, booked };
    });
  }, [huddleData, hs, capacityCards, allSlotsOverrides]);

  // ── Routine bar chart data ────────────────────────────────────
  const routineBarMax = useMemo(() => {
    if (routineDays.length === 0) return 1;
    return Math.max(...routineDays.filter(d => d.available !== null && !d.isWeekend).map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  }, [routineDays]);

  // ── Demand derived ────────────────────────────────────────────
  const t = demandData?.today;
  const dc = t ? (DEMAND_COLOURS[t.demandLevel] || DEMAND_COLOURS.normal) : DEMAND_COLOURS.normal;
  const dowIdx = today.getDay() > 0 && today.getDay() < 6 ? (today.getDay() + 6) % 7 : 0;
  const monthIdx = today.getMonth();
  const typicalDayMonth = dowIdx < 5 ? Math.round(BASELINE + DOW_EFFECTS[dowIdx] + MONTH_EFFECTS[monthIdx]) : 0;
  const vsPct = t && typicalDayMonth > 0 ? Math.round(((t.predicted - typicalDayMonth) / typicalDayMonth) * 100) : 0;
  const rangePct = t ? (t.confidence.high > t.confidence.low ? ((t.predicted - t.confidence.low) / (t.confidence.high - t.confidence.low)) * 100 : 50) : 50;
  const tw = demandData?.today?.weather;
  const topFactors = useMemo(() => {
    if (!t?.factors) return [];
    const f = t.factors, list = [];
    if (f.dayOfWeek) list.push({ label: f.dayOfWeek.day, effect: f.dayOfWeek.effect, desc: 'day of week' });
    if (f.month) list.push({ label: MONTH_SHORT[f.month.month-1], effect: f.month.effect, desc: 'seasonal' });
    if (f.trend) list.push({ label: 'Trend', effect: f.trend.effect, desc: 'growth' });
    if (f.weather) list.push({ label: `${Math.round(f.weather.actualTemp)}°C`, effect: f.weather.tempEffect, desc: 'temperature' });
    if (f.endOfMonth) list.push({ label: `${today.getDate()}th`, effect: f.endOfMonth, desc: 'end of month' });
    if (f.firstDayBack) list.push({ label: '1st back', effect: f.firstDayBack, desc: 'after bank hol' });
    if (f.schoolHoliday) list.push({ label: 'School hol', effect: f.schoolHoliday, desc: 'holidays' });
    if (f.firstWeekBack) list.push({ label: 'Term starts', effect: f.firstWeekBack, desc: 'first week back' });
    if (f.shortWeek) list.push({ label: `${f.shortWeek.workingDays}d week`, effect: f.shortWeek.effect, desc: 'short week' });
    list.sort((a,b) => Math.abs(b.effect) - Math.abs(a.effect));
    return list.slice(0, 5);
  }, [t, today]);

  const PersonCard = ({ person, delay, reason }) => {
    const gc = { gp: { bg: '#eff6ff', init: '#dbeafe', text: '#1d4ed8' }, nursing: { bg: '#ecfdf5', init: '#d1fae5', text: '#047857' }, allied: { bg: '#f5f3ff', init: '#ede9fe', text: '#6d28d9' }, admin: { bg: '#f8fafc', init: '#f1f5f9', text: '#64748b' } }[person.group] || { bg: '#f8fafc', init: '#f1f5f9', text: '#64748b' };
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-slate-200 mb-1.5 fs-slidein" style={{ background: gc.bg, animationDelay: `${delay}s` }}>
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: gc.init, color: gc.text }}>{person.initials}</div>
        <span className="text-sm text-slate-900 truncate flex-1">{person.name}</span>
        {reason && <span className="text-xs text-red-500 flex-shrink-0">{reason}</span>}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={{ background: '#f1f5f9', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        .fs-slidein { opacity: 0; animation: fsSlidein 0.4s ease forwards; }
        .fs-fadein { opacity: 0; animation: fsFadein 0.5s ease forwards; }
        .fs-popin { opacity: 0; animation: fsPopin 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .fs-growbar { transform: scaleY(0); transform-origin: bottom; animation: fsGrowbar 0.8s ease forwards; }
        .fs-gauge-glow { animation: fsGaugeGlow 6s ease-in-out 2s infinite; }
        .fs-gauge-sweep { animation: fsGaugeSweep 1.2s ease forwards; }
        .fs-breathe { animation: fsBreathe 4s ease-in-out 2s infinite; }
        .fs-bar-breathe { animation: fsBarBreathe 5s ease-in-out 3s infinite; }
        .fs-live-dot { animation: fsLiveDot 2s ease infinite; }
        @keyframes fsSlidein { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fsFadein { from { opacity:0; transform:scale(0.9); } to { opacity:1; transform:scale(1); } }
        @keyframes fsPopin { from { opacity:0; transform:scale(0.5) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        @keyframes fsGrowbar { from { transform:scaleY(0); } to { transform:scaleY(1); } }
        @keyframes fsGaugeGlow { 0%,100% { filter: drop-shadow(0 0 2px rgba(16,185,129,0.15)); } 50% { filter: drop-shadow(0 0 10px rgba(16,185,129,0.45)); } }
        @keyframes fsGaugeSweep { to { stroke-dashoffset: var(--target); } }
        @keyframes fsBreathe { 0%,100% { opacity:1; } 50% { opacity:0.8; } }
        @keyframes fsBarBreathe { 0%,100% { opacity:1; } 50% { opacity:0.85; } }
        @keyframes fsLiveDot { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
      `}</style>

      {/* Header */}
      <div className="flex items-center px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-4 flex-1">
          <div className="bg-emerald-500 rounded-lg px-4 py-1.5 text-center">
            <div className="text-2xl font-extrabold text-white leading-none">{today.getDate()}</div>
            <div className="text-[9px] text-white/80 uppercase">{MONTH_SHORT[today.getMonth()]}</div>
          </div>
          <div><div className="text-xl font-bold text-slate-900">{dayName}</div><div className="text-sm text-slate-400">{today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 fs-live-dot" /><span className="text-sm text-slate-400">Live</span></div>
          {tw && <span className="text-sm text-slate-500">{Math.round(tw.temp)}°C · Feels {Math.round(tw.feelsLike)}°C{tw.precipMm > 0 ? ` · ${Math.round(tw.precipMm)}mm` : ''}</span>}
          <LiveClock />
          <button onClick={onExit} className="px-4 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-400 hover:text-slate-600 hover:bg-slate-50">Exit fullscreen</button>
        </div>
      </div>

      <NoticeTicker messages={messages} />

      {/* 4-quadrant grid */}
      <div className="grid grid-cols-2 flex-1 gap-2.5 p-2.5 min-h-0">

        {/* TL: Demand — dark card */}
        <div className="rounded-xl bg-slate-900 overflow-hidden flex flex-col border border-slate-800">
          <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg><span className="text-sm font-semibold text-slate-200">Predicted demand</span></div>
            <span className="text-xs text-slate-600">Model v2.0</span>
          </div>
          <div className="flex items-stretch flex-1">
            <div className="px-5 py-4 flex flex-col justify-center border-r border-slate-800" style={{ minWidth: 170 }}>
              <div className="text-xs text-slate-500 uppercase tracking-wider">Today's forecast</div>
              <div className="text-[56px] font-extrabold leading-none mt-1 fs-popin" style={{ color: dc.text }}>{t?.predicted || '—'}</div>
              <div className="text-sm text-slate-400 mt-1">patient requests</div>
              {t && <div className="mt-2"><span className="text-xs font-semibold px-2.5 py-1 rounded" style={{ background: dc.bg, color: dc.text }}>{dc.label}</span></div>}
              {t && vsPct !== 0 && <div className="mt-2 text-xs text-slate-500 fs-breathe"><span style={{ color: vsPct >= 0 ? '#fbbf24' : '#34d399' }}>{Math.abs(vsPct)}% {vsPct >= 0 ? 'above' : 'below'}</span> typical {DOW_NAMES[dowIdx]} in {MONTH_SHORT[monthIdx]}</div>}
              {t && <div className="flex items-center gap-2 mt-3 p-2 bg-slate-800 rounded-lg">
                <div className="text-center"><div className="text-lg font-bold text-slate-400">{t.confidence.low}</div><div className="text-[8px] text-slate-600 uppercase">Low</div></div>
                <div className="flex-1 h-1 rounded-full bg-slate-700 relative">
                  <div className="absolute left-0 top-0 h-full rounded-full" style={{ width: `${rangePct}%`, background: 'linear-gradient(90deg, #10b981, #f59e0b)' }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-slate-900" style={{ left: `${rangePct}%`, marginLeft: '-5px' }} />
                </div>
                <div className="text-center"><div className="text-lg font-bold text-slate-400">{t.confidence.high}</div><div className="text-[8px] text-slate-600 uppercase">High</div></div>
              </div>}
            </div>
            <div className="flex-1 flex flex-col">
              <div className="flex-1 px-3 pt-3 relative" style={{ minHeight: 120 }}><canvas ref={chartRef} /></div>
              <div className="grid grid-cols-5 divide-x divide-slate-800 border-t border-slate-800">
                {topFactors.map((f, i) => (
                  <div key={i} className="py-2 px-2 text-center fs-fadein" style={{ animationDelay: `${0.5+i*0.1}s` }}>
                    <div className="text-[9px] text-slate-500 uppercase truncate">{f.label}</div>
                    <div className={`text-lg font-bold ${f.effect >= 0 ? 'text-blue-400' : 'text-emerald-400'}`}>{f.effect > 0 ? '+' : ''}{Math.round(f.effect)}</div>
                    <div className="text-[9px] text-slate-600 truncate">{f.desc}</div>
                  </div>
                ))}
                {topFactors.length < 5 && Array.from({ length: 5 - topFactors.length }).map((_, i) => <div key={`e${i}`} className="py-2 px-2" />)}
              </div>
            </div>
          </div>
        </div>

        {/* TR: Urgent */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-red-500 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-white">Urgent on the day</span>
            <span className="text-xs text-white/70">Available slots</span>
          </div>
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-center gap-8 mb-4">
              <div className="text-center"><div className="text-5xl font-extrabold text-amber-500 leading-none fs-popin" style={{ animationDelay: '0.1s' }}>{urgentAm}</div><div className="text-sm text-slate-400 mt-1">Morning</div></div>
              <div className="w-px h-12 bg-slate-200" />
              <div className="text-center"><div className="text-7xl font-extrabold text-emerald-500 leading-none fs-popin" style={{ animationDelay: '0.2s' }}>{urgentTotal}</div><div className="text-sm text-slate-400 mt-1">Total</div></div>
              <div className="w-px h-12 bg-slate-200" />
              <div className="text-center"><div className="text-5xl font-extrabold text-blue-500 leading-none fs-popin" style={{ animationDelay: '0.3s' }}>{urgentPm}</div><div className="text-sm text-slate-400 mt-1">Afternoon</div></div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 flex-1 content-start">
              {mergedClinicians.slice(0, 8).map((c, i) => {
                const matched = allClinicians.find(tc => matchesStaffMember(c.name, tc));
                return (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200 fs-slidein" style={{ animationDelay: `${0.3+i*0.08}s` }}>
                    <span className="text-sm text-slate-600 truncate mr-2">{matched?.name || c.name}</span>
                    <div className="flex gap-1 flex-shrink-0">
                      <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-sm font-semibold">{c.available}</span>
                      <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-sm font-semibold">{c.embargoed}</span>
                      <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-sm font-semibold">{c.booked}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* BL: Who's in */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-white">Who's in today</span>
            <span className="text-xs text-white/60">{categories.inPractice.length} in · {categories.leaveAbsent.length} absent</span>
          </div>
          <div className="p-4 flex-1 overflow-hidden">
            <div className="grid grid-cols-3 gap-3 h-full">
              <div className="overflow-hidden">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" /> Clinicians <span className="text-slate-300">{gpTeam.length}</span></div>
                {gpTeam.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.1 + i * 0.05} />)}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Nursing <span className="text-slate-300">{nursingTeam.length}</span></div>
                {nursingTeam.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.15 + i * 0.05} />)}
                {othersTeam.length > 0 && <>
                  <div className="text-xs text-slate-400 uppercase tracking-wider mt-3 mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" /> Others <span className="text-slate-300">{othersTeam.length}</span></div>
                  {othersTeam.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.3 + i * 0.05} />)}
                </>}
              </div>
              <div className="overflow-hidden">
                <div className="text-xs text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Absent <span className="text-slate-300">{categories.leaveAbsent.length}</span></div>
                {categories.leaveAbsent.map((e, i) => <PersonCard key={e.person.id} person={e.person} delay={0.2 + i * 0.05} reason={e.reason} />)}
                {categories.leaveAbsent.length === 0 && <div className="text-sm text-slate-300 px-3">None</div>}
                {categories.dayOff.length > 0 && <div className="text-xs text-slate-300 mt-4">+ {categories.dayOff.length} day off</div>}
              </div>
            </div>
          </div>
        </div>

        {/* BR: Routine capacity — gauges + bar chart + capacity cards */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-white">Routine capacity</span>
            <span className="text-xs text-white/70">30-day overview</span>
          </div>
          <div className="p-3 flex-1 flex flex-col gap-2 overflow-hidden">
            {/* Gauges row */}
            <div className="flex justify-center gap-4 flex-shrink-0">
              {routineGauges.map((g, i) => <GaugeSVG key={i} pct={g.pct} colour={g.colour} label={g.label} delay={i} />)}
            </div>
            {/* Capacity cards */}
            {cardData.length > 0 && (
              <div className="flex gap-2 flex-shrink-0">
                {cardData.map((c, i) => (
                  <div key={c.id} className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-2 text-center fs-fadein" style={{ animationDelay: `${0.6 + i * 0.1}s` }}>
                    <div className="text-xs text-slate-500 truncate">{c.title}</div>
                    <div className="flex justify-center gap-1 mt-1">
                      <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded text-xs font-bold">{c.avail}</span>
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-xs font-bold">{c.emb}</span>
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-xs font-bold">{c.booked}</span>
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">7-day slots</div>
                  </div>
                ))}
              </div>
            )}
            {/* Bar chart */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex justify-between mb-1"><span className="text-[10px] text-slate-400">All routine · 30 days</span>
                <div className="flex gap-2 text-[9px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-emerald-400" />Avail</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-amber-300" />Emb</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-slate-300" />Bkd</span>
                </div>
              </div>
              <div className="flex-1 flex items-end gap-px">
                {routineDays.map((d, i) => {
                  if (d.isWeekend) return <div key={i} className="flex-[0.3] h-full" />;
                  const avail = d.available || 0, emb = d.embargoed || 0, bkd = d.booked || 0;
                  const total = avail + emb + bkd;
                  const pct = total > 0 ? Math.max(4, (total / routineBarMax) * 100) : 0;
                  const aPct = total > 0 ? (avail / total) * pct : 0;
                  const ePct = total > 0 ? (emb / total) * pct : 0;
                  const bPct = total > 0 ? (bkd / total) * pct : 0;
                  const delay = 0.3 + i * 0.03;
                  return (
                    <div key={i} className={`flex-1 flex flex-col justify-end h-full ${d.isMonday && i > 0 ? 'ml-0.5 pl-0.5 border-l border-slate-100' : ''}`}>
                      <div className="fs-growbar fs-bar-breathe" style={{ animationDelay: `${delay}s`, height: `${pct}%`, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div style={{ height: `${aPct / pct * 100}%`, background: '#10b981', borderRadius: '2px 2px 0 0' }} />
                        <div style={{ height: `${ePct / pct * 100}%`, background: '#fbbf24' }} />
                        <div style={{ height: `${bPct / pct * 100}%`, background: '#cbd5e1', borderRadius: '0 0 2px 2px' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-1 text-[9px] text-slate-400"><span>0-7d</span><span>8-14d</span><span>15-21d</span><span>22-28d</span></div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
