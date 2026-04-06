'use client';
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { getHuddleCapacity, getCliniciansForDate, getClinicianLocationsForDate, getNDayAvailability, LOCATION_COLOURS, getDutyDoctor, getBand } from '@/lib/huddle';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS } from '@/lib/demandPredictor';

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
export default function HuddleFullscreen({ data, huddleData, viewingDate: viewingDateProp, onExit, onNavigateDay, screen: screenProp }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const [demandData, setDemandData] = useState(null);
  const [showFsChart, setShowFsChart] = useState(false);
  const [effectiveScreen, setEffectiveScreen] = useState(screenProp || null);
  const screen = effectiveScreen; // null = single, 1 = primary, 2 = secondary
  const dualMode = screen === 1 || screen === 2;
  const screen2WindowRef = useRef(null);

  // BroadcastChannel for dual-screen date sync
  const channelRef = useRef(null);
  useEffect(() => {
    channelRef.current = new BroadcastChannel('gpdash-huddle-sync');
    channelRef.current.onmessage = (e) => {
      if (e.data.type === 'navigate' && onNavigateDay) onNavigateDay(e.data.direction);
      if (e.data.type === 'exit') onExit?.();
    };
    return () => channelRef.current?.close();
  }, [onNavigateDay, onExit]);

  const syncNavigate = (dir) => {
    onNavigateDay?.(dir);
    channelRef.current?.postMessage({ type: 'navigate', direction: dir });
  };

  const openingScreen2Ref = useRef(false);

  const openScreen2 = () => {
    openingScreen2Ref.current = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    // Pass current viewing date to screen 2
    const dateParam = viewingDateProp ? `&date=${toLocalIso(viewingDateProp)}` : '';
    setTimeout(() => {
      const w = window.open(window.location.origin + `/?huddle=2${dateParam}`, 'gpdash-screen2', 'popup=yes');
      screen2WindowRef.current = w;
      setEffectiveScreen(1); // This screen becomes screen 1
      openingScreen2Ref.current = false;
    }, 100);
  };

  const exitDual = () => {
    channelRef.current?.postMessage({ type: 'exit' });
    screen2WindowRef.current?.close();
    onExit?.();
  };

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);
  const realToday = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const today = useMemo(() => { if (viewingDateProp) { const d = new Date(viewingDateProp); d.setHours(0,0,0,0); return d; } return realToday; }, [viewingDateProp, realToday]);
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getDay()];
  const dateKey = toLocalIso(today);
  const todayDateStr = useMemo(() => toHuddleDateStr(today), [today]);
  const hs = data?.huddleSettings || {};
  const messages = ensureArray(data?.huddleMessages || []);

  // Fullscreen API — skip in dual mode (use CSS overlay instead)
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  useEffect(() => {
    const el = containerRef.current;
    if (!dualMode && !screen) {
      if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
    const onFs = () => {
      if (!document.fullscreenElement && !openingScreen2Ref.current && !dualMode) {
        onExitRef.current();
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    const onKey = (e) => { if (e.key === 'Escape') { if (dualMode || screen) exitDual(); else onExitRef.current(); } };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('keydown', onKey); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); };
  }, [dualMode, screen]);

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
  const cardData = useMemo(() => { if(!huddleData) return []; return capacityCards.map(card=>{ const ov=saved[card.id]||allSlotsOverrides; const days=getNDayAvailability(huddleData,hs,14,ov); const w=days.filter(d=>d.available!==null&&!d.isWeekend); return {...card,avail:w.reduce((s,d)=>s+(d.available||0),0),emb:w.reduce((s,d)=>s+(d.embargoed||0),0),booked:w.reduce((s,d)=>s+(d.booked||0),0)}; }); }, [huddleData,hs,capacityCards,saved,allSlotsOverrides]);

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
  const getSiteCol = (name) => { const sites = data?.roomAllocation?.sites || []; const exact = sites.find(x => x.name === name); if (exact) return exact.colour || '#64748b'; if (!name) return '#64748b'; const lower = name.toLowerCase(); const fuzzy = sites.find(x => x.name.toLowerCase().startsWith(lower) || lower.startsWith(x.name.toLowerCase())); return fuzzy?.colour || '#64748b'; };
  const roleColMap = { gp: '#3b82f6', nursing: '#10b981', allied: '#a855f7' };
  const PersonCard = ({ person, delay, reason, location }) => {
    const isAbsent = !!reason;
    const roleCol = roleColMap[person.group] || '#64748b';
    const badgeCol = isAbsent ? '#ef4444' : roleCol;
    const displayName = person.title ? `${person.title} ${person.name}` : person.name;
    const locColour = location ? getSiteCol(location) : null;
    return (<div className="rounded-lg overflow-hidden fs-slidein" style={{animationDelay:`${delay}s`,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
      <div className="flex items-center" style={{padding:'clamp(3px,0.5vh,8px) clamp(4px,0.6vw,8px)',gap:'clamp(4px,0.5vw,8px)'}}>
        <div className="rounded-md flex items-center justify-center font-bold flex-shrink-0" style={{width:'clamp(24px,3vh,40px)',height:'clamp(24px,3vh,40px)',fontSize:'clamp(8px,1.1vh,13px)',background:badgeCol,color:'white',fontFamily:"'Outfit',sans-serif",boxShadow:`0 0 6px ${badgeCol}30`}}>{person.initials}</div>
        <div className="flex-1 min-w-0">
          <div className={`font-medium leading-tight truncate ${isAbsent ? 'text-slate-500' : 'text-slate-200'}`} style={{fontSize:'clamp(9px, 1.1vh, 14px)'}}>{displayName}</div>
          <div style={{fontSize:'clamp(7px, 0.9vh, 11px)',marginTop:'1px',color:isAbsent?'#f87171':'#64748b'}}>{reason || person.role || 'Staff'}</div>
        </div>
        {locColour && !isAbsent && <div className="rounded flex items-center justify-center font-bold text-white flex-shrink-0" style={{width:'clamp(14px,1.8vh,22px)',height:'clamp(14px,1.8vh,22px)',fontSize:'clamp(7px,0.9vh,11px)',background:locColour}}>{location?.charAt(0)}</div>}
      </div>
    </div>);
  };

  return (
    <div ref={containerRef} className="fixed inset-0 z-[9999] flex flex-col overflow-hidden" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)',fontFamily:"'DM Sans', system-ui, sans-serif"}}>
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
      <div className="flex items-center flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }} style={{ padding: 'clamp(8px, 1.5vh, 32px) clamp(16px, 2vw, 32px)' }}>
        <div className="flex items-center flex-1" style={{ gap: 'clamp(8px, 1.5vw, 20px)' }}>
          <div className="text-center" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)"}} style={{ borderRadius: 'clamp(6px, 1vh, 12px)', padding: 'clamp(4px, 0.8vh, 12px) clamp(10px, 1.5vw, 24px)' }}>
            <div className="font-extrabold text-white leading-none" style={{ fontSize: 'clamp(20px, 5vh, 64px)' }}>{today.getDate()}</div>
            <div className="text-slate-500 uppercase" style={{ fontSize: 'clamp(8px, 1.2vh, 14px)' }}>{MONTH_SHORT[today.getMonth()]}</div>
          </div>
          <div className="flex items-center" style={{ gap: 'clamp(6px, 1vw, 16px)' }}>
            {(onNavigateDay || screen === 2) && <button onClick={() => syncNavigate(-1)} className="rounded-lg text-slate-500 hover:text-white hover:bg-white/10 flex-shrink-0" style={{border:"1px solid rgba(255,255,255,0.08)"}} style={{padding:'clamp(4px,0.6vh,8px) clamp(6px,0.8vw,12px)',fontSize:'clamp(12px, 2vh, 28px)',lineHeight:1,width:'clamp(28px,3.5vw,44px)',textAlign:'center'}}>‹</button>}
            <div style={{ width: 'clamp(160px, 22vw, 300px)' }}>
              <div className="font-bold text-white" style={{ fontSize: 'clamp(16px, 3.5vh, 48px)' }}>{dayName}</div>
              <div className="text-slate-500" style={{ fontSize: 'clamp(10px, 1.5vh, 18px)' }}>{today.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</div>
            </div>
            {(onNavigateDay || screen === 2) && <button onClick={() => syncNavigate(1)} className="rounded-lg text-slate-500 hover:text-white hover:bg-white/10 flex-shrink-0" style={{border:"1px solid rgba(255,255,255,0.08)"}} style={{padding:'clamp(4px,0.6vh,8px) clamp(6px,0.8vw,12px)',fontSize:'clamp(12px, 2vh, 28px)',lineHeight:1,width:'clamp(28px,3.5vw,44px)',textAlign:'center'}}>›</button>}
          </div>
        </div>
        <div className="flex items-center" style={{ gap: 'clamp(10px, 2vw, 32px)' }}>
          <div className="flex items-center gap-1.5"><span className="rounded-full bg-emerald-500 fs-live-dot" style={{width:'clamp(6px,1vh,12px)',height:'clamp(6px,1vh,12px)'}}/><span className="text-slate-500" style={{fontSize:'clamp(10px, 1.5vh, 22px)'}}>Live</span></div>
          {tw && <span className="text-slate-500" style={{fontSize:'clamp(10px, 1.5vh, 22px)'}}>{Math.round(tw.temp)}°C · Feels {Math.round(tw.feelsLike)}°C{tw.precipMm>0?` · ${Math.round(tw.precipMm)}mm`:''}</span>}
          <LiveClock />
          {!screen && !dualMode && <button onClick={openScreen2} className="rounded-lg text-slate-500 hover:text-white hover:bg-white/10 flex items-center gap-1.5" style={{border:'1px solid rgba(255,255,255,0.08)',padding:'clamp(4px, 0.8vh, 14px) clamp(8px,1.2vw,20px)',fontSize:'clamp(10px,1.3vh,16px)'}}>
                <svg style={{width:'clamp(12px,1.5vh,18px)',height:'clamp(12px,1.5vh,18px)'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>
                2 Screen
              </button>}
              {dualMode && screen !== 2 && <>
                <span className="text-emerald-400 flex items-center gap-1.5" style={{fontSize:'clamp(9px,1.2vh,14px)'}}>
                  <svg style={{width:'clamp(10px,1.3vh,16px)',height:'clamp(10px,1.3vh,16px)'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>
                  Screen 1
                </span>
                <button onClick={() => containerRef.current?.requestFullscreen?.().catch(()=>{})} className="rounded-lg text-slate-500 hover:text-white hover:bg-white/10" style={{border:'1px solid rgba(255,255,255,0.08)',padding:'clamp(4px, 0.8vh, 14px) clamp(8px,1.2vw,20px)',fontSize:'clamp(10px,1.3vh,16px)'}}>Fullscreen</button>
              </>}
              {screen === 2 && <span className="text-emerald-400 flex items-center gap-1.5" style={{fontSize:'clamp(9px,1.2vh,14px)'}}>
                <svg style={{width:'clamp(10px,1.3vh,16px)',height:'clamp(10px,1.3vh,16px)'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="8" height="18" rx="1"/><rect x="14" y="3" width="8" height="18" rx="1"/></svg>
                Screen 2
              </span>}
              <button onClick={screen === 2 ? onExit : exitDual} className="rounded-lg text-slate-500 hover:text-white hover:bg-white/10" style={{border:'1px solid rgba(255,255,255,0.08)',padding:'clamp(4px, 0.8vh, 14px) clamp(8px,1.2vw,20px)',fontSize:'clamp(10px,1.3vh,16px)'}}>Exit</button>
        </div>
      </div>

      <NoticeTicker messages={messages} />

      {/* Main content — splits based on screen mode */}
      <div className="flex flex-1 min-h-0" style={{ gap: 'clamp(4px, 0.5vh, 10px)', padding: 'clamp(4px, 0.5vh, 10px)' }}>

        {/* LEFT COLUMN: Summary → Demand chart → Who's In */}
        <div className="flex-1 flex flex-col min-h-0" style={{ gap: 'clamp(4px, 0.5vh, 10px)' }}>

        {/* Summary card — matches Today page */}
        {screen !== 2 && (<>
        <div className="rounded-xl overflow-hidden flex-shrink-0" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{padding:'clamp(10px,1.5vh,20px) clamp(12px,1.5vw,24px)'}}>
            <div className="flex items-stretch" style={{gap:'clamp(10px,1.5vw,20px)'}}>
              {/* Gauge */}
              <div className="flex-shrink-0 flex items-center">
              {(() => {
                const gStops=[{pos:0,col:[239,68,68]},{pos:0.25,col:[245,158,11]},{pos:0.5,col:[16,185,129]},{pos:0.75,col:[16,185,129]},{pos:1.0,col:[59,130,246]}];
                const gColor=(t)=>{t=Math.max(0,Math.min(1,t));for(let i=0;i<gStops.length-1;i++){if(t>=gStops[i].pos&&t<=gStops[i+1].pos){const l=(t-gStops[i].pos)/(gStops[i+1].pos-gStops[i].pos);const a=gStops[i].col,b=gStops[i+1].col;return `rgb(${Math.round(a[0]+(b[0]-a[0])*l)},${Math.round(a[1]+(b[1]-a[1])*l)},${Math.round(a[2]+(b[2]-a[2])*l)})`;}}return 'rgb(59,130,246)';};
                const totalTarget = expectedAm + expectedPm;
                const cPct = totalTarget > 0 ? Math.round((urgentTotal / totalTarget) * 100) : 0;
                const gBands=[{min:0,max:0.2,label:'Short'},{min:0.2,max:0.3,label:'Tight'},{min:0.3,max:0.7,label:'Good'},{min:0.7,max:1,label:'Over'}];
                const fillF=Math.max(0,Math.min(1,(cPct-50)/100));
                const gBand=gBands.find(z=>fillF>=z.min&&fillF<z.max)||gBands[gBands.length-1];
                const endC=gColor(fillF);
                const gcx=100,gcy=80,gr=60,gSegs=50;
                const gPt=(f)=>({x:gcx+gr*Math.cos(Math.PI+f*Math.PI),y:gcy+gr*Math.sin(Math.PI+f*Math.PI)});
                const nPt=gPt(fillF);
                const nStub={x:gcx+gr*0.35*Math.cos(Math.PI+fillF*Math.PI),y:gcy+gr*0.35*Math.sin(Math.PI+fillF*Math.PI)};
                const tS=gPt(0),tE=gPt(1);
                const arcs=[];
                for(let i=0;i<Math.round(fillF*gSegs);i++){const t0=i/gSegs;const t1=Math.min((i+1.2)/gSegs,fillF);const a0=Math.PI+t0*Math.PI;const a1=Math.PI+t1*Math.PI;if(a1<=a0)continue;const p0=gPt(t0),p1={x:gcx+gr*Math.cos(a1),y:gcy+gr*Math.sin(a1)};arcs.push(<path key={i} d={`M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${gr} ${gr} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`} fill="none" stroke={gColor(t0)} strokeWidth="9" strokeLinecap="round"/>);}
                return <svg viewBox="0 0 200 100" style={{width:'clamp(200px,25vw,400px)',height:'clamp(100px,12.5vh,200px)'}}>
                  <path d={`M ${tS.x.toFixed(1)} ${tS.y.toFixed(1)} A ${gr} ${gr} 0 1 1 ${tE.x.toFixed(1)} ${tE.y.toFixed(1)}`} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="9" strokeLinecap="round"/>
                  {arcs}
                  <line x1={gcx} y1={gcy} x2={nStub.x.toFixed(1)} y2={nStub.y.toFixed(1)} stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx={nPt.x.toFixed(1)} cy={nPt.y.toFixed(1)} r="5" fill={endC} stroke="#0f172a" strokeWidth="2.5" style={{filter:`drop-shadow(0 0 6px ${endC})`}}/>
                  <circle cx={gcx} cy={gcy} r="3" fill="#1e293b" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5"/>
                  <rect x={gcx-38} y={gcy-38} width="76" height="36" rx="8" fill="rgba(15,23,42,0.9)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
                  <text x={gcx} y={gcy-16} textAnchor="middle" fill="white" style={{fontFamily:"'Space Mono',monospace",fontSize:22,fontWeight:700}}>{cPct}%</text>
                  <text x={gcx} y={gcy-2} textAnchor="middle" fill={endC} style={{fontFamily:"'Outfit',sans-serif",fontSize:11,fontWeight:500}}>{gBand.label}</text>
                  <text x={gcx} y={gcy+14} textAnchor="middle" fill="#475569" style={{fontSize:9}}>{urgentTotal} / {totalTarget} target</text>
                </svg>;
              })()}
              </div>
              {/* 4 stat squares */}
              <div className="flex-1" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'clamp(4px,0.6vh,10px)'}}>
                <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'clamp(6px,0.8vh,12px)',padding:'clamp(6px,0.8vh,14px) clamp(8px,1vw,14px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(8px,1vh,13px)'}}>Predicted demand</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontWeight:700,color:'#fbbf24',fontSize:'clamp(20px,3.5vh,44px)',lineHeight:1}}>{predicted || '—'}</div>
                  <div className="text-slate-600" style={{fontSize:'clamp(7px,0.9vh,11px)'}}>requests today</div>
                </div>
                <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'clamp(6px,0.8vh,12px)',padding:'clamp(6px,0.8vh,14px) clamp(8px,1vw,14px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(8px,1vh,13px)'}}>Urgent available</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontWeight:700,color:arcColour,fontSize:'clamp(20px,3.5vh,44px)',lineHeight:1}}>{availAm + availPm}</div>
                  <div className="text-slate-600" style={{fontSize:'clamp(7px,0.9vh,11px)'}}>appointments today</div>
                </div>
                <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'clamp(6px,0.8vh,12px)',padding:'clamp(6px,0.8vh,14px) clamp(8px,1vw,14px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(8px,1vh,13px)'}}>Routine 28 days</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontWeight:700,color:'#34d399',fontSize:'clamp(20px,3.5vh,44px)',lineHeight:1}}>{routineDays.filter(d=>d.available!==null&&!d.isWeekend).reduce((s,d)=>s+(d.available||0)+(d.embargoed||0),0)}</div>
                  <div className="text-slate-600" style={{fontSize:'clamp(7px,0.9vh,11px)'}}>available</div>
                </div>
                <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'clamp(6px,0.8vh,12px)',padding:'clamp(6px,0.8vh,14px) clamp(8px,1vw,14px)'}}>
                  <div className="text-slate-500" style={{fontSize:'clamp(8px,1vh,13px)'}}>Clinicians today</div>
                  <div style={{fontFamily:"'Space Mono',monospace",fontWeight:700,color:'white',fontSize:'clamp(20px,3.5vh,44px)',lineHeight:1}}>{categories.inPractice.length}</div>
                  <div className="text-slate-600" style={{fontSize:'clamp(7px,0.9vh,11px)'}}>of {visibleStaff.length} active</div>
                </div>
              </div>
            </div>
          </div>
          {/* Demand prediction insight */}
          {t && <div style={{borderTop:'1px solid rgba(255,255,255,0.04)',padding:'clamp(6px,0.8vh,12px) clamp(12px,1.5vw,24px)'}}>
            <div className="flex items-center" style={{gap:'clamp(4px,0.5vw,8px)'}}>
              <svg style={{width:'clamp(10px,1.3vh,16px)',height:'clamp(10px,1.3vh,16px)',flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke={vsPct>3?'#f59e0b':vsPct<-3?'#10b981':'#94a3b8'} strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <span style={{fontSize:'clamp(9px,1.2vh,15px)',fontWeight:500,color:vsPct>3?'#f59e0b':vsPct<-3?'#10b981':'#94a3b8'}}>{vsPct>3?'Higher than normal':vsPct<-3?'Lower than normal':'Typical'} for a {dayName}</span>
            </div>
            {topFactors.length > 0 && <div className="flex gap-1 flex-wrap" style={{marginTop:'clamp(3px,0.4vh,6px)'}}>
              {topFactors.map((f,i) => <span key={i} style={{fontSize:'clamp(7px,0.9vh,12px)',fontWeight:500,padding:'1px 5px',borderRadius:10,background:f.effect>=0?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)',color:f.effect>=0?'#f87171':'#34d399'}}>{f.effect>=0?'↑':'↓'} {f.label} {f.effect>0?'+':''}{Math.round(f.effect)}</span>)}
            </div>}
          </div>}
        </div>

        </>)}
        {/* Demand chart — collapsible dark card */}
        {screen !== 1 && (<>
        <div className="rounded-xl bg-slate-900 overflow-hidden border border-slate-800 flex-shrink-0">
          <button onClick={() => setShowFsChart(p => !p)} className="w-full flex items-center justify-between" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)',background:'none',border:'none',cursor:'pointer'}}>
            <div className="flex items-center gap-2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg><span className="font-semibold text-slate-200" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>14-day demand forecast</span></div>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{transform:showFsChart?'rotate(180deg)':'none',transition:'transform 0.2s'}}><path d="M6 9l6 6 6-6"/></svg>
          </button>
          {showFsChart && <div className="flex-1 flex flex-col min-h-0" style={{padding:'clamp(4px,0.5vh,8px)'}}>
            <div className="flex-1 px-2 pt-1 relative" style={{minHeight:'clamp(60px,10vh,140px)',height:'clamp(80px,14vh,180px)'}}><canvas ref={chartRef}/></div>
          </div>}
        </div>

        </>)}
        {/* Who's In — left column */}
        {screen !== 1 && (<>
        <div className="rounded-xl overflow-hidden flex flex-col flex-1" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="flex items-center justify-between flex-shrink-0" style={{background:"rgba(15,23,42,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)",padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)'}}>
            <span className="font-semibold text-white" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>Who&apos;s in today</span>
            <span className="text-white/60" style={{fontSize:'clamp(8px, 1.2vh, 16px)'}}>{categories.inPractice.length} in · {categories.leaveAbsent.length} absent</span>
          </div>
          <div className="flex-1 overflow-auto" style={{padding:'clamp(4px,0.7vh,16px)'}}>
            <div className="grid grid-cols-3 h-full" style={{gap:'clamp(4px,0.6vw,12px)'}}>
              <div className="overflow-hidden"><div className="text-slate-500 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-blue-500"/> Clinicians <span className="text-slate-400">{gpTeam.length}</span></div><div style={{display:'flex',flexDirection:'column',gap:'clamp(2px, 0.5vh, 6px)'}}>{gpTeam.map((e,i) => <PersonCard key={e.person.id} person={e.person} delay={0.1+i*0.05} location={personLocationMap[e.person.id]}/>)}</div></div>
              <div className="overflow-hidden"><div className="text-slate-500 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-emerald-500"/> Nursing <span className="text-slate-300">{nursingTeam.length}</span></div><div style={{display:'flex',flexDirection:'column',gap:'clamp(2px, 0.5vh, 6px)'}}>{nursingTeam.map((e,i) => <PersonCard key={e.person.id} person={e.person} delay={0.15+i*0.05} location={personLocationMap[e.person.id]}/>)}</div>{othersTeam.length>0 && <><div className="text-slate-500 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginTop:'clamp(4px,0.6vh,12px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-purple-500"/> Others <span className="text-slate-300">{othersTeam.length}</span></div><div style={{display:'flex',flexDirection:'column',gap:'clamp(2px, 0.5vh, 6px)'}}>{othersTeam.map((e,i)=><PersonCard key={e.person.id} person={e.person} delay={0.3+i*0.05} location={personLocationMap[e.person.id]}/>)}</div></>}</div>
              <div className="overflow-hidden"><div className="text-slate-500 uppercase tracking-wider flex items-center gap-1.5" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginBottom:'clamp(2px,0.5vh,8px)'}}><span className="w-2 h-2 rounded-full bg-red-500"/> Absent <span className="text-slate-400">{categories.leaveAbsent.length}</span></div><div style={{display:'flex',flexDirection:'column',gap:'clamp(2px, 0.5vh, 6px)'}}>{categories.leaveAbsent.map((e,i) => <PersonCard key={e.person.id} person={e.person} delay={0.2+i*0.05} reason={e.reason}/>)}</div>{categories.leaveAbsent.length===0 && <div className="text-slate-300" style={{fontSize:'clamp(10px, 1.4vh, 20px)',padding:'0 8px'}}>None</div>}{categories.dayOff.length>0 && <div className="text-slate-300" style={{fontSize:'clamp(8px, 1.2vh, 16px)',marginTop:'clamp(4px,0.8vh,16px)'}}>+ {categories.dayOff.length} day off</div>}</div>
            </div>
          </div>
        </div>

        </>)}
        </div>{/* end left column */}

        {/* RIGHT COLUMN: Urgent → Routine */}
        <div className="flex-1 flex flex-col min-h-0" style={{ gap: 'clamp(4px, 0.5vh, 10px)' }}>

        {/* TR: Urgent — AM/PM side by side with proportional bars */}
        {screen !== 2 && (<>
        <div className="rounded-xl overflow-hidden flex flex-col" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="flex items-center justify-between flex-shrink-0" style={{background:"rgba(15,23,42,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)",padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)'}}>
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
                return { name: m?.name || dutyDoc.name, title: m?.title, location: dutyDoc.location, total: dutyInList?.total || 0, avail: (dutyInList?.available||0) + (dutyInList?.embargoed||0), booked: dutyInList?.booked||0 };
              })() : null;

              // Duty support
              const cliniciansAfterDuty = dutyDisplay
                ? allCliniciansList.filter(c => !matchesStaffMember(c.name, { name: dutyDisplay.name, aliases: [] }))
                : allCliniciansList;
              const supportCandidates = cliniciansAfterDuty.filter(c => !c.displayName?.toLowerCase().includes('balson'));
              const sortedSupport = [...supportCandidates].sort((a, b) => b.total - a.total);
              const topSupport = sortedSupport[0] || null;
              const runnerUp = sortedSupport[1] || null;
              const dutySupportClin = topSupport && topSupport.total >= 5 && topSupport.total >= ((runnerUp?.total || 0) + 2) ? topSupport : null;
              const dutySupportDisplay = dutySupportClin ? dutySupportClin : null;

              const clinicians = dutySupportDisplay
                ? cliniciansAfterDuty.filter(c => c.name !== dutySupportDisplay.name)
                : cliniciansAfterDuty;

              const dutyLocCol = dutyDisplay?.location ? getSiteCol(dutyDisplay.location) : null;
              const dutyLocLetter = dutyDisplay?.location ? dutyDisplay.location.charAt(0) : '';
              const supportLocCol = dutySupportDisplay?.location ? getSiteCol(dutySupportDisplay.location) : null;
              const supportLocLetter = dutySupportDisplay?.location ? dutySupportDisplay.location.charAt(0) : '';
              return (
                <div key={si} className="flex-1 flex flex-col overflow-auto" style={{borderLeft:si===1?'1px solid rgba(255,255,255,0.04)':undefined}}>
                  <div style={{background:'rgba(15,23,42,0.85)',padding:'clamp(4px,0.6vh,10px) clamp(6px,0.8vw,14px)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <span className="text-slate-400" style={{fontSize:'clamp(9px,1.2vh,14px)',fontFamily:"'Outfit',sans-serif"}}>{s.label}</span>
                  </div>
                  <div style={{padding:'clamp(6px,1vh,14px)',background:'rgba(15,23,42,0.4)',flex:1,display:'flex',flexDirection:'column',overflow:'auto'}}>
                    <div className="flex items-center flex-shrink-0" style={{gap:'clamp(4px,0.8vw,10px)',marginBottom:'clamp(2px,0.4vh,4px)'}}>
                      <span className="font-extrabold leading-none" style={{color:s.band.colour,fontSize:'clamp(28px, 5vh, 64px)',fontFamily:"'Space Mono',monospace"}}>{s.slots}</span>
                      <div className="flex-1">
                        <div className="relative">
                          <div className="rounded-full overflow-hidden" style={{height:'clamp(6px,0.8vh,10px)',background:'rgba(255,255,255,0.08)'}}>
                            <div className="absolute left-0 top-0 bottom-0 flex" style={{width:`${Math.min(fillPct,100)}%`,borderRadius:'5px'}}>
                              {s.avail > 0 && <div style={{flex: s.avail, background: s.band.colour}} />}
                              {s.booked > 0 && <div style={{flex: s.booked, background: '#f59e0b'}} />}
                            </div>
                          </div>
                          {s.target>0 && <div className="absolute" style={{left:`${Math.min(markerPct,100)}%`,top:'50%',transform:'translate(-50%,-50%)',zIndex:1}}><div style={{width:'clamp(8px,1vh,14px)',height:'clamp(8px,1vh,14px)',borderRadius:'50%',border:`2px solid ${s.band.colour}`,background:'#0f172a',boxShadow:`0 0 6px ${s.band.colour}`}}/></div>}
                        </div>
                        <div className="flex items-center justify-between" style={{marginTop:'clamp(2px,0.4vh,6px)'}}>
                          <div className="flex items-center" style={{gap:'clamp(3px,0.4vw,6px)'}}>
                            <span style={{fontSize:'clamp(7px,1vh,12px)',padding:'1px 5px',borderRadius:10,background:`${s.band.colour}20`,color:s.band.colour,fontWeight:500}}>{s.band.label} · {Math.round(s.band.pct)}%</span>
                            <span style={{fontSize:'clamp(7px,1vh,12px)',color:'#94a3b8'}}>{s.avail} available{s.booked>0?` · ${s.booked} booked`:''}</span>
                          </div>
                          {s.target>0 && <span style={{fontSize:'clamp(7px,1vh,12px)',color:'#475569'}}>target {s.target}</span>}
                        </div>
                      </div>
                    </div>
                    {dutyDisplay && (
                      <div className="rounded-lg overflow-hidden flex-shrink-0" style={{marginBottom:'clamp(2px,0.3vh,4px)',background:'#dc2626',boxShadow:'0 2px 6px rgba(220,38,38,0.2)'}}>
                        <div className="flex items-center" style={{gap:'clamp(4px,0.5vw,8px)',padding:'clamp(3px,0.5vh,8px) clamp(6px,0.8vw,10px)'}}>
                          <svg style={{width:'clamp(12px,1.5vh,18px)',height:'clamp(12px,1.5vh,18px)',flexShrink:0}} viewBox="0 0 24 24" fill="white"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white truncate" style={{fontSize:'clamp(9px,1.3vh,16px)'}}>{dutyDisplay.title ? `${dutyDisplay.title} ` : ''}{dutyDisplay.name}</div>
                            <div style={{fontSize:'clamp(7px,0.9vh,11px)',color:'rgba(255,255,255,0.6)'}}>Duty · {dutyDisplay.location||'?'}</div>
                          </div>
                          <span className="font-bold text-white flex-shrink-0" style={{fontSize:'clamp(10px,1.4vh,18px)',fontFamily:"'Space Mono',monospace"}}>{dutyDisplay.total}</span>
                        </div>
                      </div>
                    )}
                    {dutySupportDisplay && (
                      <div className="rounded-lg overflow-hidden flex-shrink-0" style={{marginBottom:'clamp(3px,0.5vh,8px)',background:'#2563eb',boxShadow:'0 2px 6px rgba(37,99,235,0.2)'}}>
                        <div className="flex items-center" style={{gap:'clamp(4px,0.5vw,8px)',padding:'clamp(3px,0.5vh,8px) clamp(6px,0.8vw,10px)'}}>
                          <svg style={{width:'clamp(12px,1.5vh,18px)',height:'clamp(12px,1.5vh,18px)',flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white truncate" style={{fontSize:'clamp(9px,1.3vh,16px)'}}>{dutySupportDisplay.displayName}</div>
                            <div style={{fontSize:'clamp(7px,0.9vh,11px)',color:'rgba(255,255,255,0.6)'}}>Support · {dutySupportDisplay.location||'?'}</div>
                          </div>
                          <span className="font-bold text-white flex-shrink-0" style={{fontSize:'clamp(10px,1.4vh,18px)',fontFamily:"'Space Mono',monospace"}}>{dutySupportDisplay.total}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex flex-col flex-1 overflow-auto" style={{gap:'clamp(2px,0.3vh,4px)'}}>
                      {clinicians.map((c,i) => {
                        const locCol = c.location ? getSiteCol(c.location) : null;
                        return (
                        <div key={i} className="rounded-md flex items-center justify-between fs-slidein" style={{animationDelay:`${0.3+i*0.06}s`,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',padding:'clamp(2px,0.4vh,6px) clamp(4px,0.6vw,8px)'}}>
                          <div className="flex items-center min-w-0" style={{gap:'clamp(4px,0.5vw,8px)'}}>
                            <div className="rounded-md flex items-center justify-center font-bold text-white flex-shrink-0" style={{width:'clamp(22px,3vh,36px)',height:'clamp(22px,3vh,36px)',fontSize:'clamp(8px,1vh,12px)',fontFamily:"'Outfit',sans-serif",background:s.band.colour,boxShadow:`0 0 4px ${s.band.colour}30`}}>{(c.displayName||'').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}</div>
                            <span className="truncate" style={{fontSize:'clamp(9px,1.3vh,15px)',color:'#e2e8f0'}}>{c.displayName}</span>
                          </div>
                          <div className="flex items-center flex-shrink-0" style={{gap:'clamp(3px,0.4vw,6px)'}}>
                            <span className="font-bold" style={{color:s.band.colour,fontSize:'clamp(9px,1.2vh,14px)',fontFamily:"'Space Mono',monospace"}}>{c.total}</span>
                            {c.location && <div className="rounded flex items-center justify-center font-bold text-white" style={{width:'clamp(14px,1.6vh,22px)',height:'clamp(14px,1.6vh,22px)',fontSize:'clamp(7px,0.9vh,11px)',background:locCol||'#64748b'}}>{c.location.charAt(0)}</div>}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        </>)}
        {/* Routine capacity — right column */}
        {screen !== 1 && (<>
        <div className="rounded-xl overflow-hidden flex flex-col" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', border:'1px solid #334155'}}>
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 flex items-center justify-between flex-shrink-0" style={{padding:'clamp(4px, 0.8vh, 14px) clamp(8px, 1.2vw, 24px)'}}>
            <span className="font-semibold text-white" style={{fontSize:'clamp(10px, 1.5vh, 20px)'}}>Routine capacity</span>
            <span className="text-white/70" style={{fontSize:'clamp(8px, 1.2vh, 16px)'}}>30-day overview</span>
          </div>
          <div className="flex-1 flex flex-col overflow-hidden" style={{padding:'clamp(4px,0.5vh,12px)',gap:'clamp(2px,0.4vh,10px)'}}>
            <div className="flex justify-center flex-shrink-0" style={{gap:'clamp(4px,1vw,16px)'}}>{routineGauges.map((g,i) => <GaugeSVG key={i} pct={g.pct} colour={g.colour} label={g.label} delay={i}/>)}</div>
            {cardData.length>0 && <div className="flex flex-shrink-0" style={{gap:'clamp(3px,0.5vw,12px)'}}>{cardData.map((c,i) => {
              const CARD_COLOURS = {rose:{bg:'#fff1f2',border:'#fecdd3',text:'#be123c'},violet:{bg:'#f5f3ff',border:'#ddd6fe',text:'#6d28d9'},blue:{bg:'#eff6ff',border:'#bfdbfe',text:'#1d4ed8'},amber:{bg:'#fffbeb',border:'#fde68a',text:'#b45309'},emerald:{bg:'#ecfdf5',border:'#a7f3d0',text:'#047857'},teal:{bg:'#f0fdfa',border:'#99f6e4',text:'#0f766e'},slate:{bg:'#f8fafc',border:'#e2e8f0',text:'#475569'},sky:{bg:'#f0f9ff',border:'#bae6fd',text:'#0369a1'}};
              const cc = CARD_COLOURS[c.colour] || CARD_COLOURS.violet;
              return (
              <div key={c.id} className="flex-1 rounded-lg text-center fs-fadein" style={{animationDelay:`${0.6+i*0.1}s`,padding:'clamp(3px,0.5vh,12px)',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)'}}>
                <div className="font-semibold" style={{fontSize:'clamp(10px, 1.4vh, 20px)',color:'#e2e8f0'}}>{c.title}</div>
                <div style={{fontSize:'clamp(7px,0.8vh,10px)',color:cc.text,opacity:0.6,marginBottom:'clamp(2px,0.3vh,6px)'}}>14 days</div>
                <div className="flex justify-center" style={{gap:'clamp(2px,0.3vw,8px)'}}>
                  <div className="text-center"><div className="bg-emerald-100 text-emerald-800 rounded-lg font-bold" style={{padding:'clamp(1px,0.2vh,4px) clamp(4px,0.6vw,12px)',fontSize:'clamp(12px, 1.8vh, 24px)'}}>{c.avail}</div><div className="text-slate-500" style={{fontSize:'clamp(7px,0.8vh,10px)',marginTop:'1px'}}>available</div></div>
                  <div className="text-center"><div className="bg-amber-100 text-amber-800 rounded-lg font-bold" style={{padding:'clamp(1px,0.2vh,4px) clamp(4px,0.6vw,12px)',fontSize:'clamp(12px, 1.8vh, 24px)'}}>{c.emb}</div><div className="text-slate-500" style={{fontSize:'clamp(7px,0.8vh,10px)',marginTop:'1px'}}>embargoed</div></div>
                  <div className="text-center"><div className="bg-slate-100 text-slate-600 rounded-lg font-bold" style={{padding:'clamp(1px,0.2vh,4px) clamp(4px,0.6vw,12px)',fontSize:'clamp(12px, 1.8vh, 24px)'}}>{c.booked}</div><div className="text-slate-500" style={{fontSize:'clamp(7px,0.8vh,10px)',marginTop:'1px'}}>booked</div></div>
                </div>
              </div>
            );})}</div>}
            <div className="flex-1 flex flex-col" style={{minHeight:'clamp(80px,12vh,200px)'}}>
              <div className="flex justify-between" style={{marginBottom:'clamp(1px,0.3vh,4px)'}}><span className="text-slate-500" style={{fontSize:'clamp(8px, 1.1vh, 14px)'}}>All routine · 30 days</span><div className="flex text-slate-400" style={{gap:'clamp(3px,0.5vw,8px)',fontSize:'clamp(7px, 1vh, 14px)'}}><span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-emerald-400"/>Available</span><span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm bg-amber-300"/>Embargoed</span><span className="flex items-center gap-1"><span className="w-2 h-1.5 rounded-sm" style={{background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444'}}/>Booked</span></div></div>
              <div className="flex-1 flex items-end gap-px relative">
                {(() => { const thresholds=[3,7,14,21]; let calDay=0; const calDays=routineDays.map(()=>calDay++); return thresholds.map(t => { const idx=calDays.findIndex(cd=>cd>=t); if(idx<0) return null; const pctPos=((idx+1)/routineDays.length)*100; return <div key={`t${t}`} className="absolute top-0 bottom-0 z-[1] pointer-events-none" style={{left:`${pctPos}%`}}><div className="absolute top-0 bottom-0 w-px" style={{background:'#94a3b8',opacity:0.4}}/><div className="absolute left-1/2 -translate-x-1/2 px-1 rounded text-slate-500 font-semibold whitespace-nowrap" style={{top:'-2px',fontSize:'clamp(7px, 0.9vh, 13px)'}}>{t}d</div></div>; }); })()}
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

        </>)}
        </div>{/* end right column */}

      </div>
    </div>
  );
}
