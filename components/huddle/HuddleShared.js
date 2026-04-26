'use client';
import { useState, useRef, useMemo, useEffect } from 'react';
import { getHuddleCapacity, getNDayAvailability } from '@/lib/huddle';
import { matchesStaffMember } from '@/lib/data';

export const ROLE_COLOURS = {
  'GP Partner': 'bg-blue-50 border-blue-200',
  'Associate Partner': 'bg-blue-50 border-blue-200',
  'Salaried GP': 'bg-indigo-50 border-indigo-200',
  'Locum': 'bg-purple-50 border-purple-200',
  'ANP': 'bg-emerald-50 border-emerald-200',
  'Paramedic Practitioner': 'bg-amber-50 border-amber-200',
  'GP Registrar': 'bg-rose-50 border-rose-200',
  'Pharmacist': 'bg-cyan-50 border-cyan-200',
  'Practice Nurse': 'bg-teal-50 border-teal-200',
  'HCA': 'bg-lime-50 border-lime-200',
};
// ── Reusable radial gauge (SVG) with scroll-triggered animation ──
export function MiniGauge({ value, max, size = 80, strokeWidth = 8, colour = '#10b981', trackColour = '#e2e8f0', label, sublabel, children }) {
  const rawPct = max > 0 ? (value / max) * 100 : 0;
  const overTarget = rawPct > 100;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  // For over-target: animate to full circle then keep going a bit (up to 1.2x)
  const displayPct = overTarget ? 100 : Math.min(rawPct, 100);
  const dashOffset = circumference - (circumference * displayPct / 100);

  // Intersection Observer for scroll-triggered animation
  const gaugeRef = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = gaugeRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center" ref={gaugeRef}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track circle */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColour} strokeWidth={strokeWidth} />
        {/* Filled arc — animates on scroll */}
        {displayPct > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={colour} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={inView ? dashOffset : circumference}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{
              transition: `stroke-dashoffset ${overTarget ? '1.2s' : '0.8s'} cubic-bezier(0.4, 0, 0.2, 1)`,
            }} />
        )}
        {children}
      </svg>
      {label && <div className="text-[10px] text-slate-500 font-medium mt-0.5">{label}</div>}
      {sublabel && <div className="text-[9px] text-slate-400">{sublabel}</div>}
    </div>
  );
}

// ── Capacity Day Detail Panel (right slide-out) ──────────────────
export function CapacityDayPanel({ dateStr, huddleData, huddleSettings, overrides, teamClinicians, onClose }) {
  if (!dateStr || !huddleData) return null;
  const cap = getHuddleCapacity(huddleData, dateStr, huddleSettings, overrides);

  // Merge AM+PM clinician data into unified list
  const mergedClinicians = {};
  [...cap.am.byClinician, ...cap.pm.byClinician].forEach(c => {
    if (!mergedClinicians[c.name]) mergedClinicians[c.name] = { name: c.name, available: 0, embargoed: 0, booked: 0 };
    mergedClinicians[c.name].available += c.available || 0;
    mergedClinicians[c.name].embargoed += c.embargoed || 0;
    mergedClinicians[c.name].booked += c.booked || 0;
  });
  const allClinicians = Object.values(mergedClinicians).sort((a, b) => (b.available + b.embargoed + b.booked) - (a.available + a.embargoed + a.booked));

  const totalAvail = allClinicians.reduce((s, c) => s + c.available, 0);
  const totalEmb = allClinicians.reduce((s, c) => s + c.embargoed, 0);
  const totalBooked = allClinicians.reduce((s, c) => s + c.booked, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-96 bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-slide-in-right">
        <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-slate-800 to-slate-700 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="text-sm font-bold text-white">{dateStr}</div>
            <div className="text-[10px] text-white/70">
              {totalAvail + totalEmb} available · {totalBooked} booked
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10">✕</button>
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-1 mb-0.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[10px] text-slate-500">Available</span></div>
            <span className="text-xl font-bold text-emerald-600">{totalAvail}</span>
          </div>
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-1 mb-0.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span className="text-[10px] text-slate-500">Embargoed</span></div>
            <span className="text-xl font-bold text-amber-600">{totalEmb}</span>
          </div>
          <div className="flex flex-col items-center py-3">
            <div className="flex items-center gap-1 mb-0.5"><div className="w-2 h-2 rounded-full bg-slate-400" /><span className="text-[10px] text-slate-500">Booked</span></div>
            <span className="text-xl font-bold text-slate-600">{totalBooked}</span>
          </div>
        </div>

        {/* Column headers */}
        <div className="px-5 py-2 border-b border-slate-100 flex items-center">
          <div className="flex-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Clinician</div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="w-10 text-center text-[9px] font-semibold text-emerald-600 uppercase">Avail</span>
            <span className="w-10 text-center text-[9px] font-semibold text-amber-600 uppercase">Emb</span>
            <span className="w-10 text-center text-[9px] font-semibold text-slate-500 uppercase">Bkd</span>
          </div>
        </div>

        {/* Clinician list */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-3 space-y-1.5">
            {allClinicians.length > 0 ? allClinicians.map((c, i) => {
              const matched = (teamClinicians || []).find(tc => matchesStaffMember(c.name, tc));
              const displayName = matched?.name || c.name;
              const role = matched?.role || '';
              const roleColour = ROLE_COLOURS[role] || 'bg-slate-50 border-slate-200';
              return (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${roleColour}`}>
                  <svg className="w-5 h-5 opacity-50 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{displayName}</div>
                    <div className="text-[10px] opacity-60 truncate">{role || 'Staff'}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-emerald-600 bg-emerald-50 rounded py-0.5">{c.available}</span>
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-amber-600 bg-amber-50 rounded py-0.5">{c.embargoed}</span>
                    <span className="w-10 text-center text-sm font-bold tabular-nums text-slate-600 bg-slate-100 rounded py-0.5">{c.booked}</span>
                  </div>
                </div>
              );
            }) : <div className="text-center text-slate-400 text-xs py-3">No clinicians</div>}
          </div>

          {/* Slot type breakdown */}
          {cap.bySlotType.length > 0 && (
            <div className="px-5 py-3 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">By Slot Type</div>
              <div className="space-y-1">
                {cap.bySlotType.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-xs">
                    <span className="text-slate-600 truncate mr-2">{s.name}</span>
                    <div className="flex items-center gap-2 tabular-nums flex-shrink-0">
                      <span className="text-emerald-600 font-medium">{s.total + (s.totalEmb||0)}</span>
                      {(s.totalBook||0) > 0 && <span className="text-slate-400">({s.totalBook})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 7-day compact bar chart strip with available/embargoed/booked ──
export function SevenDayStrip({ huddleData, huddleSettings, overrides, accent = 'teal', teamClinicians, hasFilter = true }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 14, overrides), [huddleData, huddleSettings, overrides]);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  if (!hasFilter) return (
    <div className="py-8 px-6 text-center" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'}}>
      <div className="text-slate-600 mb-2" style={{fontSize:28}}>↑</div>
      <h3 className="text-sm font-semibold text-slate-400 mb-1">No slots selected</h3>
      <p className="text-xs text-slate-600">Open the filter to configure.</p>
    </div>
  );
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);

  return (
    <div className="p-4" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)'}}>
      <div className="flex items-end gap-1.5 relative" style={{ height: 100 }}>
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const totalPct = hasData && total > 0 ? Math.max(12, (total / maxVal) * 100) : 0;
          const isHovered = hoveredIdx === i;
          const HATCH = 'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444';
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-0.5 relative"
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => hasData && total > 0 && setSelectedDay(d.date)}>
              {hasData && total > 0 && (
                <div className="text-[10px] font-bold transition-all duration-150" style={{color: isToday ? '#e2e8f0' : isHovered ? '#34d399' : '#64748b'}}>
                  {avail + emb}{book > 0 && <span style={{color:'#ef4444'}}>+{book}</span>}
                </div>
              )}
              <div className="w-full rounded-t-md overflow-hidden cursor-pointer transition-all duration-200"
                style={{ height: hasData ? `${totalPct}%` : '8%', minHeight: 3,
                  outline: isToday ? '2px solid #e2e8f0' : isHovered ? '2px solid #34d399' : 'none', outlineOffset: -1,
                  boxShadow: isHovered ? '0 0 12px rgba(52,211,153,0.3)' : 'none',
                  transform: isHovered ? 'scaleX(1.1)' : 'none', zIndex: isHovered || isToday ? 10 : 1 }}>
                {hasData && total > 0 ? (
                  <div className="w-full h-full flex flex-col justify-end">
                    {avail > 0 && <div style={{height:`${(avail/total)*100}%`,background:'#10b981'}} />}
                    {emb > 0 && <div style={{height:`${(emb/total)*100}%`,background:'#f59e0b'}} />}
                    {book > 0 && <div style={{height:`${(book/total)*100}%`,background:HATCH}} />}
                  </div>
                ) : <div className="w-full h-full" style={{background:'#334155'}} />}
              </div>
              <div className="mt-0.5 text-center">
                <div className="text-[9px] leading-tight" style={{color:isToday?'#e2e8f0':'#475569',fontWeight:isToday?700:400}}>{d.dayName?.charAt(0)}</div>
                <div className="text-[8px] leading-tight" style={{color:isToday?'#94a3b8':'#334155'}}>{d.dayNum}</div>
              </div>
              {isHovered && hasData && total > 0 && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 rounded-lg px-2.5 py-1.5 shadow-xl whitespace-nowrap pointer-events-none" style={{background:'#0f172a',border:'1px solid #334155',minWidth:'100px'}}>
                  <div className="text-xs font-bold mb-0.5 text-slate-200">{d.dayName} {d.dayNum}</div>
                  <div className="space-y-0.5 text-[11px]">
                    <div className="flex justify-between gap-3"><span className="text-slate-400">Available</span><span className="font-semibold text-emerald-400">{avail}</span></div>
                    {emb > 0 && <div className="flex justify-between gap-3"><span className="text-slate-400">Embargoed</span><span className="font-semibold text-amber-400">{emb}</span></div>}
                    {book > 0 && <div className="flex justify-between gap-3"><span className="text-slate-400">Booked</span><span className="font-semibold text-red-400">{book}</span></div>}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'4px solid #334155'}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 mt-2 pt-2" style={{borderTop:'1px solid #334155'}}>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}} /><span className="text-xs text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}} /><span className="text-xs text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444',backgroundSize:'5px 5px'}} /><span className="text-xs text-slate-500">Booked</span></div>
      </div>
      {selectedDay && <CapacityDayPanel dateStr={selectedDay} huddleData={huddleData} huddleSettings={huddleSettings} overrides={overrides} teamClinicians={teamClinicians} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}

// ── 28-day graphical routine capacity with hover glow + tooltip ──
export function TwentyEightDayChart({ huddleData, huddleSettings, overrides, teamClinicians }) {
  const days = useMemo(() => getNDayAvailability(huddleData, huddleSettings, 30, overrides), [huddleData, huddleSettings, overrides]);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const maxVal = Math.max(...days.map(d => (d.available || 0) + (d.embargoed || 0) + (d.booked || 0)), 1);
  const totalAvail = days.reduce((sum, d) => sum + (d.available || 0), 0);
  const totalEmb = days.reduce((sum, d) => sum + (d.embargoed || 0), 0);
  const totalBooked = days.reduce((sum, d) => sum + (d.booked || 0), 0);
  const THRESHOLDS = [3, 7, 14, 21];
  const HATCH = 'repeating-linear-gradient(55deg,transparent,transparent 1px,rgba(255,255,255,0.35) 1px,rgba(255,255,255,0.35) 1.8px),#ef4444';

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-400">Next 30 days</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold text-emerald-400">{totalAvail} avail</span>
          {totalEmb > 0 && <span className="font-semibold text-amber-400">{totalEmb} emb</span>}
          {totalBooked > 0 && <span className="font-semibold text-red-400">{totalBooked} booked</span>}
        </div>
      </div>
      <div className="flex items-end gap-px relative" style={{ height: 140 }}>
        {(() => {
          let calDay = 0;
          const calDays = days.map(() => calDay++);
          const totalFlex = days.reduce((s, d) => s + (d.isWeekend ? 0.3 : 1), 0);
          return <>
            {THRESHOLDS.map((t, ti) => {
              const idx = calDays.findIndex(cd => cd >= t);
              if (idx < 0) return null;
              const flexBefore = days.slice(0, idx).reduce((s, d) => s + (d.isWeekend ? 0.3 : 1), 0);
              const pct = (flexBefore / totalFlex) * 100;
              return <div key={`t${ti}`} className="absolute top-0 bottom-0 z-[1] pointer-events-none" style={{ left: `${pct}%` }}>
                <div className="absolute top-0 bottom-0 w-px" style={{ background: '#475569', opacity: 0.6 }} />
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[9px] font-semibold text-slate-500 whitespace-nowrap" style={{background:'#1e293b',border:'1px solid #334155'}}>{t}d</div>
              </div>;
            })}
          </>;
        })()}
        {days.map((d, i) => {
          const isToday = i === 0;
          const hasData = d.available !== null && !d.isWeekend;
          const avail = d.available || 0;
          const emb = d.embargoed || 0;
          const book = d.booked || 0;
          const total = avail + emb + book;
          const pct = hasData && total > 0 ? Math.max(6, (total / maxVal) * 100) : 0;
          const isHovered = hoveredIdx === i;
          if (d.isWeekend) return <div key={i} className="flex-[0.3] h-full" />;
          return (
            <div key={i}
              className={`flex-1 flex flex-col items-center justify-end h-full relative ${d.isMonday && i > 0 ? 'ml-1 pl-1' : ''}`}
              style={{borderLeft: d.isMonday && i > 0 ? '1px solid #334155' : 'none'}}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => hasData && total > 0 && setSelectedDay(d.date)}>
              {hasData && total > 0 && (
                <div className="text-[10px] font-bold transition-all duration-150" style={{color: isToday ? '#e2e8f0' : isHovered ? '#34d399' : '#64748b'}}>
                  {avail}{emb > 0 && <span style={{color:'#fbbf24'}}>+{emb}</span>}
                </div>
              )}
              <div className="w-full rounded-t overflow-hidden cursor-pointer transition-all duration-200"
                style={{ height: hasData ? `${pct}%` : '4%', minHeight: 2,
                  outline: isToday ? '2px solid #e2e8f0' : isHovered ? '2px solid #34d399' : 'none',
                  outlineOffset: -1,
                  boxShadow: isHovered ? '0 0 12px rgba(52,211,153,0.3)' : 'none',
                  transform: isHovered ? 'scaleX(1.15)' : 'none', zIndex: isHovered || isToday ? 10 : 1 }}>
                {!hasData ? <div className="w-full h-full" style={{background:'#1e293b'}} /> : total === 0 ? <div className="w-full h-full" style={{background:'#334155'}} /> : (
                  <div className="w-full h-full flex flex-col justify-end">
                    {avail > 0 && <div style={{height:`${(avail/total)*100}%`,background:'#10b981'}} />}
                    {emb > 0 && <div style={{height:`${(emb/total)*100}%`,background:'#f59e0b'}} />}
                    {book > 0 && <div style={{height:`${(book/total)*100}%`,background:HATCH}} />}
                  </div>
                )}
              </div>
              {isHovered && hasData && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap pointer-events-none" style={{background:'#0f172a',border:'1px solid #334155',minWidth:'120px'}}>
                  <div className="text-xs font-bold mb-1 text-slate-200">{d.dayName} {d.dayNum} {d.monthShort}</div>
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#10b981'}} />Available</span><span className="font-semibold text-emerald-400">{avail}</span></div>
                    {emb > 0 && <div className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#f59e0b'}} />Embargoed</span><span className="font-semibold text-amber-400">{emb}</span></div>}
                    {book > 0 && <div className="flex items-center justify-between gap-3 text-[11px]"><span className="flex items-center gap-1 text-slate-400"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#ef4444'}} />Booked</span><span className="font-semibold text-red-400">{book}</span></div>}
                    <div className="flex items-center justify-between gap-3 text-[11px] pt-0.5" style={{borderTop:'1px solid #334155'}}><span className="text-slate-400">Total</span><span className="font-bold text-white">{total}</span></div>
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0" style={{borderLeft:'4px solid transparent',borderRight:'4px solid transparent',borderTop:'4px solid #334155'}} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-px mt-1.5">
        {days.map((d, i) => {
          if (d.isWeekend) return <div key={i} className="flex-[0.3]" />;
          const isToday = i === 0;
          return <div key={i} className={`flex-1 text-center ${d.isMonday && i > 0 ? 'ml-1 pl-1' : ''}`}>
            <div className="text-[9px] leading-tight" style={{color:isToday?'#e2e8f0':'#475569',fontWeight:isToday?700:400}}>{d.dayName?.charAt(0)}</div>
            <div className="text-[8px] leading-tight" style={{color:isToday?'#94a3b8':'#334155'}}>{d.dayNum}</div>
          </div>;
        })}
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3" style={{borderTop:'1px solid #334155'}}>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#10b981'}} /><span className="text-xs text-slate-500">Available</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:'#f59e0b'}} /><span className="text-xs text-slate-500">Embargoed</span></div>
        <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-sm" style={{background:HATCH,backgroundSize:'5px 5px'}} /><span className="text-xs text-slate-500">Booked</span></div>
      </div>
      {selectedDay && <CapacityDayPanel dateStr={selectedDay} huddleData={huddleData} huddleSettings={huddleSettings} overrides={overrides} teamClinicians={teamClinicians} onClose={() => setSelectedDay(null)} />}
    </div>
  );
}

// Shared speedometer gauge — half-arc with smooth gradient
export function SpeedometerGauge({ percentage, width = 300, height = 165, viewBox = "0 0 300 145", slots, target, className = "" }) {
  const stops = [{pos:0,col:[239,68,68]},{pos:0.25,col:[245,158,11]},{pos:0.5,col:[16,185,129]},{pos:0.75,col:[16,185,129]},{pos:1.0,col:[59,130,246]}];
  const interpColor = (t) => { t = Math.max(0,Math.min(1,t)); for(let i=0;i<stops.length-1;i++){if(t>=stops[i].pos&&t<=stops[i+1].pos){const l=(t-stops[i].pos)/(stops[i+1].pos-stops[i].pos);const a=stops[i].col,b=stops[i+1].col;return `rgb(${Math.round(a[0]+(b[0]-a[0])*l)},${Math.round(a[1]+(b[1]-a[1])*l)},${Math.round(a[2]+(b[2]-a[2])*l)})`;}} return 'rgb(59,130,246)'; };
  const bands = [{min:0,max:0.2,label:'Short'},{min:0.2,max:0.3,label:'Tight'},{min:0.3,max:0.7,label:'Good'},{min:0.7,max:1,label:'Over'}];
  const fillFrac = Math.max(0, Math.min(1, (percentage - 50) / 100));
  const band = bands.find(z => fillFrac >= z.min && fillFrac < z.max) || bands[bands.length-1];
  const endCol = interpColor(fillFrac);

  // Parse viewBox to get dimensions
  const vb = viewBox.split(' ').map(Number);
  const vbW = vb[2], vbH = vb[3];
  const cx = vbW / 2, cy = vbH * 0.86, r = vbW * 0.283;
  const strokeW = Math.max(7, r * 0.16);
  const segs = Math.max(30, Math.round(r * 0.9));

  const arcPt = (f) => ({x: cx + r * Math.cos(Math.PI + f * Math.PI), y: cy + r * Math.sin(Math.PI + f * Math.PI)});
  const needlePt = arcPt(fillFrac);
  const needleStub = {x: cx + r*0.35*Math.cos(Math.PI+fillFrac*Math.PI), y: cy + r*0.35*Math.sin(Math.PI+fillFrac*Math.PI)};
  const trackStart = arcPt(0), trackEnd = arcPt(1);

  const arcs = [];
  const segCount = Math.round(fillFrac * segs);
  for(let i=0;i<segCount;i++){const t0=i/segs;const t1=Math.min((i+1.2)/segs,fillFrac);const a0=Math.PI+t0*Math.PI;const a1=Math.PI+t1*Math.PI;if(a1<=a0)continue;const p0=arcPt(t0),p1={x:cx+r*Math.cos(a1),y:cy+r*Math.sin(a1)};arcs.push(<path key={i} d={`M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r} ${r} 0 0 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`} fill="none" stroke={interpColor(t0)} strokeWidth={strokeW} strokeLinecap="round"/>);}

  const pillW = vbW * 0.37, pillH = vbH * 0.36, pillR = pillH * 0.23;
  const pctSize = vbH * 0.22, labelSize = vbH * 0.1, subSize = vbH * 0.09;

  return (
    <svg className={className} viewBox={viewBox} style={width ? {width, height} : undefined}>
      <path d={`M ${trackStart.x.toFixed(1)} ${trackStart.y.toFixed(1)} A ${r} ${r} 0 1 1 ${trackEnd.x.toFixed(1)} ${trackEnd.y.toFixed(1)}`} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW} strokeLinecap="round"/>
      {arcs}
      <line x1={cx} y1={cy} x2={needleStub.x.toFixed(1)} y2={needleStub.y.toFixed(1)} stroke="rgba(255,255,255,0.2)" strokeWidth={strokeW*0.12} strokeLinecap="round"/>
      <circle cx={needlePt.x.toFixed(1)} cy={needlePt.y.toFixed(1)} r={strokeW*0.45} fill={endCol} stroke="#0f172a" strokeWidth={strokeW*0.22} style={{filter:`drop-shadow(0 0 ${strokeW*0.6}px ${endCol})`}}/>
      <circle cx={cx} cy={cy} r={strokeW*0.3} fill="#1e293b" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeW*0.08}/>
      <rect x={cx-pillW/2} y={cy-pillH-strokeW*0.1} width={pillW} height={pillH} rx={pillR} fill="rgba(15,23,42,0.9)" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5"/>
      <text x={cx} y={cy-pillH*0.45} textAnchor="middle" fill="white" style={{fontFamily:"'Space Mono',monospace",fontSize:pctSize,fontWeight:700}}>{percentage}%</text>
      <text x={cx} y={cy-pillH*0.08} textAnchor="middle" fill={endCol} style={{fontFamily:"'Outfit',sans-serif",fontSize:labelSize,fontWeight:500}}>{band.label}</text>
      {slots !== undefined && target !== undefined && <text x={cx} y={cy+subSize*1.4} textAnchor="middle" fill="#475569" style={{fontSize:subSize}}>{slots} / {target} target</text>}
    </svg>
  );
}
