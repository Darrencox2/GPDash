'use client';
import { useState, useMemo } from 'react';
import { DAYS, STAFF_GROUPS, matchesStaffMember, toLocalIso, toHuddleDateStr } from '@/lib/data';
import { getCliniciansForDate, getClinicianLocationsForDate, getClinicianSessionLocations, LOCATION_COLOURS } from '@/lib/huddle';

const ROLE_COLOURS = {
  'GP Partner': 'bg-blue-50 border-blue-200 text-blue-800',
  'Associate Partner': 'bg-blue-50 border-blue-200 text-blue-800',
  'Salaried GP': 'bg-indigo-50 border-indigo-200 text-indigo-800',
  'Locum': 'bg-purple-50 border-purple-200 text-purple-800',
  'ANP': 'bg-emerald-50 border-emerald-200 text-emerald-800',
  'Paramedic Practitioner': 'bg-amber-50 border-amber-200 text-amber-800',
  'GP Registrar': 'bg-rose-50 border-rose-200 text-rose-800',
  'Pharmacist': 'bg-cyan-50 border-cyan-200 text-cyan-800',
  'Practice Nurse': 'bg-teal-50 border-teal-200 text-teal-800',
  'Nurse Associate': 'bg-teal-50 border-teal-200 text-teal-800',
  'HCA': 'bg-lime-50 border-lime-200 text-lime-800',
  'Medical Student': 'bg-rose-50 border-rose-200 text-rose-800',
};

function PersonCard({ person, status, reason, onDragStart, onHide, location, sessionLoc, getSiteCol }) {
  const isAbsent = status === 'absent';
  const isDayOff = status === 'dayoff';
  const displayName = person.title ? `${person.title} ${person.name}` : person.name;
  const roleColMap = { gp: '#3b82f6', nursing: '#10b981', allied: '#a855f7' };
  const roleCol = roleColMap[person.group] || '#64748b';
  const statusColour = isAbsent ? '#ef4444' : isDayOff ? '#f59e0b' : roleCol;
  const statusBg = isAbsent ? 'rgba(239,68,68,0.1)' : isDayOff ? 'rgba(251,191,36,0.06)' : `${roleCol}15`;
  const statusBorder = isAbsent ? 'rgba(239,68,68,0.2)' : isDayOff ? 'rgba(251,191,36,0.12)' : `${roleCol}25`;

  // Location markers
  const amLoc = sessionLoc?.am;
  const pmLoc = sessionLoc?.pm;
  // Site colours from room settings via prop
  const fallbackLoc = location;

  return (
    <div draggable onDragStart={(e) => { e.stopPropagation(); onDragStart?.(e); }}
      className="rounded-lg transition-all cursor-grab active:cursor-grabbing group relative"
      style={{ background: statusBg, border: `1px solid ${statusBorder}`, boxShadow: `inset 0 1px 0 ${statusBg}` }}>
      {onHide && (
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onHide(); }}
          className="opacity-0 group-hover:opacity-100 text-xs text-slate-500 hover:text-red-400 transition-opacity absolute top-1 right-1 z-10">✕</button>
      )}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ width: 28, height: 28, background: statusColour, color: 'white', fontFamily: "'Space Mono', monospace", boxShadow: `0 0 8px ${statusColour}30` }}>
          {person.initials || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium leading-tight truncate ${isAbsent ? 'line-through text-slate-500' : 'text-slate-200'}`}>{displayName}</div>
          <div className="text-xs leading-tight mt-0.5" style={{ color: isAbsent ? '#f87171' : isDayOff ? '#fbbf24' : '#64748b' }}>
            {reason || person.role || 'Staff'}
          </div>
        </div>
        {!isAbsent && !isDayOff && (amLoc || pmLoc || fallbackLoc) && (() => {
          const aLoc = amLoc || fallbackLoc;
          const pLoc = pmLoc || fallbackLoc;
          const aC = getSiteCol ? getSiteCol(aLoc) : '#64748b';
          const pC = getSiteCol ? getSiteCol(pLoc) : '#64748b';
          return (
            <div className="flex gap-px flex-shrink-0">
              <div className="rounded-l flex items-center justify-center text-[8px] font-bold text-white" style={{ width: 18, height: 20, background: aC }}>{aLoc?.charAt(0) || '?'}</div>
              <div className="rounded-r flex items-center justify-center text-[8px] font-bold text-white" style={{ width: 18, height: 20, background: pC }}>{pLoc?.charAt(0) || '?'}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function DropZone({ onDrop, children, isEmpty }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onDrop?.(e); }}
      className={`min-h-[40px] rounded-xl border-2 border-dashed p-1.5 transition-all ${dragOver ? 'border-indigo-400' : 'border-transparent'}`}
      style={{ background: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent' }}>
      {isEmpty && !dragOver && <div className="flex items-center justify-center py-2 text-xs text-slate-600">None</div>}
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

export default function WhosInOut({ data, saveData, huddleData, onNavigate, viewingDate: viewingDateProp }) {
  const getSiteCol = (name) => {
    if (!name) return '#64748b';
    const sites = data?.roomAllocation?.sites || [];
    const exact = sites.find(x => x.name === name);
    if (exact) return exact.colour || '#64748b';
    const lower = name.toLowerCase();
    const fuzzy = sites.find(x => x.name.toLowerCase().startsWith(lower) || lower.startsWith(x.name.toLowerCase()));
    return fuzzy?.colour || '#64748b';
  };
  const [showSettings, setShowSettings] = useState(false);
  const [showAbsent, setShowAbsent] = useState(false);
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);

  const vd = viewingDateProp || new Date();
  const dayIndex = vd.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
  const dateKey = toLocalIso(vd);
  const dayKey = `${dateKey}-${dayName}`;
  const isViewingToday = useMemo(() => { const n = new Date(); n.setHours(0,0,0,0); const v = new Date(vd); v.setHours(0,0,0,0); return v.getTime() === n.getTime(); }, [vd]);

  // Only show people who are visible, not left, not administrative
  const visibleStaff = allClinicians.filter(c => c.showWhosIn !== false && c.status !== 'left' && c.status !== 'administrative');
  const unconfirmedCount = allClinicians.filter(c => !c.confirmed).length;

  // ── Data sources (all hooks MUST be above any early return) ─────

  // 1. CSV: who has slots on viewed date specifically
  const viewingDateStr = toHuddleDateStr(vd);
  const todayCsvClinicians = useMemo(() => {
    if (!huddleData) return [];
    const displayDate = huddleData.dates?.includes(viewingDateStr) ? viewingDateStr : null;
    if (!displayDate) return [];
    return getCliniciansForDate(huddleData, displayDate);
  }, [huddleData, viewingDateStr]);

  const csvPresentIds = useMemo(() => {
    if (todayCsvClinicians.length === 0) return new Set();
    const matched = new Set();
    allClinicians.forEach(c => {
      if (todayCsvClinicians.some(csvName => matchesStaffMember(csvName, c))) matched.add(c.id);
    });
    return matched;
  }, [allClinicians, todayCsvClinicians]);

  const hasCSV = todayCsvClinicians.length > 0;

  // Location data for this date
  const csvLocationMap = useMemo(() => {
    if (!huddleData) return {};
    const displayDate = huddleData.dates?.includes(viewingDateStr) ? viewingDateStr : null;
    if (!displayDate) return {};
    return getClinicianLocationsForDate(huddleData, displayDate);
  }, [huddleData, viewingDateStr]);

  const csvSessionLocMap = useMemo(() => {
    if (!huddleData) return {};
    const displayDate = huddleData.dates?.includes(viewingDateStr) ? viewingDateStr : null;
    if (!displayDate) return {};
    return getClinicianSessionLocations(huddleData, displayDate);
  }, [huddleData, viewingDateStr]);

  // 2. Planned absences: who is on leave today?
  const absenceMap = useMemo(() => {
    const map = {};
    ensureArray(data.plannedAbsences).forEach(a => {
      if (dateKey >= a.startDate && dateKey <= a.endDate) {
        map[a.clinicianId] = a.reason || 'Leave';
      }
    });
    return map;
  }, [data.plannedAbsences, dateKey]);

  // 3. Manual overrides from drag-drop (only if user has dragged today)
  const manualOverride = data.dailyOverrides?.[dayKey];
  const manualPresent = manualOverride?.present ? new Set(ensureArray(manualOverride.present)) : null;

  // 4. Rota (fallback when no CSV)
  const rotaScheduled = ensureArray(data.weeklyRota?.[dayName]);

  // ── Categorise (mutually exclusive with early returns) ────────────
  const categories = useMemo(() => {
    const inPractice = [];
    const leaveAbsent = [];
    const dayOff = [];

    visibleStaff.forEach(person => {
      if (person.longTermAbsent || person.status === 'longTermAbsent') {
        leaveAbsent.push({ person, reason: 'Long-term absent' });
        return;
      }
      if (manualPresent !== null) {
        const isManualScheduled = ensureArray(manualOverride?.scheduled || []).includes(person.id);
        if (isManualScheduled && !manualPresent.has(person.id)) {
          leaveAbsent.push({ person, reason: absenceMap[person.id] || 'Absent' });
          return;
        }
        if (manualPresent.has(person.id)) {
          inPractice.push({ person });
          return;
        }
      }
      if (absenceMap[person.id]) {
        leaveAbsent.push({ person, reason: absenceMap[person.id] });
        return;
      }
      if (hasCSV && csvPresentIds.has(person.id)) {
        inPractice.push({ person });
        return;
      }
      if (!hasCSV && person.buddyCover && rotaScheduled.includes(person.id)) {
        inPractice.push({ person });
        return;
      }
      dayOff.push({ person });
    });

    return { inPractice, leaveAbsent, dayOff };
  }, [visibleStaff, csvPresentIds, absenceMap, manualPresent, manualOverride, hasCSV, rotaScheduled]);

  // Map person IDs to their CSV location
  const personLocationMap = useMemo(() => {
    const map = {};
    allClinicians.forEach(person => {
      Object.entries(csvLocationMap).forEach(([csvName, loc]) => {
        if (matchesStaffMember(csvName, person)) map[person.id] = loc;
      });
    });
    return map;
  }, [allClinicians, csvLocationMap]);

  const personSessionLocMap = useMemo(() => {
    const map = {};
    allClinicians.forEach(person => {
      Object.entries(csvSessionLocMap).forEach(([csvName, locs]) => {
        if (matchesStaffMember(csvName, person)) map[person.id] = locs;
      });
    });
    return map;
  }, [allClinicians, csvSessionLocMap]);

  // Group in-practice by staff group, sorted by location
  const LOCATION_SORT = { 'Winscombe': 0, 'Banwell': 1, 'Locking': 2 };
  const sortByLocation = (arr) => arr.sort((a, b) => {
    const la = LOCATION_SORT[personLocationMap[a.person.id]] ?? 9;
    const lb = LOCATION_SORT[personLocationMap[b.person.id]] ?? 9;
    return la - lb;
  });
  const gpTeam = sortByLocation(categories.inPractice.filter(e => e.person.group === 'gp'));
  const nursingTeam = sortByLocation(categories.inPractice.filter(e => e.person.group === 'nursing'));
  const othersTeam = sortByLocation(categories.inPractice.filter(e => e.person.group !== 'gp' && e.person.group !== 'nursing'));

  // ── NOW safe to early return ───────────────────────────────────────
  if (!DAYS.includes(dayName) || allClinicians.length === 0) return null;

  // ── Drag handlers ─────────────────────────────────────────────────
  const handleDragStart = (e, person) => {
    e.dataTransfer.setData('whosInPerson', JSON.stringify({ id: person.id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const moveToColumn = (personJson, targetColumn) => {
    try {
      const { id } = JSON.parse(personJson);
      if (typeof id !== 'number') return;
      const currentScheduled = manualOverride?.scheduled
        ? [...ensureArray(manualOverride.scheduled)]
        : [...rotaScheduled];
      const currentPresent = manualPresent
        ? [...manualPresent]
        : categories.inPractice.filter(e => typeof e.person.id === 'number').map(e => e.person.id);

      let newPresent, newScheduled;
      if (targetColumn === 'present') {
        newPresent = currentPresent.includes(id) ? currentPresent : [...currentPresent, id];
        newScheduled = currentScheduled.includes(id) ? currentScheduled : [...currentScheduled, id];
      } else if (targetColumn === 'absent') {
        newPresent = currentPresent.filter(cid => cid !== id);
        newScheduled = currentScheduled.includes(id) ? currentScheduled : [...currentScheduled, id];
      } else {
        newPresent = currentPresent.filter(cid => cid !== id);
        newScheduled = currentScheduled.filter(cid => cid !== id);
      }
      saveData({ ...data, dailyOverrides: { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: newScheduled } } });
    } catch (e) { console.error(e); }
  };

  const hidePerson = (id) => {
    const updated = allClinicians.map(c => c.id === id ? { ...c, showWhosIn: false } : c);
    saveData({ ...data, clinicians: updated }, false);
  };

  const showPerson = (id) => {
    const updated = allClinicians.map(c => c.id === id ? { ...c, showWhosIn: true } : c);
    saveData({ ...data, clinicians: updated }, false);
  };

  const hiddenPeople = allClinicians.filter(c => c.showWhosIn === false && c.status !== 'left' && c.status !== 'administrative');

  return (
    <div className="rounded-xl overflow-hidden glass" onDragOver={(e) => e.stopPropagation()} onDrop={(e) => e.stopPropagation()}>
      <div className="glass-header px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-medium text-slate-200">{isViewingToday ? "Who's in today" : `Who's in — ${vd.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}</span>
            <span className="text-xs text-slate-600">{categories.inPractice.length} in · {categories.leaveAbsent.length + categories.dayOff.length} off</span>
          </div>
          <button onClick={() => setShowSettings(true)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3" style={{background:'rgba(15,23,42,0.5)'}}>
        {/* Unconfirmed staff banner */}
        {unconfirmedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.15)'}}>
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-amber-400">{unconfirmedCount} unconfirmed from CSV</span>
            {onNavigate && (
              <button onClick={() => onNavigate('team-members')} className="ml-auto text-xs font-medium text-amber-300 hover:text-amber-100 underline">Review</button>
            )}
          </div>
        )}

        {/* ROLE SECTIONS */}
        {[
          { label: 'GPs', team: gpTeam, colour: '#3b82f6' },
          { label: 'Nurses & HCAs', team: nursingTeam, colour: '#10b981' },
          { label: 'Other practitioners', team: othersTeam, colour: '#a855f7' },
        ].filter(s => s.team.length > 0).map(section => (
          <div key={section.label}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <div className="w-1 h-3.5 rounded-full" style={{background:section.colour}} />
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{section.label} ({section.team.length})</span>
            </div>
            <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')} isEmpty={section.team.length === 0}>
              {section.team.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} getSiteCol={getSiteCol} />)}
            </DropZone>
          </div>
        ))}

        {/* LEAVE / ABSENT + DAY OFF — collapsible */}
        {(categories.leaveAbsent.length > 0 || categories.dayOff.length > 0) && (
          <div>
            <button onClick={() => setShowAbsent(!showAbsent)}
              className="flex items-center gap-2 w-full text-left py-1 group">
              <span className={`text-xs text-slate-500 transition-transform ${showAbsent ? 'rotate-90' : ''}`}>▶</span>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {categories.leaveAbsent.length > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />{categories.leaveAbsent.length} absent</span>}
                {categories.dayOff.length > 0 && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{background:'#f59e0b'}} />{categories.dayOff.length} day off</span>}
              </div>
            </button>
            {showAbsent && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {categories.leaveAbsent.map(e => <PersonCard key={e.person.id} person={e.person} status="absent" reason={e.reason} onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} getSiteCol={getSiteCol} />)}
                {categories.dayOff.map(e => <PersonCard key={e.person.id} person={e.person} status="dayoff" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} getSiteCol={getSiteCol} />)}
              </div>
            )}
          </div>
        )}

        {/* Location legend */}
        <div className="flex items-center justify-center gap-3 pt-2 text-xs">
          {[{l:'Winscombe',c:'#a855f7'},{l:'Banwell',c:'#10b981'},{l:'Locking',c:'#f97316'}].map(s => (
            <span key={s.l} className="flex items-center gap-1"><span className="rounded-sm flex items-center justify-center text-[8px] font-bold text-white" style={{width:14,height:14,background:s.c}}>{s.l.charAt(0)}</span><span className="text-slate-500">{s.l}</span></span>
          ))}
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">Left=AM Right=PM</span>
        </div>
      </div>

      {/* Right-side settings panel */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/20" onClick={() => setShowSettings(false)} />
          <div className="w-80 bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-slide-in-right">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <div className="text-sm font-semibold text-slate-900">Who's In Settings</div>
              <button onClick={() => setShowSettings(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {hiddenPeople.length > 0 && (
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-600 mb-2">Hidden People</div>
                  <p className="text-[13px] text-slate-400 mb-2">Click to restore.</p>
                  <div className="space-y-1">
                    {hiddenPeople.map(c => (
                      <button key={c.id} onClick={() => showPerson(c.id)}
                        className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors flex items-center justify-between">
                        <span>{c.name}</span><span className="text-xs text-slate-400">restore</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {Object.entries(STAFF_GROUPS).map(([groupKey, groupInfo]) => {
                const groupPeople = allClinicians.filter(c => c.group === groupKey && c.status !== 'left' && c.status !== 'administrative');
                if (groupPeople.length === 0) return null;
                return (
                  <div key={groupKey} className="px-4 py-3 border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-600 mb-2">{groupInfo.label}</div>
                    <div className="space-y-1">
                      {groupPeople.map(c => (
                        <button key={c.id} onClick={() => c.showWhosIn !== false ? hidePerson(c.id) : showPerson(c.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${c.showWhosIn !== false ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
                          <span>{c.name}</span><span className="text-xs opacity-60">{c.role}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
