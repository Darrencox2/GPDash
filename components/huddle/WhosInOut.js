'use client';
import { useState, useMemo } from 'react';
import { DAYS, STAFF_GROUPS, matchesStaffMember, toLocalIso } from '@/lib/data';
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

function PersonCard({ person, status, reason, onDragStart, onHide, location, sessionLoc }) {
  const gc = {gp:{init:'#dbeafe',text:'#1d4ed8'},nursing:{init:'#d1fae5',text:'#047857'},allied:{init:'#ede9fe',text:'#6d28d9'},admin:{init:'#f1f5f9',text:'#64748b'}}[person.group]||{init:'#f1f5f9',text:'#64748b'};
  const colourClass = ROLE_COLOURS[person.role] || 'bg-slate-50 border-slate-200 text-slate-700';
  const isAbsent = status === 'absent';
  const displayName = person.title ? `${person.title} ${person.name}` : person.name;
  const locCol = location ? LOCATION_COLOURS[location] : null;
  return (
    <div draggable onDragStart={(e) => { e.stopPropagation(); onDragStart?.(e); }}
      className={`relative text-center rounded-lg border overflow-hidden transition-all cursor-grab active:cursor-grabbing group ${colourClass} ${isAbsent ? 'opacity-60' : ''}`}>
      {onHide && (
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onHide(); }}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-red-500 transition-opacity absolute top-1 right-1 z-10" title="Hide">✕</button>
      )}
      <div style={{ padding: '8px 6px 6px' }}>
        <div className="flex items-center justify-center mb-1">
          <div className="rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ width: 28, height: 28, background: isAbsent ? '#fee2e2' : gc.init, color: isAbsent ? '#991b1b' : gc.text }}>
            {person.initials || '?'}
          </div>
        </div>
        <div className={`text-xs font-semibold leading-tight ${isAbsent ? 'line-through text-slate-400' : 'text-slate-900'}`}>{displayName}</div>
        <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{person.role || 'Staff'}{reason ? ` · ${reason}` : ''}</div>
      </div>
      {!isAbsent && sessionLoc && (sessionLoc.am || sessionLoc.pm) ? (() => {
        const amLoc = sessionLoc.am;
        const pmLoc = sessionLoc.pm;
        const amC = amLoc ? LOCATION_COLOURS[amLoc] : null;
        const pmC = pmLoc ? LOCATION_COLOURS[pmLoc] : null;
        const isSplit = amLoc && pmLoc && amLoc !== pmLoc;
        const isHalfDay = (amLoc && !pmLoc) || (!amLoc && pmLoc);
        if (isSplit || isHalfDay) {
          return (
            <div className="flex">
              <div className="flex-1 text-center text-[10px] font-semibold py-0.5" style={{ background: amC?.bg || '#e2e8f0', color: amC?.text || '#94a3b8' }}>{amLoc ? amLoc.charAt(0) : '—'}</div>
              <div className="flex-1 text-center text-[10px] font-semibold py-0.5" style={{ background: pmC?.bg || '#e2e8f0', color: pmC?.text || '#94a3b8' }}>{pmLoc ? pmLoc.charAt(0) : '—'}</div>
            </div>
          );
        }
        if (amC) return <div className="text-center text-[11px] font-semibold py-0.5" style={{ background: amC.bg, color: amC.text }}>{amLoc}</div>;
        return null;
      })() : locCol && !isAbsent ? (
        <div className="text-center text-[11px] font-semibold py-0.5" style={{ background: locCol.bg, color: locCol.text }}>{location}</div>
      ) : null}
    </div>
  );
}

function DropZone({ onDrop, children, isEmpty }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
      onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onDrop?.(e); }}
      className={`min-h-[40px] rounded-xl border-2 border-dashed p-1.5 transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200'}`}>
      {isEmpty && !dragOver && <div className="flex items-center justify-center py-2 text-xs text-slate-400">None</div>}
      <div className="grid grid-cols-2 gap-1.5">{children}</div>
    </div>
  );
}

export default function WhosInOut({ data, saveData, huddleData, onNavigate, viewingDate: viewingDateProp }) {
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
  const viewingDateStr = `${String(vd.getDate()).padStart(2,'0')}-${vd.toLocaleString('en-GB',{month:'short'})}-${vd.getFullYear()}`;
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
    <div className="card overflow-hidden" onDragOver={(e) => e.stopPropagation()} onDrop={(e) => e.stopPropagation()}>
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">{isViewingToday ? "Who's In Today" : `Who's In — ${vd.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}</div>
            <div className="text-[10px] text-white/60">{hasCSV ? 'Based on report data' : 'Based on rota'} · Drag to move</div>
          </div>
          <button onClick={() => setShowSettings(true)}
            className="px-2.5 py-1 rounded text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">⚙ Settings</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Unconfirmed staff banner */}
        {unconfirmedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <span className="text-xs text-amber-800">{unconfirmedCount} unconfirmed staff member{unconfirmedCount > 1 ? 's' : ''} from CSV</span>
            {onNavigate && (
              <button onClick={() => onNavigate('team-members')} className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 underline">Review in Staff Register</button>
            )}
          </div>
        )}

        {/* IN PRACTICE — 3 columns by staff group */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-xs font-semibold text-slate-700">In Practice ({categories.inPractice.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Clinicians ({gpTeam.length})</div>
              <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')} isEmpty={gpTeam.length === 0}>
                {gpTeam.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} />)}
              </DropZone>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nursing ({nursingTeam.length})</div>
              <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')} isEmpty={nursingTeam.length === 0}>
                {nursingTeam.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} />)}
              </DropZone>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Others ({othersTeam.length})</div>
              <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')} isEmpty={othersTeam.length === 0}>
                {othersTeam.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} />)}
              </DropZone>
            </div>
          </div>
        </div>

        {/* LEAVE / ABSENT + DAY OFF — collapsible */}
        {(categories.leaveAbsent.length > 0 || categories.dayOff.length > 0) && (
          <div>
            <button onClick={() => setShowAbsent(!showAbsent)}
              className="flex items-center gap-2 w-full text-left py-1.5 group">
              <span className={`text-[10px] text-slate-400 transition-transform ${showAbsent ? 'rotate-90' : ''}`}>▶</span>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {categories.leaveAbsent.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                    {categories.leaveAbsent.length} absent
                  </span>
                )}
                {categories.dayOff.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                    {categories.dayOff.length} day off
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">{showAbsent ? 'hide' : 'show'}</span>
            </button>
            {showAbsent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-xs font-semibold text-slate-700">Leave / Absent ({categories.leaveAbsent.length})</span>
                  </div>
                  <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'absent')} isEmpty={categories.leaveAbsent.length === 0}>
                    {categories.leaveAbsent.map(e => <PersonCard key={e.person.id} person={e.person} status="absent" reason={e.reason} onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} />)}
                  </DropZone>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full bg-slate-300" />
                    <span className="text-xs font-semibold text-slate-700">Day Off ({categories.dayOff.length})</span>
                  </div>
                  <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'dayoff')} isEmpty={categories.dayOff.length === 0}>
                    {categories.dayOff.map(e => <PersonCard key={e.person.id} person={e.person} status="dayoff" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} location={personLocationMap[e.person.id]} sessionLoc={personSessionLocMap[e.person.id]} />)}
                  </DropZone>
                </div>
              </div>
            )}
          </div>
        )}
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
                  <p className="text-[11px] text-slate-400 mb-2">Click to restore.</p>
                  <div className="space-y-1">
                    {hiddenPeople.map(c => (
                      <button key={c.id} onClick={() => showPerson(c.id)}
                        className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors flex items-center justify-between">
                        <span>{c.name}</span><span className="text-[10px] text-slate-400">restore</span>
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
                          <span>{c.name}</span><span className="text-[10px] opacity-60">{c.role}</span>
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
