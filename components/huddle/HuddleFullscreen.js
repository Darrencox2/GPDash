'use client';
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { STAFF_GROUPS, matchesStaffMember, toLocalIso } from '@/lib/data';
import { getHuddleCapacity, getTodayDateStr, getCliniciansForDate, getClinicianLocationsForDate, getNDayAvailability, LOCATION_COLOURS, getDutyDoctor, getBand } from '@/lib/huddle';
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
  return <div style={{ fontSize: 'clamp(24px, 4vh, 48px)', fontWeight: 300, color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>;
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
  const H = 'clamp(32px, 5vh, 52px)';
  return (
    <div className="flex items-center gap-3 px-5 flex-shrink-0 overflow-hidden" style={{ height: H, background: 'linear-gradient(135deg, #1e293b, #334155)' }}>
      <div className="flex items-center gap-2 flex-shrink-0">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        <span style={{ fontSize: 'clamp(10px, 1.3vh, 14px)' }} className="font-semibold text-amber-400 uppercase tracking-wider">Noticeboard</span>
      </div>
      <div className="flex-1 overflow-hidden" style={{ height: H }}>
        <div className="flex flex-col transition-transform duration-700" style={{ transform: `translateY(calc(-${idx} * ${H}))` }}>
          {messages.map((m, i) => {
            const mc = MSG_COLOURS[i % MSG_COLOURS.length];
            return <div key={i} className="flex items-center gap-3 flex-shrink-0" style={{ height: H }}>
              <span className="px-2.5 py-0.5 rounded-full font-semibold" style={{ background: mc.bg, color: mc.text, fontSize: 'clamp(10px, 1.3vh, 14px)' }}>{m.author} {m.time}</span>
              <span className="text-slate-200 truncate" style={{ fontSize: 'clamp(12px, 1.5vh, 16px)' }}>{m.text}</span>
            </div>;
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
      <svg viewBox={`0 0 ${size} ${size}`} className="fs-gauge-glow" style={{ width: 'clamp(70px, 12vh, 180px)', height: 'clamp(70px, 12vh, 180px)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={colour} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ}
          transform={`rotate(-90 ${cx} ${cy})`}
          className="fs-gauge-sweep" style={{ '--target': offset, animationDelay: `${0.5 + delay * 0.2}s` }} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill={colour} style={{ fontSize: '28px', fontWeight: 800 }}>{pct}%</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '12px' }}>available</text>
      </svg>
      <div style={{ fontSize: 'clamp(10px, 1.2vh, 14px)' }} className="text-slate-500 mt-0.5">{label}</div>
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────
export default function HuddleFullscreen({ data, huddleData, viewingDate: viewingDateProp, onExit, onNavigateDay }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [demandData, setDemandData] = useState(null);
  const [showFsChart, setShowFsChart] = useState(false);

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);
  const realToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const today = useMemo(() => { if (viewingDateProp) { const d = new Date(viewingDateProp); d.setHours(0,0,0,0); return d; } return realToday; }, [viewingDateProp, realToday]);
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  const dateKey = toLocalIso(today);
  const todayDateStr = useMemo(() => {
    const d = today;
    return `${String(d.getDate()).padStart(2,'0')}-${d.toLocaleString('en-GB',{month:'short'})}-${d.getFullYear()}`;
  }, [today]);
  const hs = data?.huddleSettings || {};
  const messages = ensureArray(data?.huddleMessages || []);

  // Fullscreen API — use ref for onExit to avoid effect re-running on every render
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  useEffect(() => {
    const el = containerRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    const onFs = () => { if (!document.fullscreenElement) onExitRef.current(); };
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e) => { if (e.key === 'Escape') onExitRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, []);

  // Demand + weather
  useEffect(() => {
    async function load() {
      const w = await getWeatherForecast(16);
      const todayDk = toLocalIso(today);
      const todayW = w?.[todayDk] || null;
      const todayPred = predictDemand(today, todayW);
      const chartDays = [];
      for (let i = 14; i >= 1; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i);
        const isWE = d.getDay() === 0 || d.getDay() === 6;
        const dk = toLocalIso(d);
        const pred = isWE ? null : predictDemand(d, w?.[dk] || null);
        chartDays.push({ predicted: pred?.predicted||null, date: d, dk, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], dayNum: d.getDate(), isPast: true, isToday: false, isBH: pred?.isBankHoliday||false, isWE, confidence: pred?.confidence||{low:null,high:null} });
      }
      chartDays.push({ ...todayPred, date: today, dk: todayDk, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][today.getDay()], dayNum: today.getDate(), isPast: false, isToday: true, isBH: false, isWE: false, weather: todayW });
      for (let i = 1; i <= 14; i++) {
        const d = new Date(today); d.setDate(d.getDate() + i);
        const isWE = d.getDay() === 0 || d.getDay() === 6;
        const dk = toLocalIso(d);
        const pred = isWE ? null : predictDemand(d, w?.[dk] || null);
        chartDays.push({ predicted: pred?.predicted||null, date: d, dk, dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()], dayNum: d.getDate(), isPast: false, isToday: false, isBH: pred?.isBankHoliday||false, isWE, confidence: pred?.confidence||{low:null,high:null} });
      }
      setDemandData({ today: { ...todayPred, weather: todayW }, chartDays });
    }
    load();
  }, [today]);

  // Chart.js
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
            x: { ticks: { font: { size: 9 }, color: (ctx) => { if (isBH[ctx.index]) return '#f59e0b88'; if (isClosed[ctx.index]) return '#334155'; if (ctx.index === todayIdx) return '#f59e0b'; return '#64748b'; }, maxRotation: 0 }, grid: { display: false } },
            y: { position: 'right', min: 40, max: 220, ticks: { font: { size: 9 }, color: '#475569', stepSize: 40 }, grid: { color: '#1e293b', lineWidth: 0.5 }, border: { display: false } },
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
  const csvLocationMap = useMemo(() => { if (!huddleData?.dates?.includes(todayDateStr)) return {}; return getClinicianLocationsForDate(huddleData, todayDateStr); }, [huddleData, todayDateStr]);
  const personLocationMap = useMemo(() => { const map = {}; allClinicians.forEach(p => { Object.entries(csvLocationMap).forEach(([csvName, loc]) => { if (matchesStaffMember(csvName, p)) map[p.id] = loc; }); }); return map; }, [allClinicians, csvLocationMap]);
  const absenceMap = useMemo(() => { const m = {}; ensureArray(data.plannedAbsences).forEach(a => { if (dateKey >= a.startDate && dateKey <= a.endDate) m[a.clinicianId] = a.reason || 'Leave'; }); return m; }, [data.plannedAbsences, dateKey]);
  const dayKey = `${dateKey}-${dayName}`;
  const manualOverride = data.dailyOverrides?.[dayKey];
  const manualPresent = manualOverride?.present ? new Set(ensureArray(manualOverride.present)) : null;
  const categories = useMemo(() => {
    const inP = [], leave = [], off = [];
    visibleStaff.forEach(p => {
      if (p.longTermAbsent || p.status === 'longTermAbsent') { leave.push({ person: p, reason: 'LTA' }); return; }
      if (manualPresent !== null) {
        const isManualScheduled = ensureArray(manualOverride?.scheduled || []).includes(p.id);
        if (isManualScheduled && !manualPresent.has(p.id)) { leave.push({ person: p, reason: absenceMap[p.id] || 'Absent' }); return; }
        if (manualPresent.has(p.id)) { inP.push({ person: p }); return; }
      }
      if (absenceMap[p.id]) { leave.push({ person: p, reason: absenceMap[p.id] }); return; }
      if (hasCSV && csvPresentIds.has(p.id)) { inP.push({ person: p }); return; }
      if (!hasCSV && p.buddyCover && ensureArray(data.weeklyRota?.[dayName])?.includes(p.id)) { inP.push({ person: p }); return; }
      off.push({ person: p });
    });
    return { inPractice: inP, leaveAbsent: leave, dayOff: off };
  }, [visibleStaff, csvPresentIds, absenceMap, manualPresent, manualOverride, hasCSV, data.weeklyRota, dayName]);
  const FS_LOC_SORT = { 'Winscombe': 0, 'Banwell': 1, 'Locking': 2 };
  const fsSortByLoc = (arr) => arr.sort((a, b) => (FS_LOC_SORT[personLocationMap[a.person.id]] ?? 9) - (FS_LOC_SORT[personLocationMap[b.person.id]] ?? 9));
  const gpTeam = fsSortByLoc(categories.inPractice.filter(e => e.person.group === 'gp'));
  const nursingTeam = fsSortByLoc(categories.inPractice.filter(e => e.person.group === 'nursing'));
  const othersTeam = fsSortByLoc(categories.inPractice.filter(e => e.person.group !== 'gp' && e.person.group !== 'nursing'));

  // ── Capacity ──────────────────────────────────────────────────
  const saved = hs?.savedSlotFilters || {};
  const displayDate = huddleData?.dates?.includes(todayDateStr) ? todayDateStr : null;
  const capacity = huddleData && displayDate ? getHuddleCapacity(huddleData, displayDate, hs, saved.urgent || null) : null;
  const urgentAm = (capacity?.am?.total||0) + (capacity?.am?.embargoed||0) + (capacity?.am?.booked||0);
  const availAm = (capacity?.am?.total||0) + (capacity?.am?.embargoed||0), bookedAm = capacity?.am?.booked||0;
  const urgentPm = (capacity?.pm?.total||0) + (capacity?.pm?.embargoed||0) + (capacity?.pm?.booked||0);
  const availPm = (capacity?.pm?.total||0) + (capacity?.pm?.embargoed||0), bookedPm = capacity?.pm?.booked||0;
  const mergedClinicians = useMemo(() => {
    if (!capacity) return [];
    const m = {};
    [...(capacity.am?.byClinician || []), ...(capacity.pm?.byClinician || [])].forEach(c => {
      if (!m[c.name]) m[c.name] = { name: c.name, available: 0, embargoed: 0, booked: 0 };
      m[c.name].available += c.available || 0; m[c.name].embargoed += c.embargoed || 0; m[c.name].booked += c.booked || 0;
    });
    return Object.values(m).sort((a, b) => (b.available + b.embargoed + b.booked) - (a.available + a.embargoed + a.booked));
  }, [capacity]);
  const todayDayName = dayName;
  const expectedAm = hs.expectedCapacity?.[todayDayName]?.am || 0;
  const expectedPm = hs.expectedCapacity?.[todayDayName]?.pm || 0;
  const amBand = getBand(urgentAm, expectedAm);
  const pmBand = getBand(urgentPm, expectedPm);

  // ── Routine ───────────────────────────────────────────────────
  const knownSlotTypes = hs?.knownSlotTypes || [];
  const allSlotsOverrides = useMemo(() => { const o={}; knownSlotTypes.forEach(s=>{o[s]=true;}); if(huddleData?.allSlotTypes) huddleData.allSlotTypes.forEach(s=>{o[s]=true;}); return o; }, [knownSlotTypes, huddleData]);
  const effectiveRoutineOverrides = saved.routine || allSlotsOverrides;
  const routineDays = useMemo(() => huddleData ? getNDayAvailability(huddleData, hs, 30, effectiveRoutineOverrides) : [], [huddleData, hs, effectiveRoutineOverrides]);
  const routineGauges = useMemo(() => {
    return [{label:'0–7 days',start:0,end:7},{label:'8–14 days',start:7,end:14},{label:'15–21 days',start:14,end:21},{label:'22–28 days',start:21,end:28}].map(({label,start,end})=>{
      const slice=routineDays.slice(start,end).filter(d=>d.available!==null&&!d.isWeekend);
      const avail=slice.reduce((s,d)=>s+(d.available||0)+(d.embargoed||0),0), booked=slice.reduce((s,d)=>s+(d.booked||0),0), total=avail+booked;
      const pct=total>0?Math.round((avail/total)*100):0, colour=pct>50?'#10b981':pct>=20?'#f59e0b':'#ef4444';
      return {label,pct,colour};
    });
  }, [routineDays]);
  const routineBarMax = useMemo(() => Math.max(...routineDays.filter(d=>d.available!==null&&!d.isWeekend).map(d=>(d.available||0)+(d.embargoed||0)+(d.booked||0)),1), [routineDays]);
  const capacityCards = hs?.capacityCards || DEFAULT_CAPACITY_CARDS;
  const cardData = useMemo(() => { if(!huddleData) return []; return capacityCards.map(card=>{ const ov=saved[card.id]||allSlotsOverrides; const days=getNDayAvailability(huddleData,hs,7,ov); const w=days.filter(d=>d.available!==null&&!d.isWeekend); return {...card,avail:w.reduce((s,d)=>s+(d.available||0),0),emb:w.reduce((s,d)=>s+(d.embargoed||0),0),booked:w.reduce((s,d)=>s+(d.booked||0),0)}; }); }, [huddleData,hs,capacityCards,saved,allSlotsOverrides]);

  // ── Demand derived ────────────────────────────────────────────
  const t = demandData?.today;
  const dc = t ? (DEMAND_COLOURS[t.demandLevel]||DEMAND_COLOURS.normal) : DEMAND_COLOURS.normal;
  const dowIdx = today.getDay()>0&&today.getDay()<6?(today.getDay()+6)%7:0;
  const monthIdx = today.getMonth();
  const typicalDayMonth = dowIdx<5?Math.round(BASELINE+DOW_EFFECTS[dowIdx]+MONTH_EFFECTS[monthIdx]):0;
  const vsPct = t&&typicalDayMonth>0?Math.round(((t.predicted-typicalDayMonth)/typicalDayMonth)*100):0;
  const rangePct = t?(t.confidence.high>t.confidence.low?((t.predicted-t.confidence.low)/(t.confidence.high-t.confidence.low))*100:50):50;
  const tw = demandData?.today?.weather;
  const topFactors = useMemo(() => { if(!t?.factors) return []; const f=t.factors, list=[]; if(f.dayOfWeek) list.push({label:f.dayOfWeek.day,effect:f.dayOfWeek.effect,desc:'day of week'}); if(f.month) list.push({label:MONTH_SHORT[f.month.month-1],effect:f.month.effect,desc:'seasonal'}); if(f.trend) list.push({label:'Trend',effect:f.trend.effect,desc:'growth'}); if(f.weather) list.push({label:`${Math.round(f.weather.actualTemp)}°C`,effect:f.weather.tempEffect,desc:'temperature'}); if(f.endOfMonth) list.push({label:`${today.getDate()}th`,effect:f.endOfMonth,desc:'end of month'}); if(f.firstDayBack) list.push({label:'1st back',effect:f.firstDayBack,desc:'after bank hol'}); if(f.schoolHoliday) list.push({label:'School hol',effect:f.schoolHoliday,desc:'holidays'}); if(f.firstWeekBack) list.push({label:'Term starts',effect:f.firstWeekBack,desc:'first week back'}); if(f.shortWeek) list.push({label:`${f.shortWeek.workingDays}d week`,effect:f.shortWeek.effect,desc:'short week'}); list.sort((a,b)=>Math.abs(b.effect)-Math.abs(a.effect)); return list.slice(0,5); }, [t, today]);

  // ── Summary card derived ────────────────────────────────────────
  const dcSettings = hs?.demandCapacity || {};
  const convRate = dcSettings.conversionRate ?? 0.25;
  const greenPct = dcSettings.greenPct ?? 100;
  const amberPct = dcSettings.amberPct ?? 80;
  const predicted = t ? Math.round(t.predicted) : 0;
  const urgentTotal = urgentAm + urgentPm;
  const needed = Math.round(predicted * convRate);
  const coverage = needed > 0 ? Math.round((urgentTotal / needed) * 100) : 100;
  const shortfall = needed > urgentTotal ? needed - urgentTotal : 0;
  let verdict, verdictText, arcColour;
  if (coverage >= greenPct) { verdict = 'Comfortable'; verdictText = '#34d399'; arcColour = '#10b981'; }
  else if (coverage >= amberPct) { verdict = 'Tight day'; verdictText = '#fbbf24'; arcColour = '#f59e0b'; }
  else { verdict = 'Stretched'; verdictText = '#f87171'; arcColour = '#ef4444'; }
  const arcPct = Math.min(coverage, 120) / 120;

  // ── Components ────────────────────────────────────────────────
  const ROLE_BG = {'GP Partner':'bg-blue-50 border-blue-200','Associate Partner':'bg-blue-50 border-blue-200','Salaried GP':'bg-indigo-50 border-indigo-200','Locum':'bg-purple-50 border-purple-200','GP Registrar':'bg-rose-50 border-rose-200','Medical Student':'bg-rose-50 border-rose-200','ANP':'bg-emerald-50 border-emerald-200','Paramedic Practitioner':'bg-amber-50 border-amber-200','Pharmacist':'bg-cyan-50 border-cyan-200','Physiotherapist':'bg-cyan-50 border-cyan-200','Practice Nurse':'bg-teal-50 border-teal-200','Nurse Associate':'bg-teal-50 border-teal-200','HCA':'bg-lime-50 border-lime-200'};
  const PersonCard = ({ person, delay, reason, location }) => {
    const gc = {gp:{init:'#dbeafe',text:'#1d4ed8'},nursing:{init:'#d1fae5',text:'#047857'},allied:{init:'#ede9fe',text:'#6d28d9'},admin:{init:'#f1f5f9',text:'#64748b'}}[person.group]||{init:'#f1f5f9',text:'#64748b'};
    const roleBg = ROLE_BG[person.role] || 'bg-slate-50 border-slate-200';
    const isAbsent = !!reason;
    const displayName = person.title ? `${person.title} ${person.name}` : person.name;
    const locCol = location ? LOCATION_COLOURS[location] : null;
    return (<div className={`text-center rounded-lg border overflow-hidden fs-slidein ${roleBg} ${isAbsent ? 'opacity-60' : ''}`} style={{animationDelay:`${delay}s`}}>
      <div style={{padding: 'clamp(4px, 0.6vh, 10px) clamp(3px, 0.5vw, 8px)'}}>
        <div className="rounded-full flex items-center justify-center font-bold mx-auto flex-shrink-0" style={{width:'clamp(22px, 3.5vh, 44px)',height:'clamp(22px, 3.5vh, 44px)',fontSize:'clamp(9px, 1.3vh, 16px)',background:isAbsent?'#fee2e2':gc.init,color:isAbsent?'#991b1b':gc.text,marginBottom:'clamp(2px, 0.4vh, 6px)'}}>{person.initials}</div>
        <div className={`font-semibold leading-tight ${isAbsent ? 'line-through text-slate-400' : 'text-slate-900'}`} style={{fontSize:'clamp(9px, 1.1vh, 13px)'}}>{displayName}</div>
        <div className="text-slate-400 leading-tight" style={{fontSize:'clamp(7px, 0.9vh, 11px)',marginTop:'1px'}}>{person.role || 'Staff'}{reason ? ` · ${reason}` : ''}</div>
      </div>
      {locCol && !isAbsent && <div className="text-center font-semibold" style={{padding:'clamp(1px,0.2vh,3px) 0',fontSize:'clamp(7px,0.8vh,10px)',background:locCol.bg,color:locCol.text}}>{location}</div>}
    </div>);
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={{background:'#f1f5f9',fontFamily:"'DM Sans', system-ui, sans-serif"}}>
      <style>{`
        .fs-slidein{opacity:0;animation:fsSlidein 0.4s ease forwards}
        .fs-fadein{opacity:0;animation:fsFadein 0.5s ease forwards}
        .fs-popin{opacity:0;animation:fsPopin 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards}
        .fs-gauge-glow{animation:fsGaugeGlow 6s ease-in-out 2s infinite}
        .fs-gauge-sweep{animation:fsGaugeSweep 1.2s ease forwards}
        .fs-breathe{animation:fsBreathe 4s ease-in-out 2s infinite}
        .fs-live-dot{animation:fsLiveDot 2s ease infinite}
        @keyframes fsSlidein{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
        @keyframes fsFadein{from{opacity:0;transform:scale(0.9)}to{opacity:1;transform:scale(1)}}
        @keyframes fsPopin{from{opacity:0;transform:scale(0.5) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes fsGaugeGlow{0%,100%{filter:drop-shadow(0 0 2px rgba(16,185,129,0.15))}50%{filter:drop-shadow(0 0 10px rgba(16,185,129,0.45))}}
        @keyframes fsGaugeSweep{to{stroke-dashoffset:var(--target)}}
        @keyframes fsBreathe{0%,100%{opacity:1}50%{opacity:0.8}}
        @keyframes fsLiveDot{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fsGrowbar{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes fsBarBreathe{0%,100%{opacity:1}50%{opacity:0.85}}
      `}</style>

      {/* Header — vh-scaled */}
      <div className="flex items-center bg-white border-b border-slate-200 flex-shrink-0" style={{ padding: 'clamp(8px, 1.5vh, 32px) clamp(16px, 2vw, 32px)' }}>
        <div className="flex items-center flex-1" style={{ gap: 'clamp(8px, 1.5vw, 20px)' }}>
          <div className="bg-emerald-500 text-center" style={{ borderRadius: 'clamp(6px, 1vh, 12px)', padding: 'clamp(4px, 0.8vh, 12px) clamp(10px, 1.5vw, 24px)' }}>
            <div className="font-extrabold text-white leading-none" style={{ fontSize: 'clamp(20px, 5vh, 64px)' }}>{today.getDate()}</div>
            <div className="text-white/80 uppercase" style={{ fontSize: 'clamp(8px, 1.2vh, 14px)' }}>{MONTH_SHORT[today.getMonth()]}</div>
          </div>
          <div className="flex items-center" style={{ gap: 'clamp(6px, 1vw, 16px)' }}>
            {onNavigateDay && <button onClick={() => onNavigateDay(-1)} className="rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex-shrink-0" style={{padding:'clamp(4px,0.6vh,8px) clamp(6px,0.8vw,12px)',fontSize:'clamp(12px, 2vh, 28px)',lineHeight:1,width:'clamp(28px,3.5vw,44px)',textAlign:'center'}}>‹</button>}
            <div style={{ width: 'clamp(160px, 22vw, 300px)' }}>
              <div className="font-bold text-slate-900" style={{ fontSize: 'clamp(16px, 3.5vh, 48px)' }}>{dayName}</div>
              <div className="text-slate-400" style={{ fontSize: 'clamp(10px, 1.5vh, 18px)' }}>{today.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
            </div>
            {onNavigateDay && <button onClick={() => onNavigateDay(1)} className="rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex-shrink-0" style={{padding:'clamp(4px,0.6vh,8px) clamp(6px,0.8vw,12px)',fontSize:'clamp(12px, 2vh, 28px)',lineHeight:1,width:'clamp(28px,3.5vw,44px)',textAlign:'center'}}>›</button>}
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 'clamp(10px, 2vw, 32px)' }}>
          <div className="flex items-center gap-1.5"><span className="rounded-full bg-emerald-500 fs-live-dot" style={{width:'clamp(6px,1vh,12px)',height:'clamp(6px,1vh,12px)'}}/><span className="text-slate-400" style={{fontSize:'clamp(10px, 1.5vh, 22px)'}}>Live</span></div>
          {tw && <span className="text-slate-500" style={{fontSize:'clamp(10px, 1.5vh, 22px)'}}>{Math.round(tw.temp)}°C · Feels {Math.round(tw.feelsLike)}°C{tw.precipMm>0?` · ${Math.round(tw.precipMm)}mm`:''}</span>}
          <LiveClock />
          <button onClick={onExit} className="rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px,1.2vw,20px)',fontSize:'clamp(10px,1.3vh,16px)'}}>Exit fullscreen</button>
        </div>
      </div>

      <NoticeTicker messages={messages} />

      {/* Option C layout — summary + demand left, urgent + who's in right */}
      <div className="flex flex-1 min-h-0" style={{ gap: 'clamp(4px, 0.5vh, 10px)', padding: 'clamp(4px, 0.5vh, 10px)' }}>

        {/* LEFT COLUMN: Summary → Demand chart → Who's In */}
        <div className="flex-1 flex flex-col min-h-0" style={{ gap: 'clamp(4px, 0.5vh, 10px)' }}>

        {/* Summary card (merged — bigger) */}
        <div className="rounded-xl bg-slate-900 overflow-hidden flex-shrink-0 border border-slate-800">
          <div style={{padding:'clamp(10px,1.5vh,20px) clamp(12px,1.5vw,24px)'}}>
            <div className="text-slate-500 uppercase tracking-wider" style={{fontSize:'clamp(8px, 1.1vh, 14px)',letterSpacing:'1px',marginBottom:'clamp(6px,0.8vh,10px)'}}>Today&apos;s summary</div>
            <div className="flex items-center" style={{gap:'clamp(12px,1.5vw,24px)'}}>
              <svg viewBox="0 0 100 62" style={{width:'clamp(70px,10vw,140px)',height:'clamp(44px,6.5vh,88px)',flexShrink:0}}>
                <path d="M 10 56 A 40 40 0 0 1 90 56" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"/>
                <path d="M 10 56 A 40 40 0 0 1 90 56" fill="none" stroke={arcColour} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arcPct * 126} 126`}/>
                <text x="50" y="50" textAnchor="middle" fill={verdictText} style={{fontSize:20,fontWeight:800}}>{coverage}%</text>
              </svg>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <svg style={{width:'clamp(14px,1.8vh,20px)',height:'clamp(14px,1.8vh,20px)',flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke={verdictText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={coverage>=greenPct?'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z':coverage>=amberPct?'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01':'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'}/></svg>
                  <span className="font-extrabold" style={{fontSize:'clamp(18px, 3.5vh, 44px)',color:verdictText}}>{verdict}</span>
                </div>
                <div className="text-slate-400" style={{fontSize:'clamp(9px, 1.3vh, 16px)',marginTop:'clamp(2px,0.3vh,4px)'}}>{shortfall > 0 ? `${shortfall} slots short` : `${urgentTotal - needed} above need`}</div>
              </div>
              <div className="flex" style={{gap:'clamp(6px,0.8vw,12px)',flexShrink:0}}>
                <div className="rounded-lg text-center" style={{background:'#1e293b',padding:'clamp(4px,0.6vh,10px) clamp(8px,1vw,16px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(7px, 1vh, 13px)'}}>Prediction</div>
                  <div className="font-extrabold" style={{color:dc.text,fontSize:'clamp(16px, 2.8vh, 36px)'}}>{predicted}</div>
                </div>
                <div className="rounded-lg text-center" style={{background:'#1e293b',padding:'clamp(4px,0.6vh,10px) clamp(8px,1vw,16px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(7px, 1vh, 13px)'}}>Need</div>
                  <div className="font-extrabold" style={{color:'#a78bfa',fontSize:'clamp(16px, 2.8vh, 36px)'}}>{needed}</div>
                </div>
                <div className="rounded-lg text-center" style={{background:'#1e293b',padding:'clamp(4px,0.6vh,10px) clamp(8px,1vw,16px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(7px, 1vh, 13px)'}}>Have</div>
                  <div className="font-extrabold" style={{color:'#34d399',fontSize:'clamp(16px, 2.8vh, 36px)'}}>{urgentTotal}</div>
                </div>
              </div>
            </div>
          </div>
          {topFactors.length > 0 && <div className="flex gap-1 flex-wrap border-t border-slate-800" style={{padding:'clamp(4px,0.6vh,8px) clamp(12px,1.5vw,24px)'}}>
            {topFactors.map((f,i) => <span key={i} style={{fontSize:'clamp(8px, 1.1vh, 14px)',fontWeight:600,padding:'2px 6px',borderRadius:3,background:'#1e293b',color:f.effect>=0?'#60a5fa':'#34d399'}}>{f.effect>=0?'↑':'↓'} {f.label} {f.effect>0?'+':''}{Math.round(f.effect)}</span>)}
          </div>}
        </div>

        {/* Demand chart — collapsible dark card */}
        <div className="rounded-xl bg-slate-900 overflow-hidden border border-slate-800 flex-shrink-0">
          <button onClick={() => setShowFsChart(p => !p)} className="w-full flex items-center justify-between" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)',background:'none',border:'none',cursor:'pointer'}}>
            <div className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg><span className="font-semibold text-slate-200" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>14-day demand forecast</span></div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{transform:showFsChart?'rotate(180deg)':'none',transition:'transform 0.2s'}}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {showFsChart && <div className="flex-1 flex flex-col min-h-0" style={{padding:'clamp(4px,0.5vh,8px)'}}>
            <div className="flex-1 px-2 pt-1 relative" style={{minHeight:'clamp(60px,10vh,140px)',height:'clamp(80px,14vh,180px)'}}><canvas ref={chartRef}/></div>
          </div>}
        </div>

        {/* Who's In — left column */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col flex-1">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between flex-shrink-0" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)'}}>
            <span className="font-semibold text-white" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>Who&apos;s in today</span>
            <span className="text-white/60" style={{fontSize:'clamp(8px, 1.2vh, 16px)'}}>{categories.inPractice.length} in · {categories.leaveAbsent.length} absent</span>
          </div>
          <div className="flex-1 overflow-auto" style={{padding:'clamp(4px,0.7vh,16px)'}}>
            <div className="grid grid-cols-3 h-full" style={{gap:'clamp(4px,0.6vw,12px)'}}>
              <div className="overflow-hidden"><div className="text-slate-400 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-blue-500"/> Clinicians <span className="text-slate-300">{gpTeam.length}</span></div><div className="grid grid-cols-2" style={{gap:'clamp(2px, 0.5vh, 8px)'}}>{gpTeam.map((e,i) => <PersonCard key={e.person.id} person={e.person} delay={0.1+i*0.05} location={personLocationMap[e.person.id]}/>)}</div></div>
              <div className="overflow-hidden"><div className="text-slate-400 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-emerald-500"/> Nursing <span className="text-slate-300">{nursingTeam.length}</span></div><div className="grid grid-cols-2" style={{gap:'clamp(2px, 0.5vh, 8px)'}}>{nursingTeam.map((e,i) => <PersonCard key={e.person.id} person={e.person} delay={0.15+i*0.05} location={personLocationMap[e.person.id]}/>)}</div>{othersTeam.length>0 && <><div className="text-slate-400 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginTop:'clamp(4px,0.6vh,12px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-purple-500"/> Others <span className="text-slate-300">{othersTeam.length}</span></div><div className="grid grid-cols-2" style={{gap:'clamp(2px, 0.5vh, 8px)'}}>{othersTeam.map((e,i)=><PersonCard key={e.person.id} person={e.person} delay={0.3+i*0.05} location={personLocationMap[e.person.id]}/>)}</div></>}</div>
              <div className="overflow-hidden"><div className="text-slate-400 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-red-500"/> Absent <span className="text-slate-300">{categories.leaveAbsent.length}</span></div><div className="grid grid-cols-2" style={{gap:'clamp(2px, 0.5vh, 8px)'}}>{categories.leaveAbsent.map((e,i) => <PersonCard key={e.person.id} person={e.person} delay={0.2+i*0.05} reason={e.reason}/>)}</div>{categories.leaveAbsent.length===0 && <div className="text-slate-300" style={{fontSize:'clamp(10px, 1.4vh, 20px)',padding:'0 8px'}}>None</div>}{categories.dayOff.length>0 && <div className="text-slate-300" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginTop:'clamp(4px,0.8vh,16px)'}}>+ {categories.dayOff.length} day off</div>}</div>
            </div>
          </div>
        </div>

        </div>{/* end left column */}

        {/* RIGHT COLUMN: Urgent → Routine */}
        <div className="flex-1 flex flex-col min-h-0" style={{ gap: 'clamp(4px, 0.5vh, 10px)' }}>

        {/* TR: Urgent — AM/PM side by side with proportional bars */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-red-600 to-red-500 flex items-center justify-between flex-shrink-0" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)'}}>
            <span className="font-semibold text-white" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>Urgent on the day</span>
          </div>
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {[{label:'Morning',slots:urgentAm,avail:availAm,booked:bookedAm,target:expectedAm,band:amBand,data:capacity?.am,session:'am'},
              {label:'Afternoon',slots:urgentPm,avail:availPm,booked:bookedPm,target:expectedPm,band:pmBand,data:capacity?.pm,session:'pm'}
            ].map((s,si) => {
              const isShort = s.band.colour === '#ef4444' || s.band.colour === '#f59e0b';
              const scale = Math.max(s.slots, s.target, 1);
              const fillPct = (s.slots / scale) * 100;
              const markerPct = (s.target / scale) * 100;
              const allCliniciansList = (s.data?.byClinician || []).map(c => {
                const matched = allClinicians.find(tc => matchesStaffMember(c.name, tc));
                return { ...c, displayName: matched?.name || c.name, role: matched?.role || '', total: c.available + (c.embargoed || 0) + (c.booked || 0) };
              }).filter(c => c.total > 0).sort((a,b) => ({'Winscombe':0,'Banwell':1,'Locking':2}[a.location]??9) - ({'Winscombe':0,'Banwell':1,'Locking':2}[b.location]??9) || b.total - a.total);
              const dutySlots = hs?.dutyDoctorSlot;
              const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
              const dutyDoc = hasDuty ? getDutyDoctor(huddleData, todayDateStr, s.session, dutySlots) : null;
              const dutyDisplay = dutyDoc ? (() => {
                const m = allClinicians.find(tc => matchesStaffMember(dutyDoc.name, tc));
                const dutyInList = allCliniciansList.find(c => matchesStaffMember(c.name, m || { name: dutyDoc.name }));
                return { name: m?.name || dutyDoc.name, title: m?.title, location: dutyDoc.location, total: dutyInList?.total || 0 };
              })() : null;
              const clinicians = dutyDisplay
                ? allCliniciansList.filter(c => !matchesStaffMember(c.name, { name: dutyDisplay.name, aliases: [] }))
                : allCliniciansList;
              const dutyLocCol = dutyDisplay?.location ? LOCATION_COLOURS[dutyDisplay.location] : null;
              const dutyLocLetter = dutyDisplay?.location ? dutyDisplay.location.charAt(0) : '';
              return (
                <div key={si} className="flex-1 flex flex-col overflow-auto" style={{padding:'clamp(6px,1vh,14px)',background:s.band.tint||'transparent',borderLeft:si===1&&isShort?`3px solid ${s.band.colour}`:si===1?'0.5px solid #e2e8f0':undefined}}>
                  <div className="flex items-center justify-between flex-shrink-0" style={{marginBottom:'clamp(2px,0.5vh,6px)'}}>
                    <span className="uppercase tracking-wider font-semibold" style={{color:s.band.colour,fontSize:'clamp(9px, 1.3vh, 16px)'}}>{s.label}</span>
                    {s.target>0 && <span className="font-semibold px-1.5 py-0.5 rounded" style={{fontSize:'clamp(8px,1vh,11px)',background:s.band.colour,color:'white'}}>target {s.target}</span>}
                  </div>
                  <div className="flex items-center flex-shrink-0" style={{gap:'clamp(4px,0.8vw,10px)',marginBottom:'clamp(4px,0.8vh,12px)'}}>
                    <span className="font-extrabold leading-none" style={{color:s.band.colour,fontSize:'clamp(24px, 4vh, 56px)'}}>{s.slots}</span>
                    <div className="flex-1">
                      <div className="rounded-md relative overflow-hidden" style={{height:'clamp(10px, 1.5vh, 22px)',background:s.band.border,marginRight:4}}>
                        <div className="absolute left-0 top-0 bottom-0 flex" style={{width:`${Math.min(fillPct,100)}%`,borderRadius:fillPct>=100?'6px':'6px 0 0 6px'}}>
                          {s.avail > 0 && <div style={{flex: s.avail, background: s.band.colour}} />}
                          {s.booked > 0 && <div style={{flex: s.booked, background: '#f59e0b'}} />}
                        </div>
                        {s.target>0 && <div className="absolute" style={{left:`${Math.min(markerPct,100)}%`,top:-4,bottom:-4,width:3,background:s.band.textCol,borderRadius:2,marginLeft:'-1.5px',zIndex:1}}/>}
                      </div>
                      <div className="flex justify-between" style={{marginTop:'clamp(10px,1.5vh,16px)'}}>
                        <span className="font-semibold" style={{color:s.band.colour,fontSize:'clamp(8px, 1.2vh, 14px)'}}>{s.avail} avail{s.booked>0?<span style={{color:'#f59e0b'}}> · {s.booked} booked</span>:''}</span>
                        {s.target>0 && <span className="font-semibold" style={{color:s.band.textCol,fontSize:'clamp(8px, 1.2vh, 14px)'}}>{s.band.label} · {Math.round(s.band.pct)}%</span>}
                      </div>
                    </div>
                  </div>
                  {dutyDisplay && (
                    <div className="flex items-stretch rounded-md overflow-hidden flex-shrink-0" style={{marginBottom:'clamp(4px,0.6vh,8px)',border:'2px solid #dc2626'}}>
                      <div className="flex items-center flex-1 min-w-0" style={{gap:'clamp(4px,0.5vw,8px)',padding:'clamp(3px,0.5vh,6px) clamp(6px,0.8vw,10px)',background:'#dc2626'}}>
                        <svg style={{width:'clamp(10px,1.3vh,16px)',height:'clamp(10px,1.3vh,16px)',flexShrink:0}} viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold uppercase tracking-wide" style={{fontSize:'clamp(6px,0.7vh,8px)',color:'rgba(255,255,255,0.7)'}}>Duty doctor</div>
                          <div className="font-bold text-white truncate" style={{fontSize:'clamp(9px, 1.4vh, 20px)'}}>{dutyDisplay.title ? `${dutyDisplay.title} ` : ''}{dutyDisplay.name}</div>
                        </div>
                        {dutyDisplay.total > 0 && <span className="font-extrabold text-white flex-shrink-0" style={{fontSize:'clamp(11px,1.4vh,16px)'}}>{dutyDisplay.total}</span>}
                      </div>
                      {dutyLocLetter && <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{width:'clamp(14px,1.8vw,20px)',background:'rgba(255,255,255,0.15)',color:'#fecaca',fontSize:'clamp(8px,1vh,11px)'}}>{dutyLocLetter}</div>}
                    </div>
                  )}
                  <div className="flex flex-col flex-1 overflow-auto" style={{gap:'clamp(1px,0.3vh,4px)'}}>
                    {clinicians.map((c,i) => {
                      const locCol = c.location ? LOCATION_COLOURS[c.location] : null;
                      const locLetter = c.location ? c.location.charAt(0) : '';
                      return (
                      <div key={i} className="flex items-stretch rounded-md overflow-hidden fs-slidein" style={{animationDelay:`${0.3+i*0.06}s`,border:`1px solid ${s.band.border}`}}>
                        <div className="flex items-center flex-1 min-w-0" style={{padding:'clamp(2px, 0.5vh, 8px) clamp(4px,0.6vw,8px)',background:si===0?'white':'rgba(255,255,255,0.6)'}}>
                          <span className="truncate flex-1" style={{fontSize:'clamp(9px, 1.3vh, 16px)',color:'#475569'}}>{c.displayName}</span>
                          <span className="font-extrabold flex-shrink-0" style={{color:s.band.colour,fontSize:'clamp(11px,1.4vh,15px)',minWidth:18,textAlign:'right'}}>{c.total}</span>
                        </div>
                        {locCol && <div className="flex items-center justify-center flex-shrink-0 font-bold" style={{width:'clamp(14px,1.8vw,20px)',background:locCol.bg,color:locCol.text,fontSize:'clamp(8px,1vh,11px)'}}>{locLetter}</div>}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Routine capacity — right column */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 flex items-center justify-between flex-shrink-0" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)'}}>
            <span className="font-semibold text-white" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>Routine capacity</span>
            <span className="text-white/70" style={{fontSize:'clamp(8px, 1.2vh, 16px)'}}>30-day overview</span>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden" style={{padding:'clamp(4px,0.5vh,12px)',gap:'clamp(2px,0.4vh,10px)'}}>
            <div className="flex justify-center flex-shrink-0" style={{gap:'clamp(4px,1vw,16px)'}}>{routineGauges.map((g,i) => <GaugeSVG key={i} pct={g.pct} colour={g.colour} label={g.label} delay={i}/>)}</div>
            {cardData.length>0 && <div className="flex flex-shrink-0" style={{gap:'clamp(3px,0.5vw,12px)'}}>{cardData.map((c,i) => (
              <div key={c.id} className="flex-1 bg-slate-50 rounded-lg border border-slate-200 text-center fs-fadein" style={{animationDelay:`${0.6+i*0.1}s`,padding:'clamp(3px,0.5vh,12px)'}}>
                <div className="font-semibold text-slate-600" style={{fontSize:'clamp(10px, 1.4vh, 20px)'}}>{c.title}</div>
                <div className="flex justify-center" style={{gap:'clamp(2px,0.3vw,8px)',marginTop:'clamp(2px,0.3vh,8px)'}}>
                  <div className="text-center"><div className="bg-emerald-100 text-emerald-800 rounded-lg font-bold" style={{padding:'clamp(1px,0.2vh,4px) clamp(4px,0.6vw,12px)',fontSize:'clamp(12px, 1.8vh, 24px)'}}>{c.avail}</div><div className="text-slate-400" style={{fontSize:'clamp(7px,0.8vh,10px)',marginTop:'1px'}}>available</div></div>
                  <div className="text-center"><div className="bg-amber-100 text-amber-800 rounded-lg font-bold" style={{padding:'clamp(1px,0.2vh,4px) clamp(4px,0.6vw,12px)',fontSize:'clamp(12px, 1.8vh, 24px)'}}>{c.emb}</div><div className="text-slate-400" style={{fontSize:'clamp(7px,0.8vh,10px)',marginTop:'1px'}}>embargoed</div></div>
                  <div className="text-center"><div className="bg-slate-100 text-slate-600 rounded-lg font-bold" style={{padding:'clamp(1px,0.2vh,4px) clamp(4px,0.6vw,12px)',fontSize:'clamp(12px, 1.8vh, 24px)'}}>{c.booked}</div><div className="text-slate-400" style={{fontSize:'clamp(7px,0.8vh,10px)',marginTop:'1px'}}>booked</div></div>
                </div>
              </div>
            ))}</div>}
            <div className="flex-1 flex flex-col" style={{minHeight:'clamp(80px,12vh,200px)'}}>
              <div className="flex justify-between" style={{marginBottom:'clamp(1px,0.3vh,4px)'}}><span className="text-slate-400" style={{fontSize:'clamp(8px, 1.1vh, 14px)'}}>All routine · 30 days</span><div className="flex text-slate-400" style={{gap:'clamp(3px,0.5vw,8px)',fontSize:'clamp(7px, 1vh, 14px)'}}><span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-emerald-400"/>Avail</span><span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-amber-300"/>Emb</span><span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm" style={{background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444'}}/>Bkd</span></div></div>
              <div className="flex-1 flex items-end gap-px relative">
                {(() => { const thresholds=[3,7,14,21]; let calDay=0; const calDays=routineDays.map(()=>calDay++); return thresholds.map(t => { const idx=calDays.findIndex(cd=>cd>=t); if(idx<0) return null; const pctPos=((idx+1)/routineDays.length)*100; return <div key={`t${t}`} className="absolute top-0 bottom-0 z-[1] pointer-events-none" style={{left:`${pctPos}%`}}><div className="absolute top-0 bottom-0 w-px" style={{background:'#94a3b8',opacity:0.4}}/><div className="absolute left-1/2 -translate-x-1/2 px-1 rounded bg-white border border-slate-200 text-slate-400 font-semibold whitespace-nowrap" style={{top:'-2px',fontSize:'clamp(7px, 0.9vh, 13px)'}}>{t}d</div></div>; }); })()}
                {routineDays.map((d,i) => {
                  if (d.isWeekend) return <div key={i} style={{flex:'0.3'}}/>;
                  const avail=d.available||0,emb=d.embargoed||0,bkd=d.booked||0,total=avail+emb+bkd;
                  if (total===0) return <div key={i} style={{flex:1}} className={d.isMonday&&i>0?'ml-0.5 pl-0.5 border-l border-slate-100':''}/>;
                  const pct=Math.max(4,(total/routineBarMax)*100); const delay=0.3+i*0.03;
                  return (<div key={i} style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'flex-end',height:'100%'}} className={d.isMonday&&i>0?'ml-0.5 pl-0.5 border-l border-slate-100':''}>
                    <div style={{height:`${pct}%`,display:'flex',flexDirection:'column',justifyContent:'flex-end',transformOrigin:'bottom',transform:'scaleY(0)',animation:`fsGrowbar 0.8s ease ${delay}s forwards, fsBarBreathe 5s ease-in-out ${delay+3}s infinite`}}>
                      {avail>0 && <div style={{height:`${(avail/total)*100}%`,background:'#10b981',borderRadius:'2px 2px 0 0',minHeight:1}}/>}
                      {emb>0 && <div style={{height:`${(emb/total)*100}%`,background:'#fbbf24',minHeight:1}}/>}
                      {bkd>0 && <div style={{height:`${(bkd/total)*100}%`,background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444',borderRadius:'0 0 2px 2px',minHeight:1}}/>}
                    </div></div>);
                })}
              </div>
              <div className="flex gap-px" style={{marginTop:'clamp(1px,0.2vh,3px)'}}>
                {routineDays.map((d,i) => { if(d.isWeekend) return <div key={i} style={{flex:'0.3'}}/>; return <div key={i} style={{flex:1,textAlign:'center'}} className={d.isMonday&&i>0?'ml-0.5 pl-0.5':''}><div style={{fontSize:'clamp(7px, 0.9vh, 13px)',color:i===0?'#1e293b':'#94a3b8',fontWeight:i===0?700:400,lineHeight:1.2}}>{d.dayName?.charAt(0)}</div><div style={{fontSize:'clamp(6px, 0.8vh, 12px)',color:i===0?'#475569':'#cbd5e1',fontWeight:i===0?600:400,lineHeight:1.2}}>{d.dayNum}</div></div>; })}
              </div>
            </div>
          </div>
        </div>

        </div>{/* end right column */}

      </div>
    </div>
  );
}
