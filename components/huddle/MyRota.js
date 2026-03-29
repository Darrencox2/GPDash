'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { getHuddleCapacity, getDutyDoctor, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, DAYS, getWeekStart } from '@/lib/data';

const ROLE_COLOURS = {
  gp: { bg: '#dbeafe', text: '#1d4ed8', ring: '#bfdbfe' },
  nursing: { bg: '#d1fae5', text: '#047857', ring: '#a7f3d0' },
  allied: { bg: '#ede9fe', text: '#6d28d9', ring: '#ddd6fe' },
};

export default function MyRota({ data, huddleData, setActiveSection }) {
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative').sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.clinicians]);

  const [selectedId, setSelectedId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#rota-')) {
      const initials = hash.slice(6).toUpperCase();
      const match = clinicians.find(c => c.initials === initials);
      if (match) setSelectedId(match.id);
    }
  }, [clinicians]);

  useEffect(() => {
    if (!selectedId && clinicians.length > 0) setSelectedId(clinicians[0].id);
  }, [clinicians, selectedId]);

  useEffect(() => {
    const handler = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectClinician = (c) => {
    setSelectedId(c.id);
    setSearch('');
    setShowDropdown(false);
    window.location.hash = `rota-${c.initials}`;
  };

  const selected = clinicians.find(c => c.id === selectedId);
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);
  const rc = selected ? (ROLE_COLOURS[selected.group] || ROLE_COLOURS.allied) : ROLE_COLOURS.allied;

  const navigateWeek = (dir) => { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(d); };
  const goThisWeek = () => setWeekStart(getWeekStart(new Date()));

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-GB', { month: 'short' })}-${d.getFullYear()}`;
      days.push({ date: d, dateStr, isoKey: d.toISOString().split('T')[0], dayName: DAYS[i], dayShort: DAYS[i].slice(0, 3), dayNum: d.getDate(), monthStr: d.toLocaleString('en-GB', { month: 'short' }) });
    }
    return days;
  }, [weekStart]);

  const weekData = useMemo(() => {
    if (!selected || !huddleData) return weekDays.map(() => null);
    return weekDays.map(day => {
      if (!huddleData.dates?.includes(day.dateStr)) return null;
      const cap = getHuddleCapacity(huddleData, day.dateStr, hs);
      const findMe = (sess) => (sess?.byClinician || []).find(c => matchesStaffMember(c.name, selected));
      const am = findMe(cap.am), pm = findMe(cap.pm);
      const amIn = am && (am.available + (am.embargoed || 0)) > 0;
      const pmIn = pm && (pm.available + (pm.embargoed || 0)) > 0;
      let amDuty = false, pmDuty = false;
      if (hasDuty) {
        const ad = getDutyDoctor(huddleData, day.dateStr, 'am', dutySlots);
        const pd = getDutyDoctor(huddleData, day.dateStr, 'pm', dutySlots);
        if (ad && matchesStaffMember(ad.name, selected)) amDuty = true;
        if (pd && matchesStaffMember(pd.name, selected)) pmDuty = true;
      }
      return { amIn, pmIn, amLoc: am?.location, pmLoc: pm?.location, amDuty, pmDuty };
    });
  }, [selected, huddleData, weekDays, hs, dutySlots, hasDuty]);

  const buddyCover = useMemo(() => {
    if (!selected || !data?.allocationHistory) return weekDays.map(() => []);
    return weekDays.map(day => {
      const alloc = data.allocationHistory[day.isoKey];
      if (!alloc) return [];
      const covers = [];
      Object.entries(alloc.allocations || {}).forEach(([absentId, buddyId]) => {
        if (parseInt(buddyId) === selected.id) { const c = clinicians.find(cl => cl.id === parseInt(absentId)); if (c) covers.push({ ...c, reason: 'Leave' }); }
      });
      Object.entries(alloc.dayOffAllocations || {}).forEach(([dayOffId, buddyId]) => {
        if (parseInt(buddyId) === selected.id) { const c = clinicians.find(cl => cl.id === parseInt(dayOffId)); if (c) covers.push({ ...c, reason: 'Day off' }); }
      });
      return covers;
    });
  }, [selected, data?.allocationHistory, weekDays, clinicians]);

  const weekLabel = `${weekDays[0].dayNum} ${weekDays[0].monthStr} – ${weekDays[4].dayNum} ${weekDays[4].monthStr} ${weekDays[4].date.getFullYear()}`;
  const directLink = selected ? `gpdash.net#rota-${selected.initials}` : '';
  const thisWeekStart = getWeekStart(new Date());
  const isThisWeek = weekStart.getTime() === thisWeekStart.getTime();
  const todayIso = new Date().toISOString().split('T')[0];
  const filtered = search ? clinicians.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.initials.toLowerCase().includes(search.toLowerCase()) || (c.role || '').toLowerCase().includes(search.toLowerCase())) : clinicians;

  const SessionCell = ({ isIn, location, isDuty, mobile }) => {
    if (!isIn) return <div className="rounded-lg flex items-center justify-center bg-slate-50" style={{ minHeight: mobile ? 36 : 48 }}><span className="text-xs text-slate-300">—</span></div>;
    const lc = location ? LOCATION_COLOURS[location] : null;
    return (
      <div className="rounded-lg overflow-hidden border border-slate-200 flex flex-col" style={{ minHeight: mobile ? 36 : 48 }}>
        <div className="flex-1 flex items-center gap-1 px-2">
          {isDuty && <><svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg><span className="text-[11px] font-semibold text-amber-700">Duty</span></>}
        </div>
        {lc && <div style={{ height: mobile ? 14 : 16, background: lc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: mobile ? 8 : 9, fontWeight: 600, color: lc.text }}>{location}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Page header */}
      <div className="card overflow-visible">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-5 py-3 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          <span className="text-sm font-semibold text-white">My Rota</span>
        </div>
        <div className="p-4">
          {/* Search bar */}
          <div className="relative mb-4" ref={searchRef}>
            <div className="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all bg-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)} placeholder="Search by name, initials, or role..."
                className="flex-1 text-sm text-slate-900 placeholder-slate-400 outline-none bg-transparent" />
              {selected && !search && (
                <div className="flex items-center gap-2 px-2 py-1 rounded-md" style={{ background: rc.bg }}>
                  <span className="text-xs font-semibold" style={{ color: rc.text }}>{selected.initials}</span>
                  <span className="text-xs" style={{ color: rc.text }}>{selected.name}</span>
                </div>
              )}
            </div>
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-64 overflow-auto">
                {filtered.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">No matches</div>}
                {filtered.map(c => {
                  const crc = ROLE_COLOURS[c.group] || ROLE_COLOURS.allied;
                  return (
                    <button key={c.id} onClick={() => selectClinician(c)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors ${c.id === selectedId ? 'bg-indigo-50' : ''}`}>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ background: crc.bg, color: crc.text }}>{c.initials}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.role}</div>
                      </div>
                      {c.id === selectedId && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected clinician + week nav */}
          {selected && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0" style={{ background: rc.bg, color: rc.text, border: `2px solid ${rc.ring}` }}>{selected.initials}</div>
              <div className="flex-1 min-w-[120px]">
                <div className="text-base font-semibold text-slate-900">{selected.name}</div>
                <div className="text-xs text-slate-500">{selected.role}{selected.sessions ? ` · ${selected.sessions} sessions` : ''}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => navigateWeek(-1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <div className="text-center" style={{ width: 150 }}>
                  <div className="text-sm font-medium text-slate-800">{weekLabel}</div>
                  {!isThisWeek && <button onClick={goThisWeek} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium">This week</button>}
                </div>
                <button onClick={() => navigateWeek(1)} className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Direct link */}
      {selected && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <span className="text-xs text-indigo-600 flex-1 font-medium">{directLink}</span>
          <button onClick={() => navigator.clipboard?.writeText(directLink)} className="text-xs px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-medium transition-colors">Copy link</button>
        </div>
      )}

      {/* Desktop week grid */}
      {selected && (
        <div className="card overflow-hidden hidden sm:block">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-2.5 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            <span className="text-sm font-semibold text-white">Week view</span>
          </div>
          <div className="border-b border-slate-200 grid grid-cols-[80px_1fr_1fr] bg-slate-50">
            <div className="p-2.5" />
            <div className="p-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">AM</div>
            <div className="p-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">PM</div>
          </div>
          {weekDays.map((day, di) => {
            const wd = weekData[di]; const covers = buddyCover[di];
            const isOff = wd && !wd.amIn && !wd.pmIn; const noData = !wd;
            const isToday = day.isoKey === todayIso;
            return (
              <div key={di} className={di < 4 ? 'border-b border-slate-100' : ''} style={{ background: (isOff || noData) ? '#fafafa' : 'white' }}>
                <div className="grid grid-cols-[80px_1fr_1fr]">
                  <div className="px-3 py-3 border-r border-slate-100 flex flex-col justify-center" style={{ borderLeft: isToday ? '3px solid #10b981' : '3px solid transparent' }}>
                    <div className={`text-sm font-semibold ${(isOff||noData) ? 'text-slate-300' : 'text-slate-800'}`}>{day.dayShort}</div>
                    <div className="text-[11px] text-slate-400">{day.dayNum} {day.monthStr}</div>
                  </div>
                  {(isOff || noData) ? (
                    <div className="col-span-2 flex items-center justify-center py-5">
                      <span className="text-sm text-slate-300">{noData ? 'No CSV data' : 'Not in'}</span>
                    </div>
                  ) : (
                    <><div className="p-2"><SessionCell isIn={wd?.amIn} location={wd?.amLoc} isDuty={wd?.amDuty} /></div>
                    <div className="p-2"><SessionCell isIn={wd?.pmIn} location={wd?.pmLoc} isDuty={wd?.pmDuty} /></div></>
                  )}
                </div>
                {covers.length > 0 && (
                  <div className="flex items-center gap-2 px-3 pb-2.5" style={{ marginLeft: 80 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                    {covers.map((c, i) => {
                      const crc = ROLE_COLOURS[c.group] || ROLE_COLOURS.allied;
                      return (
                        <span key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-100">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0" style={{ background: crc.bg, color: crc.text }}>{c.initials}</span>
                          <span className="text-xs text-slate-700">{c.name}</span>
                          <span className="text-[10px] text-slate-400">· {c.reason}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile stacked cards */}
      {selected && (
        <div className="sm:hidden space-y-2">
          {weekDays.map((day, di) => {
            const wd = weekData[di]; const covers = buddyCover[di];
            const isOff = wd && !wd.amIn && !wd.pmIn; const noData = !wd;
            const isToday = day.isoKey === todayIso;
            if (isOff || noData) return (
              <div key={di} className="card" style={{ background: '#fafafa' }}>
                <div className="px-4 py-3 text-center"><span className="text-sm text-slate-300">{day.dayName} {day.dayNum} {day.monthStr} · {noData ? 'No data' : 'Not in'}</span></div>
              </div>
            );
            return (
              <div key={di} className="card overflow-hidden" style={{ border: isToday ? '2px solid #10b981' : undefined }}>
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{day.dayName} {day.dayNum} {day.monthStr}</span>
                  {isToday && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Today</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <div><div className="text-center text-[10px] text-slate-400 font-medium mb-1">AM</div><SessionCell isIn={wd?.amIn} location={wd?.amLoc} isDuty={wd?.amDuty} mobile /></div>
                  <div><div className="text-center text-[10px] text-slate-400 font-medium mb-1">PM</div><SessionCell isIn={wd?.pmIn} location={wd?.pmLoc} isDuty={wd?.pmDuty} mobile /></div>
                </div>
                {covers.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap px-3 pb-2.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
                    {covers.map((c, i) => <span key={i} className="text-xs text-slate-600"><span className="font-medium">{c.name}</span> <span className="text-slate-400">· {c.reason}</span></span>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
