'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS, MONTH_EFFECTS } from '@/lib/demandPredictor';
import { getHuddleCapacity, parseHuddleDateStr, getDutyDoctor, getBand } from '@/lib/huddle';
import { matchesStaffMember, toLocalIso } from '@/lib/data';

const DEMAND_COLOURS = {
  low: { bg: '#10b98122', text: '#34d399', label: 'Low' },
  normal: { bg: '#3b82f622', text: '#60a5fa', label: 'Normal' },
  high: { bg: '#f59e0b22', text: '#fbbf24', label: 'High' },
  'very-high': { bg: '#ef444422', text: '#f87171', label: 'Very high' },
  closed: { bg: '#64748b22', text: '#94a3b8', label: 'Closed' },
};
const FACTOR_TIPS = {
  dayOfWeek: f => `${f.day}s typically see ${f.effect>0?'higher':'lower'} demand`,
  month: f => `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][f.month-1]} is historically ${f.effect>0?'higher':'lower'} demand`,
  trend: () => 'Long-term growth trend in patient requests',
  weather: f => `${Math.round(f.actualTemp)}°C — ${f.tempEffect<0?'mild weather reduces':'extreme weather increases'} demand`,
  heavyRain: f => `${Math.round(f.precipMm)}mm rain expected`,
  schoolHoliday: () => 'School holidays reduce demand from families',
  firstWeekBack: () => 'First week back after school holidays',
  firstDayBack: () => 'First working day after a bank holiday — surge expected',
  secondDayBack: () => 'Second day after a break — catch-up demand',
  nearBankHoliday: f => `${f.daysAway} day${f.daysAway>1?'s':''} from a bank holiday`,
  christmasPeriod: () => 'Christmas period — reduced demand',
  endOfMonth: () => 'End of month slightly increases demand',
  shortWeek: f => `${f.workingDays}-day week concentrates demand`,
  mediaScare: () => 'Media health scare — temporary spike',
};
const DEFAULTS = { conversionRate: 0.25, greenPct: 100, amberPct: 80 };

export default function DemandCapacityConnector({ viewingDate, huddleData, capacity, hs, data, saveData, urgentOverrides }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [prevData, setPrevData] = useState(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const dc = hs?.demandCapacity || {};
  const convRate = dc.conversionRate ?? DEFAULTS.conversionRate;
  const greenPct = dc.greenPct ?? DEFAULTS.greenPct;
  const amberPct = dc.amberPct ?? DEFAULTS.amberPct;
  const updateSetting = (key, val) => saveData({ ...data, huddleSettings: { ...hs, demandCapacity: { ...dc, [key]: val } } }, false);

  const targetDate = useMemo(() => { const d = new Date(viewingDate || new Date()); d.setHours(0,0,0,0); return d; }, [viewingDate]);
  const teamClinicians = useMemo(() => { if (!data?.clinicians) return []; return Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians); }, [data?.clinicians]);
  const typicalDemand = useMemo(() => { const dow=(targetDate.getDay()+6)%7; if(dow>=5) return null; return Math.round(BASELINE+DOW_EFFECTS[dow]+MONTH_EFFECTS[targetDate.getMonth()]); }, [targetDate]);
  const typicalCapacity = useMemo(() => {
    if (!huddleData?.dates || !urgentOverrides) return null;
    const dow = targetDate.getDay(); let tot=0, cnt=0;
    const vds = `${String(targetDate.getDate()).padStart(2,'0')}-${targetDate.toLocaleString('en-GB',{month:'short'})}-${targetDate.getFullYear()}`;
    huddleData.dates.forEach(ds => { if(ds===vds) return; const d=parseHuddleDateStr(ds); if(d.getDay()!==dow) return; const c=getHuddleCapacity(huddleData,ds,hs,urgentOverrides); const t=(c.am.total||0)+(c.pm.total||0)+(c.am.embargoed||0)+(c.pm.embargoed||0)+(c.am.booked||0)+(c.pm.booked||0); if(t>0){tot+=t;cnt++;} });
    return cnt>0 ? Math.round(tot/cnt) : null;
  }, [huddleData, targetDate, hs, urgentOverrides]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const weather = await getWeatherForecast(16);
        const days = [];
        for (let i=14;i>=1;i--) { const d=new Date(targetDate);d.setDate(d.getDate()-i);const dk=toLocalIso(d);const p=predictDemand(d,weather?.[dk]||null);days.push({date:d,dateKey:dk,dayOfWeek:d.getDay(),dayName:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],dayNum:d.getDate(),isPast:true,isToday:false,isWeekend:d.getDay()===0||d.getDay()===6,...p}); }
        const tdk=toLocalIso(targetDate);const tw=weather?.[tdk]||null;const tp=predictDemand(targetDate,tw);
        days.push({date:targetDate,dateKey:tdk,dayOfWeek:targetDate.getDay(),dayName:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][targetDate.getDay()],dayNum:targetDate.getDate(),isPast:false,isToday:true,isWeekend:targetDate.getDay()===0||targetDate.getDay()===6,weather:tw,...tp});
        for (let i=1;i<=14;i++) { const d=new Date(targetDate);d.setDate(d.getDate()+i);const dk=toLocalIso(d);const p=predictDemand(d,weather?.[dk]||null);days.push({date:d,dateKey:dk,dayOfWeek:d.getDay(),dayName:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()],dayNum:d.getDate(),isPast:false,isToday:false,isWeekend:d.getDay()===0||d.getDay()===6,...p}); }
        if (!cancelled) { const r={days,today:days.find(d=>d.isToday),todayWeather:tw}; setForecast(r); setPrevData(r); }
      } catch(e) { console.error('Forecast error:',e); }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [targetDate]);

  // Chart
  useEffect(() => {
    if (!showChart || !forecast || !chartRef.current) return;
    const loadChart = async () => {
      if (!window.Chart) await new Promise(r => { const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';s.onload=r;document.head.appendChild(s); });
      if (chartInstance.current) chartInstance.current.destroy();
      const days=forecast.days, todayIdx=days.findIndex(d=>d.isToday);
      const isClosed=days.map(d=>d.isWeekend||d.isBankHoliday), isBH=days.map(d=>d.isBankHoliday);
      const labels=days.map(d=>{if(d.isBankHoliday)return'BH';if(d.isWeekend)return d.dayName;return`${d.dayName} ${d.dayNum}`;});
      const values=days.map((d,i)=>isClosed[i]?null:d.predicted), lows=days.map((d,i)=>isClosed[i]?null:d.confidence.low), highs=days.map((d,i)=>isClosed[i]?null:d.confidence.high);
      const shade={id:'cs',beforeDraw(c){const x=c.ctx,xs=c.scales.x,ys=c.scales.y,bw=(xs.getPixelForValue(1)-xs.getPixelForValue(0))*0.5;x.save();for(let i=0;i<isClosed.length;i++){if(isClosed[i]){const px=xs.getPixelForValue(i);x.fillStyle=isBH[i]?'#1c1917':'#1e293b';x.fillRect(px-bw,ys.top,bw*2,ys.bottom-ys.top);}}x.restore();}};
      const tline={id:'tl',afterDraw(c){const x=c.ctx,xs=c.scales.x,ys=c.scales.y,px=xs.getPixelForValue(todayIdx);x.save();x.beginPath();x.setLineDash([3,3]);x.strokeStyle='#f59e0b44';x.lineWidth=1;x.moveTo(px,ys.top);x.lineTo(px,ys.bottom);x.stroke();x.restore();}};
      chartInstance.current = new window.Chart(chartRef.current, {
        type:'line', data:{labels, datasets:[
          {data:highs,fill:'+1',backgroundColor:'rgba(56,189,248,0.07)',borderWidth:0,pointRadius:0,tension:0.3,spanGaps:true},
          {data:lows,fill:false,borderWidth:0,pointRadius:0,tension:0.3,spanGaps:true},
          {data:values,borderWidth:2.5,tension:0.3,spanGaps:false,borderColor:'#38bdf8',
            pointRadius:ctx=>values[ctx.dataIndex]===null?0:ctx.dataIndex===todayIdx?8:2.5,
            pointBackgroundColor:ctx=>ctx.dataIndex===todayIdx?'#f59e0b':ctx.dataIndex<todayIdx?'#94a3b8':'#38bdf8',
            pointBorderColor:ctx=>ctx.dataIndex===todayIdx?'#fbbf24':'transparent',
            pointBorderWidth:ctx=>ctx.dataIndex===todayIdx?4:0,
            segment:{borderColor:ctx=>ctx.p0DataIndex<todayIdx?'#94a3b8':'#38bdf8',borderDash:ctx=>ctx.p0DataIndex>=todayIdx?[5,4]:undefined}},
        ]}, plugins:[shade,tline],
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{enabled:false}},
          scales:{x:{ticks:{font:{size:9},color:ctx=>{if(isBH[ctx.index])return'#f59e0b88';if(isClosed[ctx.index])return'#334155';if(ctx.index===todayIdx)return'#f59e0b';return'#64748b';},maxRotation:0},grid:{display:false}},
            y:{position:'right',min:40,max:220,ticks:{font:{size:9},color:'#475569',stepSize:40},grid:{color:'#1e293b',lineWidth:0.5},border:{display:false}}}},
      });
    };
    loadChart();
    return () => { if(chartInstance.current) chartInstance.current.destroy(); };
  }, [forecast, showChart]);

  const active = forecast || prevData;
  if (!active?.today) return <div className="rounded-xl" style={{background:'#0f172a'}}><div className="flex items-center justify-center gap-3 py-12"><div className="w-4 h-4 border-2 border-slate-700 border-t-amber-400 rounded-full animate-spin"/><span className="text-sm text-slate-400">Loading forecast...</span></div></div>;

  const t = active.today;
  const demandCol = DEMAND_COLOURS[t.demandLevel] || DEMAND_COLOURS.normal;
  const predicted = Math.round(t.predicted);
  const urgentTotal = capacity ? (capacity.am.total||0)+(capacity.pm.total||0)+(capacity.am.embargoed||0)+(capacity.pm.embargoed||0)+(capacity.am.booked||0)+(capacity.pm.booked||0) : 0;
  const amSlots = capacity ? (capacity.am.total||0)+(capacity.am.embargoed||0)+(capacity.am.booked||0) : 0;
  const pmSlots = capacity ? (capacity.pm.total||0)+(capacity.pm.embargoed||0)+(capacity.pm.booked||0) : 0;
  const needed = Math.round(predicted * convRate);
  const coverage = needed > 0 ? Math.round((urgentTotal / needed) * 100) : 100;

  let verdict, verdictText, arcColour, verdictIcon;
  if (coverage >= greenPct) { verdict='Comfortable'; verdictText='#34d399'; arcColour='#10b981'; verdictIcon='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; }
  else if (coverage >= amberPct) { verdict='Tight day'; verdictText='#fbbf24'; arcColour='#f59e0b'; verdictIcon='M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01'; }
  else { verdict='Stretched'; verdictText='#f87171'; arcColour='#ef4444'; verdictIcon='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'; }
  const arcPct = Math.min(coverage, 120) / 120;
  const demandDelta = typicalDemand ? predicted - typicalDemand : null;
  const shortfall = needed > urgentTotal ? needed - urgentTotal : 0;
  const dayLabel = ['Mon','Tue','Wed','Thu','Fri'][((targetDate.getDay()+6)%7)] || 'day';
  const rangePct = t.confidence.high>t.confidence.low ? ((t.predicted-t.confidence.low)/(t.confidence.high-t.confidence.low))*100 : 50;

  // Factors
  const factors = [];
  const ff = t.factors || {};
  if(ff.dayOfWeek) factors.push({label:ff.dayOfWeek.day,effect:ff.dayOfWeek.effect,tip:FACTOR_TIPS.dayOfWeek(ff.dayOfWeek)});
  if(ff.month) factors.push({label:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][ff.month.month-1],effect:ff.month.effect,tip:FACTOR_TIPS.month(ff.month)});
  if(ff.trend) factors.push({label:'Trend',effect:ff.trend.effect,tip:FACTOR_TIPS.trend()});
  if(ff.weather) factors.push({label:`${Math.round(ff.weather.actualTemp)}°C`,effect:ff.weather.tempEffect,tip:FACTOR_TIPS.weather(ff.weather)});
  if(ff.heavyRain) factors.push({label:`${Math.round(ff.heavyRain.precipMm)}mm`,effect:ff.heavyRain.effect,tip:FACTOR_TIPS.heavyRain(ff.heavyRain)});
  if(ff.schoolHoliday) factors.push({label:'School hol',effect:ff.schoolHoliday,tip:FACTOR_TIPS.schoolHoliday()});
  if(ff.firstWeekBack) factors.push({label:'Term starts',effect:ff.firstWeekBack,tip:FACTOR_TIPS.firstWeekBack()});
  if(ff.firstDayBack) factors.push({label:'1st back',effect:ff.firstDayBack,tip:FACTOR_TIPS.firstDayBack()});
  if(ff.nearBankHoliday) factors.push({label:'Near BH',effect:ff.nearBankHoliday.effect,tip:FACTOR_TIPS.nearBankHoliday(ff.nearBankHoliday)});
  if(ff.christmasPeriod) factors.push({label:'Xmas',effect:ff.christmasPeriod,tip:FACTOR_TIPS.christmasPeriod()});
  if(ff.endOfMonth) factors.push({label:`${targetDate.getDate()}th`,effect:ff.endOfMonth,tip:FACTOR_TIPS.endOfMonth()});
  if(ff.shortWeek) factors.push({label:`${ff.shortWeek.workingDays}d week`,effect:ff.shortWeek.effect,tip:FACTOR_TIPS.shortWeek(ff.shortWeek)});
  if(ff.mediaScare) factors.push({label:'Media',effect:ff.mediaScare.effect,tip:FACTOR_TIPS.mediaScare()});
  factors.sort((a,b) => Math.abs(b.effect)-Math.abs(a.effect));
  const topFactors = factors.slice(0,5);

  // Duty doctors
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const vds = `${String(targetDate.getDate()).padStart(2,'0')}-${targetDate.toLocaleString('en-GB',{month:'short'})}-${targetDate.getFullYear()}`;
  const dds = huddleData?.dates?.includes(vds) ? vds : null;
  const resolveDuty = (sess) => { if(!hasDuty||!dds) return null; const doc=getDutyDoctor(huddleData,dds,sess,dutySlots); if(!doc) return null; const m=teamClinicians.find(tc=>matchesStaffMember(doc.name,tc)); return {name:m?.name||doc.name,title:m?.title}; };
  const dutyAm = resolveDuty('am'), dutyPm = resolveDuty('pm');
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayDayName = dayNames[targetDate.getDay()];
  const amTarget = hs?.expectedCapacity?.[todayDayName]?.am || 0;
  const pmTarget = hs?.expectedCapacity?.[todayDayName]?.pm || 0;
  const amDutyCol = amTarget > 0 ? getBand(amSlots, amTarget).colour : '#fbbf24';
  const pmDutyCol = pmTarget > 0 ? getBand(pmSlots, pmTarget).colour : '#34d399';

  return (
    <div className="rounded-xl overflow-hidden transition-opacity duration-300" style={{ background:'#0f172a', opacity: loading ? 0.7 : 1 }}>
      {/* Header */}
      <div style={{padding:'16px 24px 14px'}}>
        <div className="flex items-center justify-between" style={{marginBottom:14}}>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span style={{fontSize:11,color:'#64748b',textTransform:'uppercase',letterSpacing:'1px'}}>Today&apos;s summary · {targetDate.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</span>
          </div>
          <button onClick={()=>setShowSettings(!showSettings)} style={{color:'#475569',background:'none',border:'none',cursor:'pointer',padding:2}} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06c.5.5 1.21.71 1.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </button>
        </div>
        <div className="flex items-center gap-6">
          <svg viewBox="0 0 120 74" width="120" height="74" className="flex-shrink-0">
            <path d="M 10 68 A 50 50 0 0 1 110 68" fill="none" stroke="#1e293b" strokeWidth="9" strokeLinecap="round"/>
            <path d="M 10 68 A 50 50 0 0 1 110 68" fill="none" stroke={arcColour} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${arcPct*157} 157`}/>
            <text x="60" y="56" textAnchor="middle" fill={verdictText} style={{fontSize:26,fontWeight:800}}>{coverage}%</text>
            <text x="60" y="69" textAnchor="middle" fill="#64748b" style={{fontSize:9}}>coverage</text>
          </svg>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={verdictText} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={verdictIcon}/></svg>
              <span className="font-extrabold" style={{fontSize:28,color:verdictText,lineHeight:1}}>{verdict}</span>
            </div>
            <div style={{fontSize:13,color:'#94a3b8',marginTop:4}}>{shortfall>0?`${shortfall} urgent slots short of estimated need`:`${urgentTotal-needed} slots above estimated need`}</div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="flex items-center gap-1.5 justify-end" style={{marginBottom:2}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
              <span style={{fontSize:11,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'0.5px'}}>Prediction</span>
            </div>
            <div className="flex items-baseline gap-1.5 justify-end"><span style={{fontSize:42,fontWeight:800,color:demandCol.text,lineHeight:1}}>{predicted}</span><span style={{fontSize:13,color:'#94a3b8'}}>requests</span></div>
            <div className="flex items-center gap-1 justify-end" style={{marginTop:4}}>
              <span style={{fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:4,background:demandCol.bg,color:demandCol.text}}>{demandCol.label}</span>
              {demandDelta!==null&&demandDelta!==0&&<span style={{fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:4,background:demandDelta>0?'rgba(251,113,133,0.1)':'rgba(52,211,153,0.1)',color:demandDelta>0?'#fb7185':'#34d399'}}>{demandDelta>0?'↑':'↓'}{Math.abs(demandDelta)} vs typical</span>}
            </div>
            <div className="flex items-center gap-1 justify-end" style={{marginTop:6}}>
              <span style={{fontSize:11,color:'#475569'}}>{t.confidence.low}</span>
              <div style={{width:70,height:5,background:'#1e293b',borderRadius:3,position:'relative'}}><div style={{position:'absolute',top:'50%',left:`${rangePct}%`,transform:'translate(-50%,-50%)',width:7,height:7,borderRadius:'50%',background:demandCol.text}}/></div>
              <span style={{fontSize:11,color:'#475569'}}>{t.confidence.high}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Factors + gap bar */}
      <div style={{background:'#141e30',padding:'10px 24px'}}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
            {topFactors.map((fac,i) => (
              <span key={i} className="group relative" style={{fontSize:11,fontWeight:600,padding:'3px 8px',borderRadius:4,background:'#1e293b',color:fac.effect>=0?'#60a5fa':'#34d399',cursor:'default'}}>
                {fac.effect>=0?'↑':'↓'} <span style={{color:'#94a3b8'}}>{fac.label}</span> {fac.effect>0?'+':''}{Math.round(fac.effect)}
                <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-md text-xs font-normal text-slate-200 whitespace-nowrap z-10" style={{background:'#0f172a',border:'1px solid #334155'}}>{fac.tip}</span>
              </span>
            ))}
          </div>
          <div className="w-px self-stretch" style={{background:'#1e293b'}}/>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg><span style={{fontSize:22,fontWeight:800,color:'#a78bfa'}}>{needed}</span><span style={{fontSize:11,color:'#64748b'}}> need</span></div>
            <div style={{width:60,height:12,display:'flex',gap:1,borderRadius:3,overflow:'hidden'}}><div style={{flex:Math.max(urgentTotal,1),background:'#34d399'}}/>{shortfall>0&&<div style={{flex:shortfall,background:arcColour}}/>}</div>
            <div className="flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg><span style={{fontSize:22,fontWeight:800,color:'#34d399'}}>{urgentTotal}</span><span style={{fontSize:11,color:'#64748b'}}> have</span></div>
          </div>
        </div>
      </div>

      {/* Duty doctors */}
      {(dutyAm||dutyPm) && <div style={{padding:'10px 24px'}}><div className="flex gap-2">
        {[{doc:dutyAm,sess:'AM',col:amDutyCol,slots:amSlots},{doc:dutyPm,sess:'PM',col:pmDutyCol,slots:pmSlots}].map(({doc,sess,col,slots:sl}) => {
          if(!doc) return <div key={sess} className="flex-1"/>;
          return <div key={sess} className="flex-1 flex items-center gap-2 rounded-lg" style={{background:'#1e293b',border:'1px solid #334155',padding:'8px 12px'}}>
            <div className="flex-shrink-0" style={{width:30,height:30,borderRadius:'50%',background:`${col}20`,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={col} stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
            </div>
            <div className="flex-1 min-w-0"><div style={{fontSize:9,color:'#64748b',textTransform:'uppercase',letterSpacing:'0.5px'}}>{sess} duty</div><div className="font-bold truncate" style={{fontSize:13,color:'#e2e8f0'}}>{doc.title?`${doc.title} `:''}{doc.name}</div></div>
            <div className="flex-shrink-0 text-center rounded-md" style={{background:`${col}20`,border:`1px solid ${col}40`,padding:'4px 8px'}}>
              <div style={{fontSize:16,fontWeight:800,color:col,lineHeight:1}}>{sl}</div>
              <div style={{fontSize:8,color:'#64748b',marginTop:1}}>slots</div>
            </div>
          </div>;
        })}
      </div></div>}

      {/* Chart toggle */}
      <div style={{borderTop:'1px solid #1e293b'}}>
        <button onClick={()=>setShowChart(!showChart)} className="w-full flex items-center justify-between" style={{padding:'10px 24px',background:'none',border:'none',cursor:'pointer'}}>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span style={{fontSize:12,color:'#64748b'}}>14-day demand forecast</span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" style={{transform:showChart?'rotate(180deg)':'none',transition:'transform 0.2s'}}><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {showChart && <div style={{padding:'0 24px 16px'}}><div style={{position:'relative',height:180}}><canvas ref={chartRef}/></div>
          <div className="flex justify-center gap-3 flex-wrap" style={{marginTop:8}}>
            <span className="flex items-center gap-1" style={{fontSize:10,color:'#64748b'}}><span style={{width:12,height:2,background:'#94a3b8',display:'inline-block'}}/>Past</span>
            <span className="flex items-center gap-1" style={{fontSize:10,color:'#64748b'}}><span style={{width:12,height:2,background:'#38bdf8',display:'inline-block'}}/>Forecast</span>
            <span className="flex items-center gap-1" style={{fontSize:10,color:'#64748b'}}><span style={{width:12,height:6,borderRadius:2,background:'rgba(56,189,248,0.12)',display:'inline-block'}}/>Range</span>
          </div>
        </div>}
      </div>

      {/* Settings */}
      {showSettings && <div style={{borderTop:'1px solid #1e293b',padding:'14px 24px',background:'#141e30'}}>
        <div style={{marginBottom:12}}><label style={{fontSize:12,fontWeight:600,color:'#94a3b8',display:'block',marginBottom:6}}>Conversion rate</label>
          <div className="flex items-center gap-3"><input type="range" min="0.05" max="0.60" step="0.01" value={convRate} onChange={e=>updateSetting('conversionRate',parseFloat(e.target.value))} className="flex-1"/>
            <span style={{fontSize:13,fontWeight:700,color:'#e2e8f0',background:'#1e293b',padding:'4px 12px',borderRadius:6,minWidth:52,textAlign:'center'}}>{convRate.toFixed(2)}</span></div>
          <div style={{fontSize:10,color:'#475569',marginTop:4}}>{predicted} × {convRate.toFixed(2)} = {needed} est. appointments</div></div>
        <div className="flex gap-4">
          <div className="flex-1"><label style={{fontSize:12,fontWeight:600,color:'#94a3b8',display:'block',marginBottom:6}}>Green (%)</label>
            <input type="number" value={greenPct} onChange={e=>updateSetting('greenPct',parseInt(e.target.value)||100)} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #334155',background:'#1e293b',color:'#e2e8f0',fontSize:13}}/></div>
          <div className="flex-1"><label style={{fontSize:12,fontWeight:600,color:'#94a3b8',display:'block',marginBottom:6}}>Amber (%)</label>
            <input type="number" value={amberPct} onChange={e=>updateSetting('amberPct',parseInt(e.target.value)||80)} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'1px solid #334155',background:'#1e293b',color:'#e2e8f0',fontSize:13}}/></div>
        </div>
      </div>}
    </div>
  );
}
