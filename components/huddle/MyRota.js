'use client';
import { useState, useMemo, useEffect } from 'react';
import { getHuddleCapacity, getDutyDoctor, LOCATION_COLOURS } from '@/lib/huddle';
import { matchesStaffMember, DAYS, getWeekStart } from '@/lib/data';

export default function MyRota({ data, huddleData, setActiveSection }) {
  const clinicians = useMemo(() => {
    if (!data?.clinicians) return [];
    const list = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians);
    return list.filter(c => c.status !== 'left' && c.status !== 'administrative').sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.clinicians]);

  const [selectedId, setSelectedId] = useState(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));

  // Read hash on mount for direct links
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#rota-')) {
      const initials = hash.slice(6).toUpperCase();
      const match = clinicians.find(c => c.initials === initials);
      if (match) setSelectedId(match.id);
    }
  }, [clinicians]);

  // Default to first clinician
  useEffect(() => {
    if (!selectedId && clinicians.length > 0) setSelectedId(clinicians[0].id);
  }, [clinicians, selectedId]);

  const selected = clinicians.find(c => c.id === selectedId);
  const hs = data?.huddleSettings || {};
  const dutySlots = hs?.dutyDoctorSlot;
  const hasDuty = dutySlots && (!Array.isArray(dutySlots) || dutySlots.length > 0);

  const navigateWeek = (dir) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + dir * 7);
    setWeekStart(d);
  };

  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dateStr = `${String(d.getDate()).padStart(2, '0')}-${d.toLocaleString('en-GB', { month: 'short' })}-${d.getFullYear()}`;
      const isoKey = d.toISOString().split('T')[0];
      days.push({ date: d, dateStr, isoKey, dayName: DAYS[i], dayShort: DAYS[i].slice(0, 3), dayNum: d.getDate(), monthStr: d.toLocaleString('en-GB', { month: 'short' }) });
    }
    return days;
  }, [weekStart]);

  const weekData = useMemo(() => {
    if (!selected || !huddleData) return weekDays.map(() => null);
    return weekDays.map(day => {
      const hasData = huddleData.dates?.includes(day.dateStr);
      if (!hasData) return null;
      const cap = getHuddleCapacity(huddleData, day.dateStr, hs);
      const findMe = (session) => {
        const list = session?.byClinician || [];
        return list.find(c => matchesStaffMember(c.name, selected));
      };
      const amClin = findMe(cap.am);
      const pmClin = findMe(cap.pm);
      const amLoc = amClin?.location || null;
      const pmLoc = pmClin?.location || null;
      const amIn = amClin && (amClin.available + (amClin.embargoed || 0)) > 0;
      const pmIn = pmClin && (pmClin.available + (pmClin.embargoed || 0)) > 0;
      let amDuty = false, pmDuty = false;
      if (hasDuty) {
        const amDoc = getDutyDoctor(huddleData, day.dateStr, 'am', dutySlots);
        const pmDoc = getDutyDoctor(huddleData, day.dateStr, 'pm', dutySlots);
        if (amDoc && matchesStaffMember(amDoc.name, selected)) amDuty = true;
        if (pmDoc && matchesStaffMember(pmDoc.name, selected)) pmDuty = true;
      }
      return { amIn, pmIn, amLoc, pmLoc, amDuty, pmDuty };
    });
  }, [selected, huddleData, weekDays, hs, dutySlots, hasDuty]);

  const buddyCover = useMemo(() => {
    if (!selected || !data?.allocationHistory) return weekDays.map(() => []);
    return weekDays.map(day => {
      const dayName = day.dayName;
      const alloc = data.allocationHistory[day.isoKey];
      if (!alloc) return [];
      const covers = [];
      const grouped = {};
      Object.entries(alloc.allocations || {}).forEach(([absentId, buddyId]) => {
        if (parseInt(buddyId) === selected.id) {
          const c = clinicians.find(cl => cl.id === parseInt(absentId));
          if (c) covers.push({ ...c, reason: 'Leave' });
        }
      });
      Object.entries(alloc.dayOffAllocations || {}).forEach(([dayOffId, buddyId]) => {
        if (parseInt(buddyId) === selected.id) {
          const c = clinicians.find(cl => cl.id === parseInt(dayOffId));
          if (c) covers.push({ ...c, reason: 'Day off' });
        }
      });
      return covers;
    });
  }, [selected, data?.allocationHistory, weekDays, clinicians]);

  const weekLabel = `${weekDays[0].dayNum} ${weekDays[0].monthStr} – ${weekDays[4].dayNum} ${weekDays[4].monthStr} ${weekDays[4].date.getFullYear()}`;
  const directLink = selected ? `gpdash.net#rota-${selected.initials}` : '';
  const roleColour = selected?.group === 'gp' ? { bg: '#dbeafe', text: '#1d4ed8' } : selected?.group === 'nursing' ? { bg: '#d1fae5', text: '#047857' } : { bg: '#ede9fe', text: '#6d28d9' };

  const copyLink = () => {
    navigator.clipboard?.writeText(directLink);
  };

  const SessionCell = ({ isIn, location, isDuty, mobile }) => {
    if (!isIn) return (
      <div className={`${mobile ? '' : 'h-full'} rounded-lg flex items-center justify-center`} style={{ background: 'var(--color-background-secondary)', minHeight: mobile ? 36 : 44 }}>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>Not in</span>
      </div>
    );
    const lc = location ? LOCATION_COLOURS[location] : null;
    return (
      <div className={`${mobile ? '' : 'h-full'} rounded-lg overflow-hidden border flex flex-col`} style={{ borderColor: 'var(--color-border-tertiary)' }}>
        <div className="flex-1 flex items-center gap-1" style={{ padding: '6px 8px', minHeight: isDuty ? 0 : (mobile ? 22 : 28) }}>
          {isDuty && <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="none"><path d="M12 2L15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2z"/></svg>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#b45309' }}>Duty</span>
          </>}
        </div>
        {lc && <div style={{ height: mobile ? 14 : 16, background: lc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: mobile ? 8 : 9, fontWeight: 500, color: lc.text }}>{location}</div>}
      </div>
    );
  };

  const CoverRow = ({ covers, mobile }) => {
    if (!covers || covers.length === 0) return null;
    return (
      <div className="flex items-center gap-1.5 flex-wrap" style={{ padding: mobile ? '3px 0' : '2px 0' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>
        {covers.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 500, color: '#991b1b', flexShrink: 0 }}>{c.initials}</span>
            <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{c.name}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>· {c.reason}</span>
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {selected && <div className="flex-shrink-0" style={{ width: 44, height: 44, borderRadius: '50%', background: roleColour.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, color: roleColour.text }}>{selected.initials}</div>}
        <div className="flex-1 min-w-[120px]">
          <div className="text-base font-semibold text-slate-900">{selected?.name || 'Select a clinician'}</div>
          <div className="text-xs text-slate-500">{selected?.role}</div>
        </div>
        <select value={selectedId || ''} onChange={e => { setSelectedId(parseInt(e.target.value)); window.location.hash = `rota-${clinicians.find(c => c.id === parseInt(e.target.value))?.initials || ''}`; }}
          className="px-3 py-2 rounded-lg border border-slate-200 text-sm min-w-[180px]">
          {clinicians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Week nav */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigateWeek(-1)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">‹</button>
        <span className="flex-1 text-center text-sm font-medium text-slate-700">{weekLabel}</span>
        <button onClick={() => navigateWeek(1)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50">›</button>
      </div>

      {/* Direct link */}
      {selected && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--color-background-info)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
          <span className="text-xs flex-1" style={{ color: 'var(--color-text-info)' }}>Direct link: {directLink}</span>
          <button onClick={copyLink} className="text-xs px-2 py-0.5 rounded border border-blue-200 text-blue-600 hover:bg-blue-50">Copy</button>
        </div>
      )}

      {/* Desktop grid — hidden on mobile */}
      <div className="hidden sm:block">
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[80px_1fr_1fr] bg-slate-50 border-b border-slate-200">
            <div className="p-2" />
            <div className="p-2 text-center text-xs font-medium text-slate-500">AM</div>
            <div className="p-2 text-center text-xs font-medium text-slate-500">PM</div>
          </div>

          {weekDays.map((day, di) => {
            const wd = weekData[di];
            const covers = buddyCover[di];
            const isOff = wd && !wd.amIn && !wd.pmIn;
            const noData = !wd;
            const isToday = day.isoKey === new Date().toISOString().split('T')[0];

            return (
              <div key={di} className={`${di < 4 ? 'border-b border-slate-200' : ''}`} style={{ background: (isOff || noData) ? 'var(--color-background-secondary)' : undefined }}>
                <div className="grid grid-cols-[80px_1fr_1fr]">
                  <div className="p-3 border-r border-slate-100 flex flex-col justify-center" style={{ borderLeft: isToday ? '3px solid #10b981' : undefined }}>
                    <div className="text-sm font-medium" style={{ color: (isOff || noData) ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)' }}>{day.dayShort}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{day.dayNum} {day.monthStr}</div>
                  </div>
                  {(isOff || noData) ? (
                    <div className="col-span-2 flex items-center justify-center py-4">
                      <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{noData ? 'No CSV data' : 'Day off'}</span>
                    </div>
                  ) : (
                    <>
                      <div className="p-1.5"><SessionCell isIn={wd?.amIn} location={wd?.amLoc} isDuty={wd?.amDuty} /></div>
                      <div className="p-1.5"><SessionCell isIn={wd?.pmIn} location={wd?.pmLoc} isDuty={wd?.pmDuty} /></div>
                    </>
                  )}
                </div>
                {covers && covers.length > 0 && (
                  <div className="px-3 pb-2" style={{ marginLeft: 80 }}>
                    <CoverRow covers={covers} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile stacked cards — hidden on desktop */}
      <div className="sm:hidden space-y-2">
        {weekDays.map((day, di) => {
          const wd = weekData[di];
          const covers = buddyCover[di];
          const isOff = wd && !wd.amIn && !wd.pmIn;
          const noData = !wd;
          const isToday = day.isoKey === new Date().toISOString().split('T')[0];

          if (isOff || noData) {
            return (
              <div key={di} className="rounded-xl overflow-hidden" style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)' }}>
                <div className="p-3 text-center">
                  <span className="text-sm" style={{ color: 'var(--color-text-tertiary)' }}>{day.dayName} {day.dayNum} {day.monthStr} · {noData ? 'No data' : 'Day off'}</span>
                </div>
              </div>
            );
          }

          return (
            <div key={di} className="rounded-xl overflow-hidden" style={{ border: `0.5px solid ${isToday ? '#10b981' : 'var(--color-border-tertiary)'}` }}>
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ background: 'var(--color-background-secondary)', borderColor: 'var(--color-border-tertiary)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{day.dayName} {day.dayNum} {day.monthStr}</span>
                {isToday && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Today</span>}
              </div>
              <div className="grid grid-cols-2 gap-2 p-2">
                <div>
                  <div className="text-center text-[10px] text-slate-400 mb-1">AM</div>
                  <SessionCell isIn={wd?.amIn} location={wd?.amLoc} isDuty={wd?.amDuty} mobile />
                </div>
                <div>
                  <div className="text-center text-[10px] text-slate-400 mb-1">PM</div>
                  <SessionCell isIn={wd?.pmIn} location={wd?.pmLoc} isDuty={wd?.pmDuty} mobile />
                </div>
              </div>
              {covers && covers.length > 0 && (
                <div className="px-3 pb-2">
                  <CoverRow covers={covers} mobile />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
