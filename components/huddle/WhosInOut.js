'use client';
import { useState, useMemo } from 'react';
import { DAYS, STAFF_GROUPS, matchesStaffMember } from '@/lib/data';

const ROLE_COLOURS = {
  'GP Partner': 'bg-blue-50 border-blue-200 text-blue-800',
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

function PersonCard({ person, status, reason, onDragStart, onHide }) {
  const colourClass = ROLE_COLOURS[person.role] || 'bg-slate-50 border-slate-200 text-slate-700';
  const statusDot = status === 'present' ? 'bg-emerald-400' : status === 'absent' ? 'bg-red-400' : 'bg-slate-300';
  return (
    <div draggable onDragStart={(e) => { e.stopPropagation(); onDragStart?.(e); }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing group ${colourClass}`}>
      <div className="relative flex-shrink-0">
        <svg className="w-5 h-5 opacity-50" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
        </svg>
        <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${statusDot}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{person.name}</div>
        <div className="text-[10px] opacity-60 truncate">{person.role || 'Staff'}{reason ? ` — ${reason}` : ''}</div>
      </div>
      {onHide && (
        <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); onHide(); }}
          className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-red-500 transition-opacity flex-shrink-0" title="Hide">✕</button>
      )}
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

export default function WhosInOut({ data, saveData, huddleData }) {
  const [showSettings, setShowSettings] = useState(false);
  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const allClinicians = ensureArray(data?.clinicians);

  const today = new Date();
  const dayIndex = today.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
  const dateKey = today.toISOString().split('T')[0];
  const dayKey = `${dateKey}-${dayName}`;

  if (!DAYS.includes(dayName) || allClinicians.length === 0) return null;

  // Only show people who are visible, not left, not administrative
  const visibleStaff = allClinicians.filter(c => c.showWhosIn !== false && c.status !== 'left' && c.status !== 'administrative');

  // ── Data sources ──────────────────────────────────────────────────

  // 1. CSV: who has slots today?
  const csvPresentIds = useMemo(() => {
    if (!huddleData?.clinicians) return new Set();
    const matched = new Set();
    allClinicians.forEach(c => {
      if (huddleData.clinicians.some(csvName => matchesStaffMember(csvName, c))) matched.add(c.id);
    });
    return matched;
  }, [allClinicians, huddleData?.clinicians]);

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

  // ── Categorise (mutually exclusive) ───────────────────────────────
  // Priority: 1) LTA → absent, 2) Manual override, 3) Planned absence → absent, 4) CSV presence → in practice, 5) Rota (if no CSV) → in practice, 6) Day off

  const hasCSV = huddleData?.clinicians?.length > 0;
  const rotaScheduled = ensureArray(data.weeklyRota?.[dayName]);

  const categories = useMemo(() => {
    const inPractice = [];
    const leaveAbsent = [];
    const dayOff = [];

    visibleStaff.forEach(person => {
      // LTA always goes to absent
      if (person.longTermAbsent || person.status === 'longTermAbsent') {
        leaveAbsent.push({ person, reason: 'Long-term absent' });
        return;
      }

      // If there's a manual override and this person was explicitly marked absent
      // (they're in the scheduled list but NOT in the present list)
      if (manualPresent !== null) {
        const isManualScheduled = ensureArray(manualOverride?.scheduled || []).includes(person.id);
        if (isManualScheduled && !manualPresent.has(person.id)) {
          leaveAbsent.push({ person, reason: absenceMap[person.id] || 'Absent (manual)' });
          return;
        }
        if (manualPresent.has(person.id)) {
          inPractice.push({ person });
          return;
        }
      }

      // Planned absence (TeamNet / manual absences)
      if (absenceMap[person.id]) {
        leaveAbsent.push({ person, reason: absenceMap[person.id] });
        return;
      }

      // CSV says they're working today
      if (hasCSV && csvPresentIds.has(person.id)) {
        inPractice.push({ person });
        return;
      }

      // No CSV uploaded: fall back to rota for buddy cover people
      if (!hasCSV && person.buddyCover && rotaScheduled.includes(person.id)) {
        inPractice.push({ person });
        return;
      }

      // Everyone else is day off
      dayOff.push({ person });
    });

    return { inPractice, leaveAbsent, dayOff };
  }, [visibleStaff, csvPresentIds, absenceMap, manualPresent, manualOverride, hasCSV, rotaScheduled]);

  // Group in-practice by staff group
  const gpTeam = categories.inPractice.filter(e => e.person.group === 'gp');
  const nursingTeam = categories.inPractice.filter(e => e.person.group === 'nursing');
  const othersTeam = categories.inPractice.filter(e => e.person.group !== 'gp' && e.person.group !== 'nursing');

  // ── Drag handlers ─────────────────────────────────────────────────
  const handleDragStart = (e, person) => {
    e.dataTransfer.setData('whosInPerson', JSON.stringify({ id: person.id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const moveToColumn = (personJson, targetColumn) => {
    try {
      const { id } = JSON.parse(personJson);
      if (typeof id !== 'number') return;

      // Build override: track who's present and who's scheduled
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
        // Day off: remove from both
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
            <div className="text-sm font-semibold text-white">Who's In Today</div>
            <div className="text-[10px] text-white/60">{hasCSV ? 'Based on uploaded report' : 'Based on rota'} · Drag to move</div>
          </div>
          <button onClick={() => setShowSettings(true)}
            className="px-2.5 py-1 rounded text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">⚙ Settings</button>
        </div>
      </div>

      <div className="p-4 space-y-4">
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
                {gpTeam.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} />)}
              </DropZone>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Nursing ({nursingTeam.length})</div>
              <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')} isEmpty={nursingTeam.length === 0}>
                {nursingTeam.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} />)}
              </DropZone>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Others ({othersTeam.length})</div>
              <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')} isEmpty={othersTeam.length === 0}>
                {othersTeam.map(e => <PersonCard key={e.person.id} person={e.person} status="present" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} />)}
              </DropZone>
            </div>
          </div>
        </div>

        {/* LEAVE / ABSENT + DAY OFF — 2 columns below */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs font-semibold text-slate-700">Leave / Absent ({categories.leaveAbsent.length})</span>
            </div>
            <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'absent')} isEmpty={categories.leaveAbsent.length === 0}>
              {categories.leaveAbsent.map(e => <PersonCard key={e.person.id} person={e.person} status="absent" reason={e.reason} onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} />)}
            </DropZone>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-xs font-semibold text-slate-700">Day Off ({categories.dayOff.length})</span>
            </div>
            <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'dayoff')} isEmpty={categories.dayOff.length === 0}>
              {categories.dayOff.map(e => <PersonCard key={e.person.id} person={e.person} status="dayoff" onDragStart={(ev) => handleDragStart(ev, e.person)} onHide={() => hidePerson(e.person.id)} />)}
            </DropZone>
          </div>
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
