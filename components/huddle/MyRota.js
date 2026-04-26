'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getHuddleCapacity, getDutyDoctor, getSiteColour } from '@/lib/huddle';
import { matchesStaffMember, DAYS, getWeekStart, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { predictDemand } from '@/lib/demandPredictor';

const GROUP_META = {
  gp: { label: 'Clinicians', bg: 'rgba(99,102,241,0.15)', tx: '#a5b4fc', dot: '#6366f1' },
  nursing: { label: 'Nursing', bg: 'rgba(16,185,129,0.15)', tx: '#6ee7b7', dot: '#10b981' },
  allied: { label: 'Allied Health', bg: 'rgba(168,85,247,0.15)', tx: '#c4b5fd', dot: '#8b5cf6' },
};

function LocSquare({ loc, size = 24, duty, colour }) {
  if (!loc) return <div style={{width:size,height:size,borderRadius:4,background:'#1e293b'}} />;
  return (
    <div style={{width:size,height:size,borderRadius:4,background:colour||'#475569',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
      <span style={{fontSize:size*0.45,fontWeight:700,color:'#fff'}}>{loc.charAt(0)}</span>
      {duty && <svg style={{position:'absolute',top:-2,right:-2,width:size*0.4,height:size*0.4}} viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>}
    </div>
  );
}

export default function MyRota({ data, huddleData, standalone, setActiveSection }) {
  const sites = data?.roomAllocation?.sites || [];
  const siteCol = (name) => getSiteColour(name, sites);
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

  // ═══ NEXT WORKING DAY CARD DATA ═══
  // Mirrors the Today page exactly: uses urgent slot filter for duty support detection
  const todayCardData = useMemo(() => {
    if (!selected || !huddleData) return null;
    const urgOv = hs?.savedSlotFilters?.urgent || null;

    const isWorkingDay = (dateStr) => {
      if (!huddleData.dates?.includes(dateStr)) return false;
      const cap = getHuddleCapacity(huddleData, dateStr, hs);
      if (!cap) return false;
      const am = cap.am?.byClinician?.find(c => matchesStaffMember(c.name, selected));
      const pm = cap.pm?.byClinician?.find(c => matchesStaffMember(c.name, selected));
      const inAm = am && (am.available > 0 || am.embargoed > 0 || am.booked > 0);
      const inPm = pm && (pm.available > 0 || pm.embargoed > 0 || pm.booked > 0);
      return inAm || inPm;
    };

    // Scan up to 14 days forward from today
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let targetDate = null;
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      const ds = toHuddleDateStr(d);
      if (isWorkingDay(ds)) { targetDate = d; break; }
    }
    if (!targetDate) return { noWorkingDay: true };

    const dateStr = toHuddleDateStr(targetDate);
    // Full capacity (for clinician location lookup)
    const fullCap = getHuddleCapacity(huddleData, dateStr, hs);
    // Urgent capacity (for duty doctor/support detection — same as Today page)
    const urgentCap = getHuddleCapacity(huddleData, dateStr, hs, urgOv);

    const compute = (session) => {
      // Use full capacity for selected clinician's location/presence
      const fullSession = fullCap[session];
      const me = fullSession?.byClinician?.find(c => matchesStaffMember(c.name, selected));
      const myIn = me && (me.available > 0 || me.embargoed > 0 || me.booked > 0);
      const myLoc = me?.location;

      // Duty detection from URGENT capacity (mirrors Today page)
      const urgentSession = urgentCap[session];
      const allClinicians = (urgentSession?.byClinician || [])
        .map(c => {
          const matched = clinicians.find(tc => matchesStaffMember(c.name, tc));
          return { ...c, displayName: matched?.name || c.name, role: matched?.role || '', initials: matched?.initials, title: matched?.title, group: matched?.group, total: (c.available || 0) + (c.embargoed || 0) + (c.booked || 0) };
        })
        .filter(c => c.total > 0);

      // Duty doctor — same call as Today page (uses dutySlots, not urgOv)
      const dd = hasDuty ? getDutyDoctor(huddleData, dateStr, session, dutySlots, clinicians) : null;
      let dutyDoc = null;
      if (dd) {
        const matchedDD = clinicians.find(c => matchesStaffMember(dd.name, c));
        const dutyInList = allClinicians.find(c => matchesStaffMember(c.name, matchedDD || { name: dd.name }));
        if (matchedDD) {
          dutyDoc = { name: matchedDD.name, initials: matchedDD.initials, title: matchedDD.title, group: matchedDD.group, location: dd.location };
        }
      }

      // Filter duty doctor out, then find duty support — exact same logic as Today page
      const cliniciansAfterDuty = dutyDoc ? allClinicians.filter(c => !matchesStaffMember(c.name, { name: dutyDoc.name, aliases: [] })) : allClinicians;
      const supportCandidates = cliniciansAfterDuty.filter(c => !c.displayName?.toLowerCase().includes('balson'));
      const sortedSupport = [...supportCandidates].sort((a, b) => b.total - a.total);
      const topSupport = sortedSupport[0] || null;
      const runnerUp = sortedSupport[1] || null;
      const dutySupportClin = topSupport && topSupport.total >= 5 && topSupport.total >= ((runnerUp?.total || 0) + 2) ? topSupport : null;

      let support = null;
      if (dutySupportClin) {
        support = { name: dutySupportClin.displayName, initials: dutySupportClin.initials, title: dutySupportClin.title, group: dutySupportClin.group, location: dutySupportClin.location };
      }

      const isMeDuty = !!(dutyDoc && matchesStaffMember(dutyDoc.name, selected));
      const isMeSupport = !!(support && matchesStaffMember(support.name, selected));

      return { myIn, myLoc, dutyDoc, support, isMeDuty, isMeSupport };
    };

    const isToday = targetDate.toDateString() === today.toDateString();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = targetDate.toDateString() === tomorrow.toDateString();

    return { am: compute('am'), pm: compute('pm'), date: targetDate, isToday, isTomorrow };
  }, [selected, huddleData, hs, dutySlots, hasDuty, clinicians]);

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
    for (let w = 0; w < 4; w++) {
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

  // ═══ Today card JSX ═══
  const todayCardJsx = (() => {
    if (!selected || !todayCardData) return null;
    if (todayCardData.noWorkingDay) {
      return (
        <div className="rounded-xl p-4 text-center" style={{background:'rgba(15,23,42,0.6)',border:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="text-xs text-slate-500">No working days found in the next 14 days</div>
        </div>
      );
    }
    const { am, pm, date, isToday, isTomorrow } = todayCardData;
    const dayLabel = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : `Next: ${date.toLocaleDateString('en-GB', { weekday: 'long' })}`;
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    const groupBg = (group) => group === 'gp' ? '#3b82f6' : group === 'nursing' ? '#10b981' : '#a855f7';

    const PersonRow = ({ icon, label, person }) => {
      if (!person) return null;
      return (
        <div className="flex items-center gap-2 text-xs">
          <span className="w-6 flex-shrink-0 text-slate-600 text-[10px] font-semibold uppercase tracking-wider">{label}</span>
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{fontFamily:"'Outfit',sans-serif",background:groupBg(person.group)}}>{person.initials}</span>
          <span className="text-slate-300 flex-1 truncate">{person.title ? `${person.title} ${person.name.split(',')[0]}` : person.name.split(',')[0]}</span>
        </div>
      );
    };

    const Session = ({ label, sess }) => {
      const myLocCol = sess.myLoc ? siteCol(sess.myLoc) : null;
      const isMeDuty = sess.isMeDuty;
      const isMeSupport = sess.isMeSupport;

      // Card background — red gradient if user is duty, blue if support, otherwise glass
      const cardStyle = isMeDuty
        ? { background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)', border: '1px solid rgba(255,255,255,0.1)' }
        : isMeSupport
        ? { background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)', border: '1px solid rgba(255,255,255,0.1)' }
        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' };

      const labelColour = (isMeDuty || isMeSupport) ? 'rgba(255,255,255,0.7)' : '#64748b';
      const initialsBg = (isMeDuty || isMeSupport) ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)';

      return (
        <div className="rounded-lg p-3 flex-1 min-w-0 relative overflow-hidden" style={cardStyle}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{color: labelColour}}>{label}</span>
            {isMeDuty && (
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
                <span className="text-[10px] font-bold text-white uppercase tracking-wider">Duty</span>
              </div>
            )}
            {isMeSupport && !isMeDuty && (
              <span className="text-[10px] font-bold text-white uppercase tracking-wider">Support</span>
            )}
          </div>

          <div className="flex items-end justify-between gap-3">
            {/* Location — predominant */}
            <div className="flex-1 min-w-0">
              {sess.myIn ? (
                <div className="font-heading font-semibold leading-tight truncate" style={{
                  fontSize: 24,
                  color: (isMeDuty || isMeSupport) ? 'white' : (myLocCol || '#e2e8f0')
                }}>{sess.myLoc}</div>
              ) : (
                <div className="text-sm" style={{color: (isMeDuty || isMeSupport) ? 'rgba(255,255,255,0.7)' : '#64748b'}}>Not in</div>
              )}
            </div>

            {/* Duty/support — compact, on the right (only show if it's NOT me) */}
            {(sess.dutyDoc || sess.support) && (
              <div className="flex flex-col gap-1 flex-shrink-0 items-end">
                {sess.dutyDoc && !isMeDuty && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{color: labelColour}}>Duty</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold leading-none" style={{fontFamily:"'Outfit',sans-serif",background: initialsBg,color: (isMeDuty || isMeSupport) ? 'white' : '#e2e8f0'}}>{sess.dutyDoc.initials}</span>
                  </div>
                )}
                {sess.support && !isMeSupport && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wider" style={{color: labelColour}}>Sup</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold leading-none" style={{fontFamily:"'Outfit',sans-serif",background: initialsBg,color: (isMeDuty || isMeSupport) ? 'white' : '#e2e8f0'}}>{sess.support.initials}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="rounded-xl overflow-hidden" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="px-4 py-2.5 flex items-center justify-between" style={{background:'rgba(15,23,42,0.85)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <div>
            <div className="font-heading text-sm font-medium text-slate-200">{dayLabel}</div>
            <div className="text-[11px] text-slate-600">{dateStr}</div>
          </div>
        </div>
        <div className="p-3 flex flex-col sm:flex-row gap-2">
          <Session label="Morning" sess={am} />
          <Session label="Afternoon" sess={pm} />
        </div>
      </div>
    );
  })();

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

      {/* Today card */}
      {todayCardJsx && <div className="px-6 pb-4">{todayCardJsx}</div>}

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
        {(data?.roomAllocation?.sites || []).map(s => <div key={s.name} className="flex items-center gap-1.5"><LocSquare loc={s.name} size={18} colour={siteCol(s.name)} /><span className="text-[11px] text-slate-500">{s.name}</span></div>)}
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
                      <LocSquare loc={dd.amIn ? dd.amLoc : null} size={30} duty={dd.amDuty} colour={dd.amLoc ? siteCol(dd.amLoc) : null} />
                      <LocSquare loc={dd.pmIn ? dd.pmLoc : null} size={30} duty={dd.pmDuty} colour={dd.pmLoc ? siteCol(dd.pmLoc) : null} />
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

      {/* Today card */}
      {todayCardJsx && <div className="px-4 pb-3">{todayCardJsx}</div>}

      {/* Key */}
      <div className="px-4 pb-3 flex gap-3 flex-wrap">
        {(data?.roomAllocation?.sites || []).map(s => <div key={s.name} className="flex items-center gap-1"><LocSquare loc={s.name} size={14} colour={siteCol(s.name)} /><span className="text-[9px] text-slate-500">{s.name}</span></div>)}
        {hasDuty && <div className="flex items-center gap-1"><svg width="10" height="10" viewBox="0 0 24 24" fill="#fbbf24" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg><span className="text-[9px] text-slate-500">Duty</span></div>}
      </div>

      {/* 2-week grid */}
      {twoWeeks.map((week, wi) => (
        <div key={wi} className="px-4 pb-4">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{wi === 0 ? 'This week' : wi === 1 ? 'Next week' : `In ${wi} weeks`}</div>
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
                        <LocSquare loc={dd.amIn ? dd.amLoc : null} size={32} duty={dd.amDuty} colour={dd.amLoc ? siteCol(dd.amLoc) : null} />
                      </div>
                      <div className="p-1.5 flex items-center justify-center">
                        <LocSquare loc={dd.pmIn ? dd.pmLoc : null} size={32} duty={dd.pmDuty} colour={dd.pmLoc ? siteCol(dd.pmLoc) : null} />
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
