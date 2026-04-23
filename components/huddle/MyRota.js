'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getHuddleCapacity, getDutyDoctor, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, DAYS, getWeekStart, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';

const GROUP_META = {
  gp: { label: 'Clinicians', bg: 'rgba(99,102,241,0.15)', tx: '#a5b4fc', dot: '#6366f1' },
  nursing: { label: 'Nursing', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7', dot: '#10b981' },
  allied: { label: 'Allied Health', bg: 'rgba(168,85,247,0.15)', tx: '#c4b5fd', dot: '#8b5cf6' },
};

function LocSquare({ loc, size = 24, duty }) {
  const lc = loc ? LOCATION_COLOURS[loc] : null;
  if (!loc) return <div style={{width:size,height:size,borderRadius:4,background:'#1e293b'}} />;
  return (
    <div style={{width:size,height:size,borderRadius:4,background:lc?.bg||'#475569',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
      <span style={{fontSize:size*0.45,fontWeight:700,color:lc?.text||'#fff'}}>{loc.charAt(0)}</span>
      {duty && <svg style={{position:'absolute',top:-2,right:-2,width:size*0.4,height:size*0.4}} viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>}
    </div>
  );
}

export default function MyRota({ data, huddleData, standalone, setActiveSection }) {
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative').sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.clinicians]);

  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [isMobile, setIsMobile] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (clinicians.length === 0) return;
    const hash = window.location.hash;
    if (hash.startsWith('#rota-')) {
      const init = hash.slice(6).toUpperCase();
      const m = clinicians.find(c => c.initials === init);
      if (m) { setSelectedId(m.id); return; }
    }
    if (!selectedId) setSelectedId(clinicians[0].id);
  }, [clinicians]);

  const select = c => { setSelectedId(c.id); setSearch(''); setShowDropdown(false); setIsSearching(false); window.location.hash = `rota-${c.initials}`; };
  const selected = clinicians.find(c => c.id === selectedId);
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const gm = selected ? GROUP_META[selected.group] || GROUP_META.allied : GROUP_META.allied;
  const todayIso = toLocalIso(new Date());

  const filtered = search ? clinicians.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.initials.toLowerCase().includes(search.toLowerCase())) : [];

  // Get day data for a clinician on a specific date
  const getDayData = (dateObj, dateStr, isoKey) => {
    if (!selected || !huddleData) return null;
    const pred = predictDemand(dateObj, null);
    if (pred?.isBankHoliday) return { isBH: true };
    if (!huddleData.dates?.includes(dateStr)) return null;
    const cap = getHuddleCapacity(huddleData, dateStr, hs);
    if (!cap) return null;
    const am = cap.am?.byClinician?.find(c => matchesStaffMember(c.name, selected));
    const pm = cap.pm?.byClinician?.find(c => matchesStaffMember(c.name, selected));
    const amIn = am && (am.available > 0 || am.embargoed > 0 || am.booked > 0);
    const pmIn = pm && (pm.available > 0 || pm.embargoed > 0 || pm.booked > 0);
    const amDuty = hasDuty ? getDutyDoctor(huddleData, dateStr, 'am', dutySlots, clinicians) : null;
    const pmDuty = hasDuty ? getDutyDoctor(huddleData, dateStr, 'pm', dutySlots, clinicians) : null;
    const absence = (data.plannedAbsences || []).find(a => a.clinicianId === selected.id && isoKey >= a.startDate && isoKey <= a.endDate);
    const alloc = data.allocationHistory?.[isoKey];
    const covers = [];
    if (alloc) {
      Object.entries(alloc.allocations || {}).forEach(([aid, bid]) => { if (parseInt(bid) === selected.id) { const c = clinicians.find(cl => cl.id === parseInt(aid)); if (c) covers.push({ ...c, coverType: 'fileAction' }); } });
      Object.entries(alloc.dayOffAllocations || {}).forEach(([did, bid]) => { if (parseInt(bid) === selected.id) { const c = clinicians.find(cl => cl.id === parseInt(did)); if (c) covers.push({ ...c, coverType: 'viewOnly' }); } });
    }
    return { amIn, pmIn, amLoc: am?.location, pmLoc: pm?.location, amDuty: amDuty && matchesStaffMember(amDuty.name, selected), pmDuty: pmDuty && matchesStaffMember(pmDuty.name, selected), absence: absence?.reason, covers };
  };

  // ═══ CALENDAR (Desktop) ═══
  const calDays = useMemo(() => {
    const year = calMonth.getFullYear(), month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    let startDow = firstDay.getDay(); if (startDow === 0) startDow = 7; // Mon=1
    const days = [];
    // Pad start
    for (let i = 1; i < startDow; i++) {
      const d = new Date(year, month, 1 - (startDow - i));
      days.push({ date: d, dayNum: d.getDate(), inMonth: false });
    }
    // Month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      days.push({ date: d, dayNum: i, inMonth: true });
    }
    // Pad end to complete final row
    while (days.length % 7 !== 0) {
      const d = new Date(year, month + 1, days.length - lastDay.getDate() - (startDow - 1) + 1);
      days.push({ date: d, dayNum: d.getDate(), inMonth: false });
    }
    return days;
  }, [calMonth]);

  const calLabel = calMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' });
  const navMonth = (dir) => { const d = new Date(calMonth); d.setMonth(d.getMonth() + dir); setCalMonth(d); };
  const goThisMonth = () => { const d = new Date(); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)); };
  const isThisMonth = calMonth.getMonth() === new Date().getMonth() && calMonth.getFullYear() === new Date().getFullYear();

  // ═══ 2-WEEK (Mobile) ═══
  const twoWeeks = useMemo(() => {
    const ws = getWeekStart(new Date());
    const weeks = [];
    for (let w = 0; w < 2; w++) {
      const weekDays = [];
      for (let d = 0; d < 5; d++) {
        const dt = new Date(ws); dt.setDate(dt.getDate() + w * 7 + d);
        const dateStr = toHuddleDateStr(dt);
        weekDays.push({ date: dt, dateStr, isoKey: toLocalIso(dt), dayName: DAYS[d], dayShort: DAYS[d].slice(0,3), dayNum: dt.getDate(), monthStr: dt.toLocaleString('en-GB',{month:'short'}) });
      }
      weeks.push(weekDays);
    }
    return weeks;
  }, []);

  // ═══ Search bar JSX (not a component — avoids remount on every keystroke) ═══
  const searchJsx = (
    <div className="relative">
      {!isSearching ? (
        <button onClick={() => { setIsSearching(true); setSearch(''); setShowDropdown(true); setTimeout(() => searchRef.current?.focus(), 50); }} className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left" style={{background:'#0f172a',border:'1px solid #334155'}}>
          {selected && <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0" style={{background: gm.bg, color: gm.tx}}>{selected.initials}</div>}
          <span className="text-sm text-slate-200 flex-1">{selected?.name || 'Select clinician...'}</span>
          <span className="text-xs text-slate-500">Change</span>
        </button>
      ) : (
        <div>
          <input type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
            placeholder="Type to search..."
            autoFocus
            className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
            style={{background:'#0f172a',border:'1px solid #6366f1',color:'#e2e8f0'}}
            ref={searchRef} />
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-30 max-h-64 overflow-y-auto" style={{background:'#1e293b',border:'1px solid #334155',boxShadow:'0 10px 30px rgba(0,0,0,0.4)'}}>
              {(search ? filtered : clinicians).map(c => (
                <button key={c.id} onClick={() => select(c)} className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors" style={{background: c.id === selectedId ? 'rgba(255,255,255,0.08)' : 'transparent'}}>
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold" style={{background: GROUP_META[c.group]?.bg, color: GROUP_META[c.group]?.tx}}>{c.initials}</span>
                  <span className="text-xs text-slate-200">{c.name}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">{c.role}</span>
                </button>
              ))}
              {search && filtered.length === 0 && <div className="px-3 py-3 text-xs text-slate-500 text-center">No matches</div>}
              <button onClick={() => { setIsSearching(false); setShowDropdown(false); }} className="w-full text-center py-2 text-[10px] text-slate-500 border-t border-slate-700">Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ═══ DESKTOP CALENDAR ═══
  const DesktopView = () => (
    <div className="flex flex-col gap-0" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', borderRadius: 16, overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif"}}>
      {/* Header */}
      <div className="p-6 pb-4">
        {searchJsx}
        {selected && <div className="text-sm text-slate-400 mt-3">{selected.role}{selected.sessions ? ` · ${selected.sessions} sessions/week` : ''}</div>}
      </div>

      {/* Month nav */}
      <div className="px-6 pb-4 flex items-center gap-3">
        <button onClick={() => navMonth(-1)} className="px-3 py-1.5 rounded-lg text-sm" style={{background:'#1e293b',border:'1px solid #334155',color:'#94a3b8',cursor:'pointer'}}>‹</button>
        <div className="flex-1 text-center">
          <span className="text-base font-semibold text-slate-200">{calLabel}</span>
          {!isThisMonth && <button onClick={goThisMonth} className="block mx-auto mt-1 text-[11px]" style={{color:'#818cf8',background:'none',border:'none',cursor:'pointer'}}>This month</button>}
        </div>
        <button onClick={() => navMonth(1)} className="px-3 py-1.5 rounded-lg text-sm" style={{background:'#1e293b',border:'1px solid #334155',color:'#94a3b8',cursor:'pointer'}}>›</button>
      </div>

      {/* Key */}
      <div className="px-6 pb-4 flex gap-4 flex-wrap">
        {Object.entries(LOCATION_COLOURS).map(([name, lc]) => <div key={name} className="flex items-center gap-1.5"><LocSquare loc={name} size={18} /><span className="text-[11px] text-slate-500">{name}</span></div>)}
        {hasDuty && <div className="flex items-center gap-1.5"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg><span className="text-[11px] text-slate-500">Duty</span></div>}
        <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{background:'#1e293b',border:'1px solid #f87171',color:'#f87171'}}>AB</div><span className="text-[11px] text-slate-500">File & action</span></div>
        <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{background:'#1e293b',border:'1px solid #60a5fa',color:'#60a5fa'}}>AB</div><span className="text-[11px] text-slate-500">View only</span></div>
      </div>

      {/* Calendar grid */}
      <div className="px-6 pb-6">
        <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden" style={{border:'1px solid #334155'}}>
          {/* Day headers */}
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider" style={{background:'#1e293b',color:'#64748b'}}>{d}</div>
          ))}
          {/* Day cells */}
          {calDays.map((day, i) => {
            const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;
            const isoKey = toLocalIso(day.date);
            const isToday = isoKey === todayIso;
            const dateStr = toHuddleDateStr(day.date);
            const dd = !isWeekend && day.inMonth ? getDayData(day.date, dateStr, isoKey) : null;

            return (
              <div key={i} style={{background: isToday ? 'rgba(16,185,129,0.08)' : '#0f172a', minHeight: 96, opacity: day.inMonth ? 1 : 0.3, padding: '6px 8px', borderTop: '1px solid #1e293b'}}>
                <div className="text-xs font-semibold mb-2" style={{color: isToday ? '#10b981' : isWeekend ? '#334155' : '#94a3b8'}}>{day.dayNum}</div>
                {isWeekend ? null : dd?.isBH ? (
                  <div className="text-[10px] font-medium text-amber-500">Bank hol</div>
                ) : dd?.absence && !dd?.amIn && !dd?.pmIn ? (
                  <div className="text-[10px] font-medium text-amber-400">{dd.absence}</div>
                ) : dd ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <LocSquare loc={dd.amIn ? dd.amLoc : null} size={30} duty={dd.amDuty} />
                      <LocSquare loc={dd.pmIn ? dd.pmLoc : null} size={30} duty={dd.pmDuty} />
                    </div>
                    {dd.covers.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {dd.covers.slice(0, 4).map((c, j) => {
                          const isFA = c.coverType === 'fileAction';
                          return <div key={j} className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold" style={{background:'#1e293b',border:`1.5px solid ${isFA ? '#f87171' : '#60a5fa'}`,color: isFA ? '#f87171' : '#60a5fa'}} title={`${c.name} — ${isFA ? 'File & action' : 'View only'}`}>{c.initials}</div>;
                        })}
                        {dd.covers.length > 4 && <span className="text-[8px] text-slate-600 self-center">+{dd.covers.length - 4}</span>}
                      </div>
                    )}
                  </div>
                ) : day.inMonth ? <div className="text-[9px] text-slate-700">No data</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ═══ MOBILE 2-WEEK ═══
  const MobileView = () => (
    <div className="flex flex-col gap-0" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)', borderRadius: 16, overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif"}}>
      {/* Search */}
      <div className="p-4 pb-2">
        {searchJsx}
        {selected && <div className="text-xs text-slate-400 mt-2">{selected.role}</div>}
      </div>

      {/* Key */}
      <div className="px-4 pb-3 flex gap-3 flex-wrap">
        {Object.entries(LOCATION_COLOURS).map(([name, lc]) => <div key={name} className="flex items-center gap-1"><LocSquare loc={name} size={14} /><span className="text-[9px] text-slate-500">{name}</span></div>)}
        {hasDuty && <div className="flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg><span className="text-[9px] text-slate-500">Duty</span></div>}
      </div>

      {/* 2-week grid */}
      {twoWeeks.map((week, wi) => (
        <div key={wi} className="px-4 pb-4">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{wi === 0 ? 'This week' : 'Next week'}</div>
          <div className="rounded-xl overflow-hidden" style={{border:'1px solid #334155'}}>
            <div className="grid" style={{gridTemplateColumns:'80px 1fr 1fr',background:'#1e293b',borderBottom:'1px solid #334155'}}>
              <div className="py-2 px-3"/>
              <div className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">AM</div>
              <div className="py-2 text-center text-[10px] font-semibold text-slate-500 uppercase">PM</div>
            </div>
            {week.map((day, di) => {
              const dd = getDayData(day.date, day.dateStr, day.isoKey);
              const isToday = day.isoKey === todayIso;
              const isOff = dd && !dd.amIn && !dd.pmIn && !dd.isBH;
              const noData = !dd;
              const covers = dd?.covers || [];
              return (
                <div key={di} style={{borderBottom: di < 4 ? '1px solid #334155' : 'none', background:'#0f172a'}}>
                  <div className="grid" style={{gridTemplateColumns:'80px 1fr 1fr'}}>
                    <div className="py-2.5 px-3 flex flex-col justify-center" style={{borderRight:'1px solid #1e293b', borderLeft: isToday ? '3px solid #10b981' : '3px solid transparent'}}>
                      <div className="text-sm font-semibold" style={{color: (isOff || noData || dd?.isBH) ? '#334155' : '#e2e8f0'}}>{day.dayShort}</div>
                      <div className="text-[10px] text-slate-600">{day.dayNum} {day.monthStr}</div>
                    </div>
                    {dd?.isBH ? (
                      <div className="col-span-2 py-3 px-4 flex items-center"><span className="text-xs font-medium text-amber-400">Bank holiday</span></div>
                    ) : (isOff || noData) ? (
                      <div className="col-span-2 py-3 px-4 flex items-center"><span className="text-xs text-slate-600">{dd?.absence || 'Not in'}</span></div>
                    ) : dd ? (<>
                      <div className="p-1.5 flex items-center justify-center">
                        <LocSquare loc={dd.amIn ? dd.amLoc : null} size={32} duty={dd.amDuty} />
                      </div>
                      <div className="p-1.5 flex items-center justify-center">
                        <LocSquare loc={dd.pmIn ? dd.pmLoc : null} size={32} duty={dd.pmDuty} />
                      </div>
                    </>) : null}
                  </div>
                  {covers.length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 pb-2" style={{marginLeft:80}}>
                      <span className="text-[9px] text-slate-600">Covering:</span>
                      {covers.map((c, j) => { const isFA = c.coverType === 'fileAction'; return <div key={j} className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{background:'#1e293b',border:`1.5px solid ${isFA ? '#f87171' : '#60a5fa'}`,color: isFA ? '#f87171' : '#60a5fa'}} title={`${c.name} — ${isFA ? 'File & action' : 'View only'}`}>{c.initials}</div>; })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const content = isMobile ? <MobileView /> : <DesktopView />;

  if (standalone) return content;
  return <div className="mx-auto" style={{maxWidth: isMobile ? 480 : 960}}>{content}</div>;
}
