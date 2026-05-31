'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getHuddleCapacity, getDateTotals, getDutyDoctor, getSiteColour } from '@/lib/huddle';
import { matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { predictDemand, getWeatherForecast } from '@/lib/demandPredictor';
import { getSchoolHolidaysForLEA } from '@/lib/school-holidays-by-lea';
import ClinicianCapacity from './ClinicianCapacity';
import SlotFilter from './SlotFilter';
import { canEditPracticeData } from '@/lib/permissions';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const VB = { over:{bg:'#3b82f6',text:'#fff'}, good:{bg:'#10b981',text:'#fff'}, tight:{bg:'#f59e0b',text:'#fff'}, short:{bg:'#ef4444',text:'#fff'}, none:{bg:'#475569',text:'#94a3b8'} };
function vBand(s,t) { if(t<=0)return VB.none; const p=(s/t)*100; return p>=120?VB.over:p>=90?VB.good:p>=80?VB.tight:VB.short; }

// DOW-relative demand colouring. Caller passes the per-practice dow-specific
// baseline (computed from the practice's own demand_settings if calibrated,
// or the list-size-scaled fallback if not). Earlier this used the raw
// Winscombe-shaped BASELINE + DOW_EFFECTS constants for every practice.
function dowDemandColour(predicted, dowBaseline) {
  if (!predicted || !dowBaseline || dowBaseline <= 0) return { bg: '#475569', text: '#fff', label: '–' };
  const ratio = predicted / dowBaseline;
  if (ratio <= 0.9) return { bg: '#0ea5e9', text: '#fff', label: 'Low' };
  if (ratio <= 1.1) return { bg: '#10b981', text: '#fff', label: 'Normal' };
  if (ratio <= 1.25) return { bg: '#f59e0b', text: '#fff', label: 'High' };
  return { bg: '#ef4444', text: '#fff', label: 'V.High' };
}

// PredictionBand — sits at the top of the day-detail panel and explains
// the demand prediction for that date. Pulls from pred.factors to list
// the biggest contributors (e.g. "Mondays +12, school holiday +8") so a
// number like "Predicted 87 — HIGH" doesn't appear as a black box.
//
// Skipped entirely on bank holidays (no prediction is run) and on days
// with no prediction (pred = null, e.g. far-future weekends).
function PredictionBand({ day, convRate }) {
  if (!day || day.isBH || !day.pred?.predicted) return null;
  const pred = day.pred;
  const predicted = Math.round(pred.predicted);
  const needed = Math.round(predicted * (convRate || 0.25));
  const dc = day.dc;
  const conf = pred.confidence;
  const confLow = conf?.low ? Math.round(conf.low) : null;
  const confHigh = conf?.high ? Math.round(conf.high) : null;

  // Pull the top-3 contributing factors by absolute effect size. We skip
  // the baseline itself (always present and not "informative") and skip
  // the dayOfWeek factor when the user is already looking at e.g. a
  // Tuesday (it's tautological). Sort by |effect| descending.
  const factorEntries = [];
  const f = pred.factors || {};
  if (f.dayOfWeek?.effect) factorEntries.push({ label: f.dayOfWeek.day || 'Day of week', effect: f.dayOfWeek.effect });
  if (f.month?.effect) factorEntries.push({ label: 'Time of year', effect: f.month.effect });
  if (f.schoolHoliday) factorEntries.push({ label: 'School holiday', effect: f.schoolHoliday });
  if (f.firstWeekBack) factorEntries.push({ label: 'First week back', effect: f.firstWeekBack });
  if (f.firstDayBack) factorEntries.push({ label: 'First day back from break', effect: f.firstDayBack });
  if (f.secondDayBack) factorEntries.push({ label: 'Second day back', effect: f.secondDayBack });
  if (f.nearBankHoliday) factorEntries.push({ label: `Near bank holiday (${f.nearBankHoliday.daysAway}d)`, effect: f.nearBankHoliday.effect });
  if (f.christmasPeriod) factorEntries.push({ label: 'Christmas period', effect: f.christmasPeriod });
  if (f.endOfMonth) factorEntries.push({ label: 'End of month', effect: f.endOfMonth });
  if (f.shortWeek?.effect) factorEntries.push({ label: `Short week (${f.shortWeek.workingDays}d)`, effect: f.shortWeek.effect });
  if (f.weather?.effect) factorEntries.push({ label: f.weather.label || 'Weather', effect: f.weather.effect });
  if (f.heavyRain?.effect) factorEntries.push({ label: 'Heavy rain', effect: f.heavyRain.effect });
  if (f.postRainRebound?.effect) factorEntries.push({ label: 'Post-rain rebound', effect: f.postRainRebound.effect });
  if (f.mediaOverride?.effect) factorEntries.push({ label: f.mediaOverride.label || 'Media event', effect: f.mediaOverride.effect });
  factorEntries.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const topFactors = factorEntries.slice(0, 3);

  return (
    <div className="px-5 py-3" style={{ background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
      <div className="flex items-center gap-4 flex-wrap">
        {/* Headline number + band */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono-data text-2xl font-bold" style={{ color: dc.bg }}>{predicted}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">predicted</span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: dc.bg, color: dc.text }}>{dc.label}</span>
        </div>
        {/* Conversion-implied urgent need */}
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono-data text-base font-bold text-amber-400">{needed}</span>
          <span className="text-[10px] text-slate-500">urgent slots needed</span>
        </div>
        {/* Confidence band */}
        {confLow !== null && confHigh !== null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-slate-500">range</span>
            <span className="font-mono-data text-xs text-slate-400">{confLow}–{confHigh}</span>
          </div>
        )}
        {/* Fallback warning — practice hasn't calibrated its model */}
        {pred.usingFallback && (
          <span className="text-[10px] text-amber-400 italic">estimate (no calibration)</span>
        )}
      </div>
      {/* Top factors row */}
      {topFactors.length > 0 && (
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Drivers:</span>
          {topFactors.map((tf, i) => {
            const sign = tf.effect > 0 ? '+' : '';
            const colour = tf.effect > 0 ? '#fbbf24' : '#34d399';
            return (
              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-slate-400">{tf.label}</span>
                <span className="ml-1 font-mono-data font-bold" style={{ color: colour }}>{sign}{Math.round(tf.effect)}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DonutGauge({ avail, emb, booked }) {
  const total = avail + emb + booked;
  if (total === 0) return <div className="text-xs text-slate-500 text-center py-4">No routine data</div>;
  const r = 30, c = 2 * Math.PI * r;
  const aLen = (avail/total)*c, eLen = (emb/total)*c, bLen = (booked/total)*c;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 80 80" style={{width:68,height:68,flexShrink:0}}>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#334155" strokeWidth="8"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray={`${aLen} ${c}`} strokeDashoffset="0" transform="rotate(-90 40 40)"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#f59e0b" strokeWidth="8" strokeDasharray={`${eLen} ${c}`} strokeDashoffset={`${-aLen}`} transform="rotate(-90 40 40)"/>
        <circle cx="40" cy="40" r={r} fill="none" stroke="#ef4444" strokeWidth="8" strokeDasharray={`${bLen} ${c}`} strokeDashoffset={`${-(aLen+eLen)}`} transform="rotate(-90 40 40)"/>
        <text x="40" y="38" textAnchor="middle" fill="#e2e8f0" style={{fontSize:14,fontWeight:800}}>{total}</text>
        <text x="40" y="49" textAnchor="middle" fill="#64748b" style={{fontSize:8}}>total</text>
      </svg>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/><span className="text-[11px] text-slate-400">Available</span><span className="text-xs font-bold text-emerald-400 ml-auto">{avail}</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/><span className="text-[11px] text-slate-400">Embargoed</span><span className="text-xs font-bold text-amber-400 ml-auto">{emb}</span></div>
        <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444'}}/><span className="text-[11px] text-slate-400">Booked</span><span className="text-xs font-bold text-red-400 ml-auto">{booked}</span></div>
      </div>
    </div>
  );
}

// WeeklyRoutineBullet — sits in the right column of each week row in the
// desktop calendar. Renders a horizontal bullet chart: thin track, comfort
// band (±10% of target) overlaid, filled bar (offered slots vs target),
// purple target tick. Bar colour comes from vBand() — same green/amber/red
// language used everywhere else on the page so the eye links a "tight"
// week here to a "tight" day in the cells. If no target is set we just
// show the raw offered number.
//
// Future enhancement: add a hashed projected tail for the current week
// once we have a booking-pace coefficient (needs a few weeks of CSV
// uploads to learn the practice's advance booking curve).
function WeeklyRoutineBullet({ wk, rTarget }) {
  const offered = wk.wR || 0;
  if (offered <= 0) return <div className="h-full flex items-center justify-center"><span className="text-[10px] text-slate-600">—</span></div>;
  if (rTarget <= 0) {
    return (
      <div className="h-full flex flex-col justify-center px-2">
        <div className="text-base font-bold text-emerald-400 leading-none">{offered}</div>
        <div className="text-[9px] text-slate-500 mt-1">slots offered</div>
      </div>
    );
  }
  const band = vBand(offered, rTarget);
  const maxScale = rTarget * 1.3;
  const valuePct = Math.min(100, (offered / maxScale) * 100);
  const targetPct = (rTarget / maxScale) * 100;       // 76.92%
  const comfortLowPct = (rTarget * 0.9 / maxScale) * 100;  // 69.23%
  const comfortHighPct = (rTarget * 1.1 / maxScale) * 100; // 84.62%
  const delta = offered - rTarget;
  return (
    <div className="h-full flex flex-col justify-center px-2.5">
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-base font-bold leading-none" style={{color: band.bg}}>{offered}</span>
        <span className="text-[9px] text-slate-500">/ {rTarget}</span>
      </div>
      <div className="relative" style={{height: 8}}>
        <div className="absolute inset-0 rounded-sm" style={{background: 'rgba(255,255,255,0.06)'}}/>
        <div className="absolute top-0 bottom-0" style={{left: `${comfortLowPct}%`, right: `${100 - comfortHighPct}%`, background: 'rgba(16,185,129,0.13)', borderLeft: '1px dashed rgba(16,185,129,0.35)', borderRight: '1px dashed rgba(16,185,129,0.35)'}}/>
        <div className="absolute left-0 rounded-sm" style={{width: `${valuePct}%`, top: 1.5, bottom: 1.5, background: band.bg}}/>
        <div className="absolute" style={{left: `${targetPct}%`, top: -2, bottom: -2, width: 2, background: '#a78bfa', transform: 'translateX(-1px)', borderRadius: 1}}/>
      </div>
      <div className="text-[9px] mt-1.5" style={{color: band.bg, opacity: 0.85}}>
        {delta >= 0 ? '+' : ''}{delta} vs target
      </div>
    </div>
  );
}

export default function HuddleForward({ data, saveData, huddleData, setActiveSection }) {
  const canEdit = canEditPracticeData(data);
  const [selectedDay, setSelectedDay] = useState(null);
  // selectedMarker controls which "insight" (urgent below target / highest
  // demand / routine by week / week-on-week) is expanded in the desktop
  // side panel. Mutually exclusive with selectedDay — clicking a day
  // clears it, clicking a marker clears the day. Mobile uses its own
  // mobileTab state (kept separate so the two views don't fight).
  const [selectedMarker, setSelectedMarker] = useState(null);
  // pickDay / pickMarker no longer clear each other — drawer and insight
  // expansion can coexist so the user doesn't lose their place when
  // drilling from a flagged-day list into the detail of one of those days.
  const pickDay = (isoKey) => setSelectedDay(isoKey);
  const closeDay = () => setSelectedDay(null);
  const pickMarker = (id) => setSelectedMarker(id);
  const closeMarker = () => setSelectedMarker(null);
  const toggleDay = (isoKey) => setSelectedDay(prev => prev === isoKey ? null : isoKey);
  const toggleMarker = (id) => setSelectedMarker(prev => prev === id ? null : id);
  // Refs used by the click-outside-to-close handler. The drawer closes
  // when the user clicks anywhere that is NOT the drawer itself AND
  // NOT a day cell (because clicking a different cell should switch
  // to that day without first closing — the cell's own onClick handles
  // the swap).
  const drawerRef = useRef(null);
  const calendarRef = useRef(null);
  const [weather, setWeather] = useState(null);
  const [mobileTab, setMobileTab] = useState('short');
  const hs = data?.huddleSettings || {};
  const sites = data?.roomAllocation?.sites || [];
  const siteCol = (name) => getSiteColour(name, sites);
  const saved = hs?.savedSlotFilters || {};
  const urgOv = saved.urgent || null;
  const routOv = saved.routine || null;
  const rTarget = hs?.routineWeeklyTarget || 0;
  const convRate = hs?.demandCapacity?.conversionRate ?? 0.25;
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const teamClin = useMemo(() => {
    if (!data?.clinicians) return [];
    return (Array.isArray(data.clinicians)?data.clinicians:Object.values(data.clinicians)).filter(c=>c.status!=='left');
  }, [data?.clinicians]);
  // List of slot types seen in the parsed CSV — required by SlotFilter for
  // the picker. Memoised because the underlying data array is stable.
  const knownSlotTypes = useMemo(() => huddleData?.allSlotTypes || [], [huddleData]);
  // Persist a saved slot filter (urgent/routine) — same key/value shape as
  // the Today page uses. Editing here writes to data.huddleSettings.
  // savedSlotFilters[key], so the change applies wherever the dashboard
  // reads that filter (Today urgent breakdown, capacity gauges, etc.) —
  // we deliberately don't fork separate filters for capacity planning.
  const persistFilter = (key, value) => {
    if (!canEdit) return;
    const newSaved = { ...hs.savedSlotFilters, [key]: value };
    saveData({ ...data, huddleSettings: { ...hs, savedSlotFilters: newSaved } }, false);
  };

  useEffect(() => {
    const lat = data?._v4?.practiceLatitude;
    const lon = data?._v4?.practiceLongitude;
    getWeatherForecast(16, lat, lon).then(w=>setWeather(w)).catch(()=>{});
  }, [data?._v4?.practiceLatitude, data?._v4?.practiceLongitude]);

  // ESC key closes the day drawer. Listener is only attached while a
  // day is selected so we don't pollute the global keydown stream when
  // the drawer isn't open.
  useEffect(() => {
    if (!selectedDay) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedDay]);

  // Click outside the drawer closes it. We deliberately ALSO exclude
  // clicks inside the calendar so that clicking a different day cell
  // doesn't trigger close-then-reopen flicker — the cell's own click
  // handler swaps selectedDay to the new key in one render.
  useEffect(() => {
    if (!selectedDay) return;
    const onDown = (e) => {
      const inDrawer = drawerRef.current && drawerRef.current.contains(e.target);
      const inCalendar = calendarRef.current && calendarRef.current.contains(e.target);
      if (!inDrawer && !inCalendar) closeDay();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [selectedDay]);

  // Per-practice prediction context (calibrated baseline + LEA holidays)
  const predictionOptions = useMemo(() => {
    const opts = {};
    if (data?._v4?.demandSettings) opts.demandSettings = data._v4.demandSettings;
    if (data?._v4?.practiceAdminDistrict) {
      const cal = getSchoolHolidaysForLEA(data._v4.practiceAdminDistrict);
      if (cal?.ranges) opts.schoolHolidayRanges = cal.ranges;
    }
    if (typeof data?._v4?.practiceListSize === 'number') {
      opts.listSize = data._v4.practiceListSize;
    }
    return opts;
  }, [data?._v4?.demandSettings, data?._v4?.practiceAdminDistrict, data?._v4?.practiceListSize]);

  const COLS = '60px repeat(5, 1fr) 56px 56px';

  const weeks = useMemo(() => {
    if (!huddleData) return [];
    const today = new Date(); today.setHours(0,0,0,0);
    const dow = today.getDay(); const off = dow===0?-6:1-dow;
    const mon = new Date(today); mon.setDate(today.getDate()+off);
    const res = [];
    for (let w=0;w<6;w++) {
      const ws = new Date(mon); ws.setDate(mon.getDate()+w*7);
      const days = []; let wU=0,wRA=0,wRE=0,wRB=0,wT=0;
      for (let d=0;d<5;d++) {
        const date = new Date(ws); date.setDate(ws.getDate()+d);
        const dateStr = toHuddleDateStr(date);
        const isoKey = toLocalIso(date);
        const dayName = DAY_NAMES[date.getDay()];
        const hasData = huddleData.dates?.includes(dateStr);
        const isToday = isoKey===toLocalIso(today);
        const pred = predictDemand(date, weather?.[isoKey]||null, predictionOptions);
        const isBH = pred?.isBankHoliday||false;
        const predicted = pred?.predicted?Math.round(pred.predicted):null;
        // dow-specific baseline = practice's own baseline + this dow's effect.
        // Read from pred.factors so it tracks per-practice calibration.
        const dowBaseline = (pred?.factors?.baseline || 0) + (pred?.factors?.dayOfWeek?.effect || 0);
        const dc = dowDemandColour(predicted, dowBaseline);
        const uCap = hasData&&!isBH?getHuddleCapacity(huddleData,dateStr,hs,urgOv):null;
        const amS=uCap?(uCap.am.total||0)+(uCap.am.embargoed||0)+(uCap.am.booked||0):0;
        const pmS=uCap?(uCap.pm.total||0)+(uCap.pm.embargoed||0)+(uCap.pm.booked||0):0;
        const amT=hs?.expectedCapacity?.[dayName]?.am||0;
        const pmT=hs?.expectedCapacity?.[dayName]?.pm||0;
        const rTots = hasData&&!isBH?getDateTotals(huddleData,dateStr,hs,routOv):null;
        const rA=rTots?.available||0,rE=rTots?.embargoed||0,rB=rTots?.booked||0;
        const isPast = date < today;
        let amDuty=null,pmDuty=null;
        if(hasDuty&&hasData&&!isBH){amDuty=getDutyDoctor(huddleData,dateStr,'am',dutySlots,teamClin);pmDuty=getDutyDoctor(huddleData,dateStr,'pm',dutySlots,teamClin);}
        if(!isBH){wU+=amS+pmS;wRA+=rA;wRE+=rE;wRB+=rB;wT+=amT+pmT;}
        days.push({date,dateStr,isoKey,dayName,dayShort:DAY_SHORT[date.getDay()],dayNum:date.getDate(),
          monthStr:date.toLocaleString('en-GB',{month:'short'}),hasData,isToday,isBH,isPast,
          amS,pmS,amT,pmT,rA,rE,rB,rTotal:rA+rE+rB,
          predicted,dc,needed:predicted?Math.round(predicted*convRate):0,
          // Full pred object (factors, confidence band, demand level) is
          // surfaced in the day-detail panel so the user can see WHY a
          // particular day is rated the way it is.
          pred,
          uCap,routCap:hasData&&!isBH?getHuddleCapacity(huddleData,dateStr,hs,routOv):null,
          amDuty,pmDuty});
      }
      res.push({days,ws,label:`${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`,wU,wT,wR:wRA+wRE+wRB,wRA,wRE,wRB});
    }
    return res;
  }, [huddleData,hs,urgOv,routOv,weather,convRate,dutySlots,hasDuty,predictionOptions]);

  const shortDays = useMemo(()=>weeks.flatMap(w=>w.days).filter(d=>d.hasData&&!d.isBH&&(d.amT+d.pmT)>0&&(d.amS+d.pmS)<(d.amT+d.pmT)*0.8).sort((a,b)=>a.date-b.date),[weeks]);
  const topDemand = useMemo(()=>weeks.flatMap(w=>w.days).filter(d=>!d.isBH&&d.predicted).sort((a,b)=>b.predicted-a.predicted).slice(0,5),[weeks]);

  const detailDay = selectedDay?weeks.flatMap(w=>w.days).find(d=>d.isoKey===selectedDay):null;
  const detailClin = useMemo(()=>{
    if(!detailDay) return {am:[],pm:[],rout:[]};
    const map=list=>(list||[]).filter(c=>(c.available||0)+(c.embargoed||0)+(c.booked||0)>0).map(c=>{
      const m=teamClin.find(tc=>matchesStaffMember(c.name,tc));
      return {name:m?.name||c.name,initials:m?.initials||'?',loc:c.location,slots:(c.available||0)+(c.embargoed||0),bkd:c.booked||0};
    }).sort((a,b)=>(b.slots+b.bkd)-(a.slots+a.bkd));
    const routMerge=[...(detailDay.routCap?.am?.byClinician||[]),...(detailDay.routCap?.pm?.byClinician||[])].reduce((a,c)=>{
      const e=a.find(x=>x.name===c.name);
      if(e){e.available+=c.available||0;e.embargoed+=c.embargoed||0;e.booked+=c.booked||0;e.location=e.location||c.location;}
      else a.push({...c});return a;
    },[]);
    return {am:map(detailDay.uCap?.am?.byClinician),pm:map(detailDay.uCap?.pm?.byClinician),rout:map(routMerge)};
  },[detailDay,teamClin]);

  const updateTarget=v=>saveData({...data,huddleSettings:{...hs,routineWeeklyTarget:parseInt(v)||0}},false);

  if(!huddleData)return<div className="rounded-xl p-12 text-center" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}><h2 className="text-lg font-semibold text-white mb-2" style={{fontFamily:"'Outfit',sans-serif"}}>Upload appointment report</h2><p className="text-sm text-slate-500">Upload a CSV on the Today page first.</p></div>;

  const DutyPill = ({doc,colour,bgTint,borderCol}) => {
    if(!doc) return null;
    const m = teamClin.find(tc=>matchesStaffMember(doc.name,tc));
    return <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg mb-3" style={{background:`${colour}15`,border:`1px solid ${colour}30`}}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill={colour} stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
      <span className="text-[11px] font-semibold" style={{color:colour}}>{m?.name||doc.name} (duty)</span>
    </div>;
  };

  return (
    <div className="-m-4 lg:-m-6 min-h-screen" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'}}>
      <div className="max-w-[1500px] mx-auto px-3 py-4 sm:p-4 lg:p-6 space-y-4">

      {/* ═══ DESKTOP LAYOUT — calendar (left) + side panel (right) ═══ */}
      {/* Two-column grid. The calendar fills available width on the left;
          the side panel is a fixed-width pop-out on the right. The side
          panel shows either: a selected day's detail (when a date is
          clicked), an expanded "insight marker" (when one of the four
          marker buttons is clicked), or the default state with the four
          marker buttons. selectedDay and selectedMarker are mutually
          exclusive — picking one clears the other. */}
      <div className="hidden lg:block space-y-4">

        {/* ─── LEFT: calendar ─── */}
        <div ref={calendarRef} className="rounded-2xl overflow-hidden" style={{background:'rgba(15,23,42,0.55)',border:'1px solid rgba(255,255,255,0.06)'}}>
          {/* Calendar header: title + slot filter cogs */}
          <div className="px-5 py-4 flex items-center gap-2 border-b border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span className="text-sm font-semibold text-white">Capacity planning</span>
            <span className="text-xs text-slate-500 ml-2">6-week forward view</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">Urgent</span>
                <SlotFilter overrides={urgOv} setOverrides={(v) => persistFilter('urgent', v)} knownSlotTypes={knownSlotTypes} title="Urgent slot types" readOnly={!canEdit} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">Routine</span>
                <SlotFilter overrides={routOv} setOverrides={(v) => persistFilter('routine', v)} knownSlotTypes={knownSlotTypes} title="Routine slot types" readOnly={!canEdit} />
              </div>
            </div>
          </div>

          {/* Column header strip */}
          {/* The day columns get an "Urgent · AM | PM" annotation so it's
              clear at a glance that the per-day numbers are urgent-slot
              counts (the user explicitly asked for this clarification).
              The routine column on the right gets its own label tying back
              to the weekly target. */}
          <div className="grid border-b border-white/10" style={{gridTemplateColumns:'62px repeat(5, 1fr) 190px'}}>
            <div className="p-3"/>
            {['Mon','Tue','Wed','Thu','Fri'].map(d => (
              <div key={d} className="p-3 text-center border-l border-white/5">
                <div className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Urgent · AM | PM</div>
                <div className="text-xs font-semibold text-slate-300 mt-0.5">{d}</div>
              </div>
            ))}
            <div className="p-3 border-l border-purple-900/30" style={{background:'rgba(167,139,250,0.05)'}}>
              <div className="text-[9px] text-purple-300 font-bold uppercase tracking-wider">Routine</div>
              <div className="text-xs font-semibold text-slate-300 mt-0.5">vs weekly target</div>
            </div>
          </div>

          {/* Weeks */}
          {weeks.map((wk,wi)=>(
            <div key={wi} className="grid border-b border-white/5" style={{gridTemplateColumns:'62px repeat(5, 1fr) 190px'}}>
              <div className="p-3 border-r border-white/5 flex flex-col justify-center">
                <div className="text-xs font-bold text-slate-300">Wk {wi+1}</div>
                <div className="text-[10px] text-slate-600">{wk.label}</div>
              </div>
              {wk.days.map((d,di)=>{
                const sel = selectedDay===d.isoKey;
                if(d.isBH) return (
                  <div key={di} className="p-2 border-l border-white/5">
                    <div className="rounded-lg h-full flex items-center justify-center" style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.2)'}}>
                      <span className="text-xs font-semibold text-amber-500">Bank hol</span>
                    </div>
                  </div>
                );
                if(!d.hasData) return (
                  <div key={di} className="p-2 border-l border-white/5">
                    <div className="rounded-lg h-full flex items-center justify-center" style={{background:'rgba(255,255,255,0.03)'}}>
                      <span className="text-[10px] text-slate-600">No data</span>
                    </div>
                  </div>
                );
                const amV = vBand(d.amS,d.amT);
                const pmV = vBand(d.pmS,d.pmT);
                // Tooltip strings — native browser tooltips (cheap; no popper needed).
                // AM/PM tip: duty doctor + supplied/target. Demand tip: top
                // 2 driver factors. teamClin lookup gives the friendly
                // name when EMIS spells it differently (e.g. "COX, Darren (Dr)"
                // → "Dr Darren Cox").
                const dutyLabel = (duty) => {
                  if (!duty) return null;
                  const m = teamClin.find(tc=>matchesStaffMember(duty.name,tc));
                  return m?.name || duty.name;
                };
                const amDutyName = dutyLabel(d.amDuty);
                const pmDutyName = dutyLabel(d.pmDuty);
                const amTip = `AM urgent · ${d.amS}${d.amT>0?' / '+d.amT:''}${amDutyName?'\nDuty: '+amDutyName:''}`;
                const pmTip = `PM urgent · ${d.pmS}${d.pmT>0?' / '+d.pmT:''}${pmDutyName?'\nDuty: '+pmDutyName:''}`;
                const demandTip = d.pred?.factors ? (() => {
                  const f = d.pred.factors;
                  const drivers = [];
                  if (f.dayOfWeek?.effect) drivers.push(`${f.dayOfWeek.day||'Day of week'} ${f.dayOfWeek.effect>0?'+':''}${Math.round(f.dayOfWeek.effect)}`);
                  if (f.schoolHoliday) drivers.push(`School holiday ${f.schoolHoliday>0?'+':''}${Math.round(f.schoolHoliday)}`);
                  if (f.firstWeekBack) drivers.push(`First week back ${f.firstWeekBack>0?'+':''}${Math.round(f.firstWeekBack)}`);
                  if (f.firstDayBack) drivers.push(`First day back ${f.firstDayBack>0?'+':''}${Math.round(f.firstDayBack)}`);
                  if (f.nearBankHoliday?.effect) drivers.push(`Near BH ${f.nearBankHoliday.effect>0?'+':''}${Math.round(f.nearBankHoliday.effect)}`);
                  if (f.weather?.effect) drivers.push(`${f.weather.label||'Weather'} ${f.weather.effect>0?'+':''}${Math.round(f.weather.effect)}`);
                  if (f.month?.effect) drivers.push(`Time of year ${f.month.effect>0?'+':''}${Math.round(f.month.effect)}`);
                  drivers.sort((a,b)=>{
                    const na = parseInt(a.match(/-?\d+$/)?.[0]||'0');
                    const nb = parseInt(b.match(/-?\d+$/)?.[0]||'0');
                    return Math.abs(nb)-Math.abs(na);
                  });
                  return `Predicted ${d.predicted} (${d.dc.label})\n${drivers.slice(0,3).join(' · ')}`;
                })() : `Predicted ${d.predicted}`;
                return (
                  <div key={di} className="p-2 border-l border-white/5">
                    <button onClick={()=>toggleDay(d.isoKey)}
                      className="rounded-lg h-full w-full cursor-pointer transition-all duration-150 text-left block"
                      style={{
                        padding:'8px',
                        borderLeft: d.isToday?'3px solid #10b981':'3px solid transparent',
                        outline: sel?'2px solid #6366f1':'none',
                        outlineOffset: -1,
                        background: sel?'rgba(99,102,241,0.18)':(d.isPast?'rgba(255,255,255,0.02)':'rgba(255,255,255,0.03)'),
                        opacity: d.isPast?0.5:1,
                        filter: d.isPast?'saturate(0.4)':'none',
                        border: 'none'
                      }}>
                      <div className="flex items-center justify-between mb-2">
                        {d.isToday
                          ? <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider" style={{background:'#10b981',color:'white',letterSpacing:'0.05em'}}>Today · {d.dayNum}</span>
                          : <span className="text-xs font-bold text-slate-300">{d.dayNum}</span>}
                        {d.predicted && <span title={demandTip} className="text-[9px] font-bold px-1.5 py-0.5 rounded cursor-help" style={{background:d.dc.bg,color:d.dc.text}}>{d.predicted}</span>}
                      </div>
                      <div className="flex gap-1">
                        <div title={amTip} className="flex-1 text-center rounded-md py-1.5" style={{background:amV.bg}}>
                          <div className="text-base font-bold leading-none" style={{color:amV.text}}>{d.amS}</div>
                          <div className="text-[8px] font-bold mt-0.5" style={{color:amV.text,opacity:0.8}}>AM</div>
                        </div>
                        <div title={pmTip} className="flex-1 text-center rounded-md py-1.5" style={{background:pmV.bg}}>
                          <div className="text-base font-bold leading-none" style={{color:pmV.text}}>{d.pmS}</div>
                          <div className="text-[8px] font-bold mt-0.5" style={{color:pmV.text,opacity:0.8}}>PM</div>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
              {/* Routine column — weekly bullet chart */}
              <div className="border-l border-purple-900/30" style={{background:'rgba(167,139,250,0.03)'}}>
                <WeeklyRoutineBullet wk={wk} rTarget={rTarget} />
              </div>
            </div>
          ))}

          {/* Footer: key + target edit */}
          <div className="px-5 py-3 flex items-center gap-5 flex-wrap text-[10px] text-slate-500">
            <span className="font-semibold text-slate-400">Key:</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#3b82f6'}}/>Over</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/>On target</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/>Tight</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#ef4444'}}/>Short</span>
            <span className="text-slate-700">|</span>
            <span className="text-slate-400">Demand pill colour = vs typical for this weekday</span>
            <span className="text-slate-700">|</span>
            {rTarget>0
              ? <span className="text-slate-400">Routine target: <strong className="text-slate-300">{rTarget}</strong>/wk {canEdit && <button onClick={()=>{const v=prompt('Weekly routine target:',rTarget);if(v)updateTarget(v);}} className="text-indigo-400 underline cursor-pointer ml-1" style={{background:'none',border:'none',fontSize:'inherit'}}>edit</button>}</span>
              : canEdit ? <button onClick={()=>{const v=prompt('Set weekly routine slot target:','200');if(v)updateTarget(v);}} className="text-indigo-400 underline cursor-pointer" style={{background:'none',border:'none',fontSize:'inherit'}}>Set routine target</button> : <span className="text-slate-500 text-xs">Routine target not set</span>}
          </div>
        </div>


        {/* ─── Insights bar (below calendar) ─── */}
        {/* Four tab-style buttons that each open one insight in the
            expansion area below. Click again to collapse. Mutually
            exclusive with the day detail drawer — picking a marker
            clears any selected day. Days inside an expanded list are
            clickable and switch to the day drawer. */}
        <div className="rounded-2xl overflow-hidden" style={{background:'rgba(15,23,42,0.55)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="grid grid-cols-4 gap-2 p-3" style={{borderBottom: selectedMarker ? '1px solid rgba(255,255,255,0.06)' : 'none'}}>
            {/* Urgent below target */}
            {(() => {
              const isActive = selectedMarker === 'short';
              return (
                <button onClick={() => toggleMarker('short')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(239,68,68,0.15)' : 'rgba(239,68,68,0.04)', border: `1px solid ${isActive ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.12)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(239,68,68,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? '#fca5a5' : '#e2e8f0'}}>Urgent below target</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{shortDays.length} day{shortDays.length===1?'':'s'} flagged</div>
                  </div>
                  <span className="text-base font-bold text-red-400">{shortDays.length}</span>
                </button>
              );
            })()}
            {/* Highest demand */}
            {(() => {
              const isActive = selectedMarker === 'demand';
              return (
                <button onClick={() => toggleMarker('demand')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.04)', border: `1px solid ${isActive ? 'rgba(245,158,11,0.45)' : 'rgba(245,158,11,0.12)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(245,158,11,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? '#fcd34d' : '#e2e8f0'}}>Highest demand days</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Top {Math.min(topDemand.length,5)} predicted-busiest</div>
                  </div>
                  <span className="text-base font-bold text-amber-400">{topDemand.length}</span>
                </button>
              );
            })()}
            {/* Routine by week */}
            {(() => {
              const isActive = selectedMarker === 'routine';
              const disabled = rTarget <= 0;
              return (
                <button onClick={() => !disabled && (toggleMarker('routine'))}
                  disabled={disabled}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{
                    background: disabled ? 'rgba(255,255,255,0.02)' : (isActive ? 'rgba(167,139,250,0.15)' : 'rgba(167,139,250,0.04)'),
                    border: `1px solid ${disabled ? 'rgba(255,255,255,0.04)' : (isActive ? 'rgba(167,139,250,0.45)' : 'rgba(167,139,250,0.12)')}`,
                    opacity: disabled ? 0.5 : 1,
                    cursor: disabled ? 'not-allowed' : 'pointer'
                  }}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(167,139,250,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? '#c4b5fd' : '#e2e8f0'}}>Routine by week</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{disabled ? 'No target set' : `vs ${rTarget}/wk target`}</div>
                  </div>
                  <span className="text-base font-bold text-purple-300">{disabled ? '—' : weeks.filter(w=>w.wR>0).length}</span>
                </button>
              );
            })()}
            {/* Week-on-week */}
            {(() => {
              const isActive = selectedMarker === 'trend';
              return (
                <button onClick={() => toggleMarker('trend')}
                  className="px-3 py-3 rounded-lg flex items-center gap-3 transition-colors text-left"
                  style={{background: isActive ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.04)', border: `1px solid ${isActive ? 'rgba(148,163,184,0.45)' : 'rgba(148,163,184,0.12)'}`}}>
                  <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0" style={{background:'rgba(148,163,184,0.18)'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{color: isActive ? '#cbd5e1' : '#e2e8f0'}}>Week-on-week</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Urgent + routine deltas</div>
                  </div>
                  <span className="text-base font-bold text-slate-300">{weeks.filter(w=>w.wU>0).length}</span>
                </button>
              );
            })()}
          </div>

          {/* Expansion area — only renders when a marker is selected */}
          {selectedMarker && (
            <div className="p-4 space-y-2">
              {selectedMarker==='short' && (
                shortDays.length===0
                  ? <p className="text-sm text-slate-400 text-center py-6">All days are meeting their urgent capacity target.</p>
                  : <div className="grid grid-cols-2 gap-2">{shortDays.map((d,i)=>{const u=d.amS+d.pmS,t=d.amT+d.pmT;return(
                      <button key={i} onClick={()=>pickDay(d.isoKey)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.04)'}}>
                        <span className="text-xs font-semibold text-slate-300 w-20 flex-shrink-0">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
                          <div className="h-full rounded-full" style={{width:`${Math.min((u/t)*100,100)}%`,background:u<t*0.8?'#ef4444':'#f59e0b'}}/>
                        </div>
                        <span className="text-xs font-bold text-red-400 flex-shrink-0">{u}</span>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">/ {t}</span>
                      </button>
                    );})}</div>
              )}
              {selectedMarker==='demand' && (
                topDemand.length===0
                  ? <p className="text-sm text-slate-400 text-center py-6">No demand prediction data yet.</p>
                  : <div className="grid grid-cols-2 gap-2">{topDemand.map((d,i)=>{
                      const u = d.amS+d.pmS;
                      const cov = d.needed>0?Math.round((u/d.needed)*100):100;
                      const col = cov>=90?'#10b981':cov>=80?'#f59e0b':'#ef4444';
                      const verdict = cov>=90?'OK':cov>=80?'Tight':'Short';
                      return (
                        <button key={i} onClick={()=>pickDay(d.isoKey)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.04)'}}>
                          <span className="text-xs font-semibold text-slate-300 w-20 flex-shrink-0">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0" style={{background:d.dc.bg,color:d.dc.text}}>{d.predicted}</span>
                          <span className="text-[10px] text-slate-500 flex-1">need {d.needed}</span>
                          <div className="text-right flex-shrink-0">
                            <div className="text-xs font-bold" style={{color:col}}>{verdict}</div>
                            <div className="text-[10px] text-slate-400">{u} / {d.needed}</div>
                          </div>
                        </button>
                      );
                    })}</div>
              )}
              {selectedMarker==='routine' && (
                rTarget<=0
                  ? <p className="text-sm text-slate-400 text-center py-6">Set a weekly routine target in the calendar footer to enable this.</p>
                  : weeks.filter(w=>w.wR>0).length===0
                    ? <p className="text-sm text-slate-400 text-center py-6">No routine slot data uploaded yet.</p>
                    : <div className="grid grid-cols-2 gap-2">{weeks.filter(w=>w.wR>0).map((w,i)=>{const vb=vBand(w.wR,rTarget);return(
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.04)'}}>
                          <span className="text-xs font-semibold text-slate-300 w-12 flex-shrink-0">Wk {weeks.indexOf(w)+1}</span>
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
                            <div className="h-full rounded-full" style={{width:`${Math.min((w.wR/rTarget)*100,100)}%`,background:vb.bg}}/>
                          </div>
                          <span className="text-xs font-bold flex-shrink-0" style={{color:vb.bg}}>{w.wR}</span>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">/ {rTarget}</span>
                        </div>
                      );})}</div>
              )}
              {selectedMarker==='trend' && (
                weeks.filter(w=>w.wU>0).length===0
                  ? <p className="text-sm text-slate-400 text-center py-6">No urgent data uploaded yet.</p>
                  : <div className="grid grid-cols-2 gap-2">{weeks.filter(w=>w.wU>0).map((w,i,arr)=>{const delta=i>0?w.wU-arr[i-1].wU:0;return(
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.04)'}}>
                        <span className="text-xs font-semibold text-slate-300 w-12 flex-shrink-0">Wk {weeks.indexOf(w)+1}</span>
                        <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-slate-200">{w.wU}</span><span className="text-[10px] text-slate-400">urg</span></div>
                        <div className="flex items-center gap-1.5"><span className="text-sm font-bold" style={{color:'#a78bfa'}}>{w.wR}</span><span className="text-[10px] text-slate-400">rout</span></div>
                        {delta!==0 && <span className={`text-xs font-bold ml-auto ${delta>0?'text-emerald-500':'text-red-500'}`}>{delta>0?'↑':'↓'}{Math.abs(delta)} urg</span>}
                      </div>
                    );})}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══ DAY DETAIL DRAWER (desktop) ═══ */}
      {/* Fixed-position drawer that slides in from the right when a day
          is selected. Doesn't push the calendar — overlays the rightmost
          ~440px of the screen. Calendar behind it stays at full width and
          is partially obscured. Click the ✕ (or click any other day) to
          close. Only shown on lg+ — mobile uses inline expansion as
          before. */}
      {detailDay && (
        <div ref={drawerRef} className="hidden lg:flex fixed top-0 right-0 bottom-0 z-40 flex-col animate-in slide-in-from-right" style={{width:'440px',background:'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',borderLeft:'1px solid rgba(255,255,255,0.1)',boxShadow:'-12px 0 32px rgba(0,0,0,0.5)'}}>
          <div className="px-4 py-3 flex items-center gap-2 border-b border-white/10 flex-shrink-0">
            <span className="text-sm font-semibold text-white">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr}</span>
            <button onClick={closeDay} className="ml-auto text-slate-400 hover:text-white" style={{background:'none',border:'none',cursor:'pointer',padding:'4px 8px'}} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <PredictionBand day={detailDay} convRate={convRate} />
          <div className="overflow-y-auto p-4 space-y-3" style={{flex:1}}>
            {/* AM urgent section */}
            <div className="rounded-lg p-3" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.04)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">AM urgent</span>
                <span className="text-base font-bold text-red-400 ml-auto">{detailDay.amS}</span>
                {detailDay.amT>0 && <span className="text-[10px] text-slate-400">/ {detailDay.amT}</span>}
              </div>
              {detailDay.amDuty && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded mb-2" style={{background:'rgba(239,68,68,0.12)',border:'1px solid rgba(239,68,68,0.25)'}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fca5a5" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                  <span className="text-[11px] font-semibold text-red-300">{(teamClin.find(tc=>matchesStaffMember(detailDay.amDuty.name,tc))?.name)||detailDay.amDuty.name} (duty)</span>
                </div>
              )}
              <div className="space-y-1">
                {detailClin.am.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return(
                  <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{background:'rgba(255,255,255,0.03)'}}>
                    {lc && <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{background:lc}}/>}
                    <span className="text-[11px] text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold text-slate-300">{c.slots+c.bkd}</span>
                  </div>
                );})}
                {detailClin.am.length===0 && <div className="text-[11px] text-slate-500 py-2 text-center">No slots</div>}
              </div>
            </div>
            {/* PM urgent section */}
            <div className="rounded-lg p-3" style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.04)'}}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">PM urgent</span>
                <span className="text-base font-bold text-blue-400 ml-auto">{detailDay.pmS}</span>
                {detailDay.pmT>0 && <span className="text-[10px] text-slate-400">/ {detailDay.pmT}</span>}
              </div>
              {detailDay.pmDuty && (
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded mb-2" style={{background:'rgba(59,130,246,0.12)',border:'1px solid rgba(59,130,246,0.25)'}}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#93c5fd" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                  <span className="text-[11px] font-semibold text-blue-300">{(teamClin.find(tc=>matchesStaffMember(detailDay.pmDuty.name,tc))?.name)||detailDay.pmDuty.name} (duty)</span>
                </div>
              )}
              <div className="space-y-1">
                {detailClin.pm.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return(
                  <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{background:'rgba(255,255,255,0.03)'}}>
                    {lc && <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{background:lc}}/>}
                    <span className="text-[11px] text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold text-slate-300">{c.slots+c.bkd}</span>
                  </div>
                );})}
                {detailClin.pm.length===0 && <div className="text-[11px] text-slate-500 py-2 text-center">No slots</div>}
              </div>
            </div>
            {/* Routine section */}
            <div className="rounded-lg p-3" style={{background:'rgba(167,139,250,0.05)',border:'1px solid rgba(167,139,250,0.15)'}}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Routine</span>
                <span className="text-base font-bold text-purple-300 ml-auto">{detailDay.rTotal}</span>
              </div>
              <div className="mb-3"><DonutGauge avail={detailDay.rA} emb={detailDay.rE} booked={detailDay.rB}/></div>
              <div className="space-y-1">
                {detailClin.rout.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return(
                  <div key={j} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{background:'rgba(255,255,255,0.03)'}}>
                    {lc && <div className="w-1 h-3.5 rounded-sm flex-shrink-0" style={{background:lc}}/>}
                    <span className="text-[11px] text-slate-300 flex-1 truncate">{c.name}</span>
                    <span className="text-[11px] font-bold text-slate-300">{c.slots+c.bkd}</span>
                  </div>
                );})}
                {detailClin.rout.length===0 && <div className="text-[11px] text-slate-500 py-2 text-center">No slots</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MOBILE LAYOUT ═══ */}
      <div className="lg:hidden space-y-4">
        {/* 6-week strip — horizontally scrollable */}
        <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{background:"rgba(15,23,42,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <div>
              <div className="font-heading text-sm font-medium text-slate-200">Capacity planning</div>
              <div className="text-[11px] text-slate-600">Tap any day · 6-week forward view</div>
            </div>
          </div>

          {weeks.map((wk, wi) => {
            const wkLabel = wi === 0 ? 'This week' : wi === 1 ? 'Next week' : `In ${wi} weeks`;
            const ws = wk.ws;
            const wcStr = `wc ${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`;
            return (
              <div key={wi} style={{borderTop: wi > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none'}}>
                <div className="flex items-baseline justify-between px-4 py-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{wkLabel}</div>
                  <div className="text-[9px] text-slate-700">{wcStr}</div>
                </div>
                <div className="grid grid-cols-5 gap-1 px-3 pb-3">
                  {wk.days.map((d, di) => {
                    const sel = selectedDay === d.isoKey;
                    const u = d.amS + d.pmS;
                    const t = d.amT + d.pmT;
                    const fillPct = t > 0 ? Math.min(100, (u/t)*100) : 0;
                    const fillCol = u >= t ? '#10b981' : u >= t * 0.8 ? '#f59e0b' : '#ef4444';
                    const predCol = d.predicted ? d.dc.text : '#475569';
                    return (
                      <button key={di}
                        onClick={() => d.hasData && !d.isBH && setSelectedDay(sel ? null : d.isoKey)}
                        disabled={!d.hasData || d.isBH}
                        className="rounded-md p-1.5 flex flex-col items-center gap-1 transition-all"
                        style={{
                          background: sel ? 'rgba(99,102,241,0.18)' : (d.isPast ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)'),
                          border: sel ? '1px solid rgba(99,102,241,0.5)' : (d.isToday ? '1px solid rgba(16,185,129,0.4)' : '1px solid transparent'),
                          opacity: d.isPast ? 0.5 : 1,
                          cursor: (d.hasData && !d.isBH) ? 'pointer' : 'default'
                        }}>
                        <div className="text-[10px] font-bold text-slate-400">{d.dayShort}</div>
                        <div className="text-[10px] text-slate-600 leading-none -mt-1">{d.dayNum}</div>
                        {d.isBH ? (
                          <div className="text-[8px] font-bold text-amber-400 mt-1">BH</div>
                        ) : !d.hasData ? (
                          <div className="text-[8px] text-slate-700 mt-1">—</div>
                        ) : (<>
                          <div className="font-mono-data text-base font-bold leading-none" style={{color: fillCol}}>{u}</div>
                          <div className="w-full h-1 rounded-sm overflow-hidden" style={{background: 'rgba(255,255,255,0.06)'}}>
                            <div className="h-full" style={{width: `${fillPct}%`, background: fillCol}}/>
                          </div>
                          <div className="font-mono-data text-[10px] font-bold leading-none" style={{color: predCol}}>{d.predicted || '—'}</div>
                        </>)}
                      </button>
                    );
                  })}
                </div>
                {/* Inline expansion: if selectedDay is in this week */}
                {wk.days.some(d => d.isoKey === selectedDay) && detailDay && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="rounded-lg overflow-hidden" style={{background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)'}}>
                      <div className="px-3 py-2 flex items-center justify-between" style={{borderBottom: '1px solid rgba(99,102,241,0.15)'}}>
                        <div className="text-xs font-semibold text-slate-200">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr}</div>
                        <button onClick={() => setSelectedDay(null)} className="text-slate-500 hover:text-white text-xs" style={{background:'none',border:'none',cursor:'pointer'}}>✕</button>
                      </div>
                      {/* Full prediction band — driver factors, confidence
                          range, and demand level all visible at the top of
                          the mobile card too. */}
                      <PredictionBand day={detailDay} convRate={convRate} />
                      <div className="p-3 space-y-2">
                        {/* AM urgent */}
                        {(() => {
                          const amCol = detailDay.amT > 0 ? (detailDay.amS >= detailDay.amT ? '#34d399' : detailDay.amS >= detailDay.amT * 0.8 ? '#fbbf24' : '#f87171') : '#94a3b8';
                          return (
                            <div className="rounded-md p-2.5" style={{background: 'rgba(255,255,255,0.04)'}}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{color: amCol}}>AM urgent</span>
                                <div className="flex items-baseline gap-1">
                                  <span className="font-mono-data text-base font-bold" style={{color: amCol}}>{detailDay.amS}</span>
                                  {detailDay.amT > 0 && <span className="text-[10px] text-slate-500">/ {detailDay.amT}</span>}
                                </div>
                              </div>
                              {detailDay.amDuty && <div className="text-[10px] text-slate-400">Duty: <span className="font-semibold text-slate-300">{detailDay.amDuty.name?.split(',')[0]}</span></div>}
                            </div>
                          );
                        })()}
                        {/* PM urgent */}
                        {(() => {
                          const pmCol = detailDay.pmT > 0 ? (detailDay.pmS >= detailDay.pmT ? '#34d399' : detailDay.pmS >= detailDay.pmT * 0.8 ? '#fbbf24' : '#f87171') : '#94a3b8';
                          return (
                            <div className="rounded-md p-2.5" style={{background: 'rgba(255,255,255,0.04)'}}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{color: pmCol}}>PM urgent</span>
                                <div className="flex items-baseline gap-1">
                                  <span className="font-mono-data text-base font-bold" style={{color: pmCol}}>{detailDay.pmS}</span>
                                  {detailDay.pmT > 0 && <span className="text-[10px] text-slate-500">/ {detailDay.pmT}</span>}
                                </div>
                              </div>
                              {detailDay.pmDuty && <div className="text-[10px] text-slate-400">Duty: <span className="font-semibold text-slate-300">{detailDay.pmDuty.name?.split(',')[0]}</span></div>}
                            </div>
                          );
                        })()}
                        {/* Routine total */}
                        <div className="rounded-md p-2.5" style={{background: 'rgba(255,255,255,0.04)'}}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Routine</span>
                            <span className="font-mono-data text-base font-bold text-emerald-400">{detailDay.rTotal}</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-slate-400">Avail <span className="text-emerald-400 font-bold">{detailDay.rA}</span></span>
                            <span className="text-slate-400">Emb <span className="text-amber-400 font-bold">{detailDay.rE}</span></span>
                            <span className="text-slate-400">Booked <span className="text-slate-300 font-bold">{detailDay.rB}</span></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Strip key */}
          <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{borderTop: '1px solid rgba(255,255,255,0.04)'}}>
            <span className="text-[9px] text-slate-600">Top: urgent slots</span>
            <span className="text-[9px] text-slate-600">·</span>
            <span className="text-[9px] text-slate-600">Bottom: predicted demand</span>
          </div>
        </div>

        {/* Tabbed sections */}
        <div className="grid grid-cols-2 gap-1.5">
          {[
            {id: 'short', label: 'Short', count: shortDays.length, icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01', col: '#f87171'},
            {id: 'demand', label: 'High demand', count: topDemand.length, icon: 'M22 12h-4l-3 9L9 3l-3 9H2', col: '#fbbf24'},
            ...(rTarget > 0 ? [{id: 'routine', label: 'Routine', count: weeks.filter(w => w.wR > 0).length, icon: 'M3 3h18v18H3zM3 9h18M9 21V9', col: '#a78bfa'}] : []),
            {id: 'trend', label: 'Trend', count: weeks.filter(w => w.wU > 0).length, icon: 'M18 20V10M12 20V4M6 20v-6', col: '#94a3b8'},
          ].map(t => {
            const active = mobileTab === t.id;
            return (
              <button key={t.id} onClick={() => setMobileTab(t.id)}
                className="rounded-lg px-3 py-2 flex items-center gap-2 transition-all"
                style={{
                  background: active ? `${t.col}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${active ? `${t.col}55` : 'rgba(255,255,255,0.06)'}`,
                }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? t.col : '#64748b'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
                <span className="text-xs font-semibold" style={{color: active ? t.col : '#94a3b8'}}>{t.label}</span>
                <span className="text-[10px] ml-auto" style={{color: active ? t.col : '#475569'}}>{t.count}</span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {mobileTab === 'short' && (
          <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(239,68,68,0.15)",borderBottom:"1px solid rgba(239,68,68,0.1)"}}>
              <span className="text-xs font-semibold text-white">Urgent capacity below target</span>
            </div>
            <div className="p-3 space-y-1.5">
              {shortDays.length === 0 && <p className="text-sm text-slate-400 text-center py-3">All days meeting target</p>}
              {shortDays.slice(0, 10).map((d, i) => {
                const u = d.amS + d.pmS, t = d.amT + d.pmT;
                return (
                  <button key={i} onClick={() => setSelectedDay(d.isoKey)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left" style={{background: 'rgba(255,255,255,0.04)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-16">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.08)'}}>
                      <div className="h-full rounded-full" style={{width: `${Math.min((u/t)*100, 100)}%`, background: u < t * 0.8 ? '#ef4444' : '#f59e0b'}}/>
                    </div>
                    <span className="text-xs font-bold text-red-400">{u}</span>
                    <span className="text-[10px] text-slate-400">/ {t}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mobileTab === 'demand' && (
          <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(245,158,11,0.15)",borderBottom:"1px solid rgba(245,158,11,0.1)"}}>
              <span className="text-xs font-semibold text-white">Highest demand days</span>
            </div>
            <div className="p-3 space-y-1.5">
              {topDemand.length === 0 && <p className="text-sm text-slate-400 text-center py-3">No demand data</p>}
              {topDemand.map((d, i) => {
                const u = d.amS + d.pmS;
                return (
                  <button key={i} onClick={() => setSelectedDay(d.isoKey)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left" style={{background: 'rgba(255,255,255,0.04)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-16">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{background: d.dc.bg, color: d.dc.text}}>{d.predicted}</span>
                    <span className="text-[10px] text-slate-500 ml-auto">urg {u}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {mobileTab === 'routine' && rTarget > 0 && (
          <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(124,58,237,0.15)",borderBottom:"1px solid rgba(124,58,237,0.1)"}}>
              <span className="text-xs font-semibold text-white">Weekly routine capacity</span>
            </div>
            <div className="p-3 space-y-1.5">
              {weeks.filter(w => w.wR > 0).map((w, i) => {
                const vb = vBand(w.wR, rTarget);
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background: 'rgba(255,255,255,0.04)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-12">Wk {weeks.indexOf(w)+1}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background: 'rgba(255,255,255,0.08)'}}>
                      <div className="h-full rounded-full" style={{width: `${Math.min((w.wR/rTarget)*100, 100)}%`, background: vb.bg}}/>
                    </div>
                    <span className="text-xs font-bold" style={{color: vb.bg}}>{w.wR}</span>
                    <span className="text-[10px] text-slate-400">/ {rTarget}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {mobileTab === 'trend' && (
          <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div className="px-4 py-2.5" style={{background:"rgba(15,23,42,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <span className="text-xs font-semibold text-white">Week-on-week</span>
            </div>
            <div className="p-3 space-y-1.5">
              {weeks.filter(w => w.wU > 0).map((w, i, arr) => {
                const delta = i > 0 ? w.wU - arr[i-1].wU : 0;
                return (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background: 'rgba(255,255,255,0.04)'}}>
                    <span className="text-xs font-semibold text-slate-300 w-12">Wk {weeks.indexOf(w)+1}</span>
                    <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-slate-200">{w.wU}</span><span className="text-[9px] text-slate-500">urg</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-emerald-400">{w.wR}</span><span className="text-[9px] text-slate-500">rout</span></div>
                    {delta !== 0 && <span className={`text-xs font-bold ml-auto ${delta > 0 ? 'text-emerald-500' : 'text-red-500'}`}>{delta > 0 ? '↑' : '↓'}{Math.abs(delta)} urg</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Clinician capacity detail */}
      <ClinicianCapacity data={data} huddleData={huddleData} routineOverrides={routOv} />
      </div>
    </div>
  );
}
