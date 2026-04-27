'use client';
import { useState, useMemo, useEffect } from 'react';
import { getHuddleCapacity, getDateTotals, getDutyDoctor, getSiteColour } from '@/lib/huddle';
import { matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { predictDemand, getWeatherForecast, BASELINE, DOW_EFFECTS } from '@/lib/demandPredictor';
import ClinicianCapacity from './ClinicianCapacity';

const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const VB = { over:{bg:'#3b82f6',text:'#fff'}, good:{bg:'#10b981',text:'#fff'}, tight:{bg:'#f59e0b',text:'#fff'}, short:{bg:'#ef4444',text:'#fff'}, none:{bg:'#475569',text:'#94a3b8'} };
function vBand(s,t) { if(t<=0)return VB.none; const p=(s/t)*100; return p>=120?VB.over:p>=90?VB.good:p>=80?VB.tight:VB.short; }

// DOW-relative demand colouring
function dowDemandColour(predicted, dayOfWeek) {
  if (!predicted || dayOfWeek < 0 || dayOfWeek > 4) return { bg: '#475569', text: '#fff', label: '–' };
  const dowBaseline = BASELINE + DOW_EFFECTS[dayOfWeek];
  const ratio = predicted / dowBaseline;
  if (ratio <= 0.9) return { bg: '#0ea5e9', text: '#fff', label: 'Low' };
  if (ratio <= 1.1) return { bg: '#10b981', text: '#fff', label: 'Normal' };
  if (ratio <= 1.25) return { bg: '#f59e0b', text: '#fff', label: 'High' };
  return { bg: '#ef4444', text: '#fff', label: 'V.High' };
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

export default function HuddleForward({ data, saveData, huddleData, setActiveSection }) {
  const [selectedDay, setSelectedDay] = useState(null);
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

  useEffect(() => { getWeatherForecast(16).then(w=>setWeather(w)).catch(()=>{}); }, []);

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
        const pred = predictDemand(date, weather?.[isoKey]||null);
        const isBH = pred?.isBankHoliday||false;
        const predicted = pred?.predicted?Math.round(pred.predicted):null;
        const dowIdx = date.getDay() - 1; // 0=Mon, 4=Fri
        const dc = dowDemandColour(predicted, dowIdx);
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
          uCap,routCap:hasData&&!isBH?getHuddleCapacity(huddleData,dateStr,hs,routOv):null,
          amDuty,pmDuty});
      }
      res.push({days,ws,label:`${ws.getDate()} ${ws.toLocaleString('en-GB',{month:'short'})}`,wU,wT,wR:wRA+wRE+wRB,wRA,wRE,wRB});
    }
    return res;
  }, [huddleData,hs,urgOv,routOv,weather,convRate,dutySlots,hasDuty]);

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
    <div className="space-y-6">
      {/* Main calendar — desktop only */}
      <div className="rounded-2xl overflow-hidden hidden lg:block" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'}}>
        <div className="px-5 py-4 flex items-center gap-2 border-b border-white/10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <span className="text-sm font-semibold text-white">Capacity planning</span>
          <span className="text-xs text-slate-500 ml-auto">6-week forward view</span>
        </div>
        {/* Header */}
        <div className="grid border-b border-white/10" style={{gridTemplateColumns:COLS}}>
          <div className="p-3"/>
          {['Mon','Tue','Wed','Thu','Fri'].map(d=><div key={d} className="p-3 text-center text-xs font-semibold text-slate-500">{d}</div>)}
          <div className="p-2 text-center border-l border-red-900/30" style={{background:'rgba(239,68,68,0.08)'}}>
            <div style={{fontSize:7,fontWeight:700,color:'#f87171',textTransform:'uppercase'}}>Urgent</div>
          </div>
          <div className="p-2 text-center border-l border-emerald-900/30" style={{background:'rgba(16,185,129,0.08)'}}>
            <div style={{fontSize:7,fontWeight:700,color:'#34d399',textTransform:'uppercase'}}>Routine</div>
          </div>
        </div>

        {/* Weeks */}
        {weeks.map((wk,wi)=>(
          <div key={wi} className="grid border-b border-white/5" style={{gridTemplateColumns:COLS}}>
            <div className="p-3 border-r border-white/5 flex flex-col justify-center">
              <div className="text-xs font-bold text-slate-300">Wk {wi+1}</div>
              <div className="text-[10px] text-slate-600">{wk.label}</div>
            </div>
            {wk.days.map((d,di)=>{
              const sel=selectedDay===d.isoKey;
              if(d.isBH) return <div key={di} className="p-2 border-r border-white/5"><div className="rounded-lg h-full flex items-center justify-center" style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.2)'}}><span className="text-xs font-semibold text-amber-500">Bank hol</span></div></div>;
              if(!d.hasData) return <div key={di} className="p-2 border-r border-white/5"><div className="rounded-lg h-full flex items-center justify-center" style={{background:'rgba(255,255,255,0.03)'}}><span className="text-[10px] text-slate-600">No data</span></div></div>;
              const amV=vBand(d.amS,d.amT),pmV=vBand(d.pmS,d.pmT);
              return (
                <div key={di} className="p-2 border-r border-white/5">
                  <div onClick={()=>setSelectedDay(sel?null:d.isoKey)}
                    className="rounded-lg h-full cursor-pointer transition-all duration-150"
                    style={{padding:'6px',borderLeft:d.isToday?'3px solid #10b981':'3px solid transparent',
                      outline:sel?'2px solid #6366f1':'none',outlineOffset:-1,
                      background:sel?'rgba(99,102,241,0.15)':d.isPast?'rgba(255,255,255,0.02)':'transparent',
                      opacity:d.isPast?0.5:1, filter:d.isPast?'saturate(0.4)':'none'}}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-300">{d.dayNum}</span>
                      {d.predicted&&<span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{background:d.dc.bg,color:d.dc.text}}>{d.predicted}</span>}
                    </div>
                    <div className="flex gap-1 mb-1.5">
                      <div className="flex-1 text-center rounded-md py-1" style={{background:amV.bg}}>
                        <div className="text-sm font-bold" style={{color:amV.text}}>{d.amS}</div>
                        <div className="text-[7px] font-bold" style={{color:amV.text,opacity:0.8}}>AM</div>
                      </div>
                      <div className="flex-1 text-center rounded-md py-1" style={{background:pmV.bg}}>
                        <div className="text-sm font-bold" style={{color:pmV.text}}>{d.pmS}</div>
                        <div className="text-[7px] font-bold" style={{color:pmV.text,opacity:0.8}}>PM</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-bold text-slate-500 flex-shrink-0">{d.rTotal}</span>
                      <div className="rounded-md overflow-hidden flex flex-1" style={{height:10,background:'#334155'}}>
                        {d.rTotal>0&&<>
                          {d.rA>0&&<div style={{width:`${(d.rA/d.rTotal)*100}%`,height:10,backgroundColor:'#10b981',minWidth:1}}/>}
                          {d.rE>0&&<div style={{width:`${(d.rE/d.rTotal)*100}%`,height:10,backgroundColor:'#f59e0b',minWidth:1}}/>}
                          {d.rB>0&&<div style={{width:`${(d.rB/d.rTotal)*100}%`,height:10,background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444',minWidth:1}}/>}
                        </>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Urgent total */}
            <div className="p-1.5 border-l border-red-900/30 flex items-center justify-center" style={{background:'rgba(239,68,68,0.08)'}}>
              {wk.wU>0?<div className="rounded-md text-center py-2 px-1 w-full" style={{background:vBand(wk.wU,wk.wT).bg}}>
                <div className="text-base font-extrabold text-white">{wk.wU}</div>
                {wk.wT>0&&<div className="text-[8px] text-white" style={{opacity:0.6}}>/ {wk.wT}</div>}
              </div>:<div className="text-[10px] text-slate-600">—</div>}
            </div>
            {/* Routine total */}
            <div className="p-1.5 border-l border-emerald-900/30 flex items-center justify-center" style={{background:'rgba(16,185,129,0.08)'}}>
              {wk.wR>0?<div className="rounded-md text-center py-2 px-1 w-full" style={{background:rTarget>0?vBand(wk.wR,rTarget).bg:'#10b981'}}>
                <div className="text-base font-extrabold text-white">{wk.wR}</div>
                {rTarget>0&&<div className="text-[8px] text-white" style={{opacity:0.6}}>/ {rTarget}</div>}
              </div>:<div className="text-[10px] text-slate-600">—</div>}
            </div>
          </div>
        ))}
        {/* Key + settings */}
        <div className="px-5 py-3 flex items-center gap-5 flex-wrap text-[10px] text-slate-500 border-t border-white/5">
          <span className="font-semibold text-slate-400">Key:</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/>Available</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/>Embargoed</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444'}}/>Booked</span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#3b82f6'}}/>Over</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}}/>On target</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}}/>Tight</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{background:'#ef4444'}}/>Short</span>
          <span className="text-slate-700">|</span>
          {rTarget>0
            ?<span className="text-slate-400">Routine: <strong className="text-slate-300">{rTarget}</strong>/wk <button onClick={()=>{const v=prompt('Weekly routine target:',rTarget);if(v)updateTarget(v);}} className="text-indigo-400 underline cursor-pointer ml-1" style={{background:'none',border:'none',fontSize:'inherit'}}>edit</button></span>
            :<button onClick={()=>{const v=prompt('Set weekly routine slot target:','200');if(v)updateTarget(v);}} className="text-indigo-400 underline cursor-pointer" style={{background:'none',border:'none',fontSize:'inherit'}}>Set routine target</button>}
        </div>

        {/* Diagram: how to read the calendar */}
        <div className="px-5 py-4 border-t border-white/5">
          <div className="text-xs font-semibold text-slate-400 mb-3">How to read the calendar</div>
          <div className="flex gap-6 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="rounded-lg p-2 w-20 flex-shrink-0" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)'}}>
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-bold text-slate-400">5</span><span className="text-[8px] font-bold px-1 rounded" style={{background:'#10b981',color:'white'}}>132</span></div>
                <div className="flex gap-0.5 mb-1"><div className="flex-1 text-center rounded py-0.5" style={{background:'#10b981'}}><span className="text-[8px] font-bold text-white">18</span></div><div className="flex-1 text-center rounded py-0.5" style={{background:'#f59e0b'}}><span className="text-[8px] font-bold text-white">10</span></div></div>
                <div className="flex items-center gap-1"><span className="text-[8px] font-bold text-slate-500">42</span><div className="rounded overflow-hidden flex flex-1" style={{height:5,background:'#334155'}}><div style={{width:'50%',background:'#10b981',height:5}}/><div style={{width:'20%',background:'#f59e0b',height:5}}/><div style={{width:'30%',background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444',height:5}}/></div></div>
              </div>
              <div className="text-[11px] text-slate-500 leading-relaxed" style={{maxWidth:200}}>
                <div className="text-slate-400 font-semibold mb-1">Each day shows:</div>
                <div><span className="text-slate-300">Date</span> + predicted demand (colour = vs typical for this weekday)</div>
                <div className="mt-0.5"><span className="text-slate-300">AM / PM</span> urgent slots (colour = vs target)</div>
                <div className="mt-0.5"><span className="text-slate-300">Number + bar</span> = routine slots (avail / embargo / booked)</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed" style={{maxWidth:220}}>
              <div className="text-slate-400 font-semibold mb-1">Prediction colours:</div>
              <div className="flex items-center gap-2 mb-0.5"><span className="w-2 h-2 rounded-sm" style={{background:'#0ea5e9'}}/> Below typical for this weekday</div>
              <div className="flex items-center gap-2 mb-0.5"><span className="w-2 h-2 rounded-sm" style={{background:'#10b981'}}/> Normal for this weekday</div>
              <div className="flex items-center gap-2 mb-0.5"><span className="w-2 h-2 rounded-sm" style={{background:'#f59e0b'}}/> Above typical for this weekday</div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-sm" style={{background:'#ef4444'}}/> Well above typical for this weekday</div>
            </div>
            <div className="text-[11px] text-slate-500 leading-relaxed" style={{maxWidth:180}}>
              <div className="text-slate-400 font-semibold mb-1">Week totals:</div>
              <div><span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{background:'rgba(239,68,68,0.15)'}}/> Urgent total vs target sum</div>
              <div className="mt-0.5"><span className="inline-block w-3 h-3 rounded-sm align-middle mr-1" style={{background:'rgba(16,185,129,0.15)'}}/> Routine total vs weekly target</div>
            </div>
          </div>
        </div>
      </div>

      {/* Detail popup — desktop only (mobile uses inline expansion in strip) */}
      {detailDay&&(
        <div className="hidden lg:block rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="px-5 py-3 flex items-center justify-between" style={{background:"rgba(15,23,42,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <span className="text-sm font-semibold text-white">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr} — who and where</span>
            <button onClick={()=>setSelectedDay(null)} className="text-white/60 hover:text-white text-sm font-bold" style={{background:'none',border:'none',cursor:'pointer'}}>✕</button>
          </div>
          <div className="grid grid-cols-3 gap-0">
            <div className="p-5" style={{borderRight:"1px solid rgba(255,255,255,0.06)"}}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase text-red-500">AM urgent</span>
                <span className="text-sm font-extrabold text-red-500">{detailDay.amS}</span>
                {detailDay.amT>0&&<span className="text-[10px] text-slate-400">/ {detailDay.amT}</span>}
              </div>
              <DutyPill doc={detailDay.amDuty} colour="#dc2626" bgTint="#fef2f2" borderCol="#fecaca"/>
              <div className="space-y-1.5">
                {detailClin.am.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return<div key={j} className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.04)"}}>{lc&&<div className="w-1.5 h-4 rounded-sm" style={{background:lc}}/>}<span className="text-xs text-slate-300 flex-1 truncate">{c.name}</span><span className="text-xs font-bold text-slate-300">{c.slots+c.bkd}</span></div>;})}
                {detailClin.am.length===0&&<div className="text-xs text-slate-300 py-3 text-center">No slots</div>}
              </div>
            </div>
            <div className="p-5" style={{borderRight:"1px solid rgba(255,255,255,0.06)"}}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase text-blue-500">PM urgent</span>
                <span className="text-sm font-extrabold text-blue-500">{detailDay.pmS}</span>
                {detailDay.pmT>0&&<span className="text-[10px] text-slate-400">/ {detailDay.pmT}</span>}
              </div>
              <DutyPill doc={detailDay.pmDuty} colour="#2563eb" bgTint="#eff6ff" borderCol="#bfdbfe"/>
              <div className="space-y-1.5">
                {detailClin.pm.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return<div key={j} className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.04)"}}>{lc&&<div className="w-1.5 h-4 rounded-sm" style={{background:lc}}/>}<span className="text-xs text-slate-300 flex-1 truncate">{c.name}</span><span className="text-xs font-bold text-slate-300">{c.slots+c.bkd}</span></div>;})}
                {detailClin.pm.length===0&&<div className="text-xs text-slate-300 py-3 text-center">No slots</div>}
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase text-red-500">Routine</span>
                <span className="text-sm font-extrabold text-red-500">{detailDay.rTotal}</span>
              </div>
              <div className="mb-4"><DonutGauge avail={detailDay.rA} emb={detailDay.rE} booked={detailDay.rB}/></div>
              <div className="space-y-1.5">
                {detailClin.rout.map((c,j)=>{const lc=c.loc?siteCol(c.loc):null;return<div key={j} className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors" style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.04)"}}>{lc&&<div className="w-1.5 h-4 rounded-sm" style={{background:lc}}/>}<span className="text-xs text-slate-300 flex-1 truncate">{c.name}</span><span className="text-xs font-bold text-slate-300">{c.slots+c.bkd}</span></div>;})}
                {detailClin.rout.length===0&&<div className="text-xs text-slate-300 py-3 text-center">No slots</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summaries — desktop grid */}
      <div className="hidden lg:grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="px-5 py-3" className="flex items-center gap-2" style={{background:"rgba(239,68,68,0.15)",borderBottom:"1px solid rgba(239,68,68,0.1)"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01"/></svg>
            <span className="text-xs font-semibold text-white">Urgent capacity below target</span>
            <span className="text-xs text-white/60 ml-auto">{shortDays.length}</span>
          </div>
          <div className="p-4 space-y-2">
            {shortDays.length===0&&<p className="text-sm text-slate-400 text-center py-3">All days meeting target</p>}
            {shortDays.slice(0,8).map((d,i)=>{const u=d.amS+d.pmS,t=d.amT+d.pmT;return<div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors cursor-pointer" style={{background:"rgba(255,255,255,0.04)"}} onClick={()=>setSelectedDay(d.isoKey)}>
              <span className="text-xs font-semibold text-slate-300 w-20">{d.dayShort} {d.dayNum} {d.monthStr}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.08)"}}><div className="h-full rounded-full" style={{width:`${Math.min((u/t)*100,100)}%`,background:u<t*0.8?'#ef4444':'#f59e0b'}}/></div>
              <span className="text-xs font-bold text-red-400">{u}</span>
              <span className="text-[10px] text-slate-400">/ {t}</span>
            </div>;})}
          </div>
        </div>

        <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="px-5 py-3" className="flex items-center gap-2" style={{background:"rgba(245,158,11,0.15)",borderBottom:"1px solid rgba(245,158,11,0.1)"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            <span className="text-xs font-semibold text-white">Highest demand days</span>
          </div>
          <div className="p-4 space-y-3">
            {topDemand.map((d,i)=>{
              const u=d.amS+d.pmS;const cov=d.needed>0?Math.round((u/d.needed)*100):100;
              const ap=Math.min(cov,120)/120;const col=cov>=90?'#10b981':cov>=80?'#f59e0b':'#ef4444';
              const v=cov>=90?'OK':cov>=80?'Tight':'Short';
              return<div key={i} className="flex items-center gap-4 px-3 py-2.5 rounded-lg transition-colors cursor-pointer" style={{background:"rgba(255,255,255,0.04)"}} onClick={()=>setSelectedDay(d.isoKey)}>
                <span className="text-xs font-semibold text-slate-300 w-20">{d.dayShort} {d.dayNum} {d.monthStr}</span>
                <svg viewBox="0 0 60 34" style={{width:48,height:28,flexShrink:0}}>
                  <path d="M 6 30 A 24 24 0 0 1 54 30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" strokeLinecap="round"/>
                  <path d="M 6 30 A 24 24 0 0 1 54 30" fill="none" stroke={col} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${ap*75} 75`}/>
                  <text x="30" y="28" textAnchor="middle" fill={col} style={{fontSize:9,fontWeight:800}}>{cov}%</text>
                </svg>
                <div className="flex-1"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{background:d.dc.bg,color:d.dc.text}}>{d.predicted} pred</span></div>
                <div className="text-right">
                  <div className="text-xs font-bold" style={{color:col}}>{v}</div>
                  <div className="text-[10px] text-slate-400">{u} / {d.needed}</div>
                </div>
              </div>;})}
          </div>
        </div>

        {rTarget>0&&<div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="px-5 py-3" className="flex items-center gap-2" style={{background:"rgba(124,58,237,0.15)",borderBottom:"1px solid rgba(124,58,237,0.1)"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            <span className="text-xs font-semibold text-white">Weekly routine capacity</span>
          </div>
          <div className="p-4 space-y-2">
            {weeks.filter(w=>w.wR>0).map((w,i)=>{const vb=vBand(w.wR,rTarget);return<div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:"rgba(255,255,255,0.04)"}}>
              <span className="text-xs font-semibold text-slate-300 w-12">Wk {weeks.indexOf(w)+1}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.08)"}}><div className="h-full rounded-full" style={{width:`${Math.min((w.wR/rTarget)*100,100)}%`,background:vb.bg}}/></div>
              <span className="text-xs font-bold" style={{color:vb.bg}}>{w.wR}</span>
              <span className="text-[10px] text-slate-400">/ {rTarget}</span>
            </div>;})}
          </div>
        </div>}

        <div className="rounded-xl overflow-hidden" style={{background:"rgba(15,23,42,0.7)",border:"1px solid rgba(255,255,255,0.06)"}}>
          <div className="px-5 py-3" className="flex items-center gap-2" style={{background:"rgba(15,23,42,0.85)",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            <span className="text-xs font-semibold text-white">Week-on-week</span>
          </div>
          <div className="p-4 space-y-2">
            {weeks.filter(w=>w.wU>0).map((w,i,arr)=>{const delta=i>0?w.wU-arr[i-1].wU:0;return<div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{background:"rgba(255,255,255,0.04)"}}>
              <span className="text-xs font-semibold text-slate-300 w-12">Wk {weeks.indexOf(w)+1}</span>
              <div className="flex items-center gap-1.5"><span className="text-sm font-bold text-slate-200">{w.wU}</span><span className="text-[10px] text-slate-400">urg</span></div>
              <div className="flex items-center gap-1.5"><span className="text-sm font-bold" style={{color:'#10b981'}}>{w.wR}</span><span className="text-[10px] text-slate-400">rout</span></div>
              {delta!==0&&<span className={`text-xs font-bold ml-auto ${delta>0?'text-emerald-500':'text-red-500'}`}>{delta>0?'↑':'↓'}{Math.abs(delta)} urg</span>}
            </div>;})}
          </div>
        </div>
      </div>

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
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{detailDay.dayName} {detailDay.dayNum} {detailDay.monthStr}</div>
                          {detailDay.predicted && <div className="text-[10px] text-slate-500">Predicted demand: <span style={{color: detailDay.dc.text, fontWeight: 600}}>{detailDay.predicted}</span></div>}
                        </div>
                        <button onClick={() => setSelectedDay(null)} className="text-slate-500 hover:text-white text-xs" style={{background:'none',border:'none',cursor:'pointer'}}>✕</button>
                      </div>
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
  );
}
