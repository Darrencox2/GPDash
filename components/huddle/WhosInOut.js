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
  'HCA': 'bg-lime-50 border-lime-200 text-lime-800',
};

function PersonCard({ person, status, reason, onDragStart, onHide }) {
  const colourClass = ROLE_COLOURS[person.role] || 'bg-slate-50 border-slate-200 text-slate-700';
  const statusDot = status === 'present' ? 'bg-emerald-400' : status === 'absent' ? 'bg-red-400' : 'bg-slate-300';

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); onDragStart?.(e); }}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing group ${colourClass}`}
    >
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
          className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-400 hover:text-red-500 transition-opacity flex-shrink-0" title="Hide from this view">✕</button>
      )}
    </div>
  );
}

function DropColumn({ onDrop, children, label, dotColour, count }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <div className={`w-2 h-2 rounded-full ${dotColour}`} />
        <span className="text-xs font-semibold text-slate-700">{label} ({count})</span>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
        onDragLeave={(e) => { e.stopPropagation(); setDragOver(false); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); onDrop?.(e); }}
        className={`min-h-[80px] rounded-xl border-2 border-dashed p-2 transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200'}`}
      >
        {count === 0 && !dragOver && (
          <div className="flex items-center justify-center h-full py-4 text-xs text-slate-400">None</div>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          {children}
        </div>
      </div>
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

  // Staff who should appear: showWhosIn + active (not left)
  const visibleStaff = allClinicians.filter(c => c.showWhosIn !== false && c.status !== 'left');
  // Staff with buddy cover (for rota-based scheduling)
  const buddyStaff = allClinicians.filter(c => c.buddyCover);

  // Get scheduled IDs from rota (buddy cover people only)
  const scheduled = data.dailyOverrides?.[dayKey]?.scheduled
    ? ensureArray(data.dailyOverrides[dayKey].scheduled)
    : ensureArray(data.weeklyRota?.[dayName]);

  // Get present IDs
  const getPresent = () => {
    if (data.dailyOverrides?.[dayKey]?.present) return ensureArray(data.dailyOverrides[dayKey].present);
    const absences = ensureArray(data.plannedAbsences);
    return scheduled.filter(id => {
      const c = allClinicians.find(c => c.id === id);
      if (!c || c.longTermAbsent) return false;
      return !absences.some(a => a.clinicianId === id && dateKey >= a.startDate && dateKey <= a.endDate);
    });
  };

  const presentIds = getPresent();
  const absentIds = scheduled.filter(id => !presentIds.includes(id));

  // People who are in the CSV today (source of truth for non-rota staff)
  const csvPresentIds = useMemo(() => {
    if (!huddleData?.clinicians) return new Set();
    const matched = new Set();
    allClinicians.forEach(c => {
      const isInCsv = huddleData.clinicians.some(csvName => matchesStaffMember(csvName, c));
      if (isInCsv) matched.add(c.id);
    });
    return matched;
  }, [allClinicians, huddleData?.clinicians]);

  // Categorise visible staff
  const presentPeople = visibleStaff.filter(c => {
    if (c.longTermAbsent) return false;
    // Rota-based people: check rota
    if (scheduled.includes(c.id)) return presentIds.includes(c.id);
    // Non-rota people: check if in CSV
    if (csvPresentIds.has(c.id)) return true;
    return false;
  });

  const absentPeople = visibleStaff.filter(c => {
    if (c.longTermAbsent) return true;
    return absentIds.includes(c.id);
  });

  const dayOffPeople = visibleStaff.filter(c => {
    if (c.longTermAbsent) return false;
    if (scheduled.includes(c.id)) return false;
    if (absentIds.includes(c.id)) return false;
    if (csvPresentIds.has(c.id)) return false;
    return true;
  });

  const getAbsenceReason = (person) => {
    if (person.longTermAbsent) return 'Long-term absent';
    const absences = ensureArray(data.plannedAbsences);
    const absence = absences.find(a => a.clinicianId === person.id && dateKey >= a.startDate && dateKey <= a.endDate);
    return absence?.reason || 'Absent';
  };

  const handleDragStart = (e, person) => {
    e.dataTransfer.setData('whosInPerson', JSON.stringify({ id: person.id }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const moveToColumn = (personJson, targetColumn) => {
    try {
      const { id } = JSON.parse(personJson);
      if (typeof id !== 'number') return;
      const currentPresent = [...presentIds];
      const currentScheduled = [...scheduled];

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

  const hiddenPeople = allClinicians.filter(c => c.showWhosIn === false && c.status !== 'left');

  return (
    <div className="card overflow-hidden" onDragOver={(e) => e.stopPropagation()} onDrop={(e) => e.stopPropagation()}>
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Who's In Today</div>
            <div className="text-[10px] text-white/60">Drag to move between columns</div>
          </div>
          <button onClick={() => setShowSettings(true)}
            className="px-2.5 py-1 rounded text-[11px] font-medium text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            ⚙ Settings
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DropColumn label="In Practice" dotColour="bg-emerald-400" count={presentPeople.length}
            onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'present')}>
            {presentPeople.map(p => (
              <PersonCard key={p.id} person={p} status="present"
                onDragStart={(e) => handleDragStart(e, p)} onHide={() => hidePerson(p.id)} />
            ))}
          </DropColumn>

          <DropColumn label="Leave / Absent" dotColour="bg-red-400" count={absentPeople.length}
            onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'absent')}>
            {absentPeople.map(p => (
              <PersonCard key={p.id} person={p} status="absent" reason={getAbsenceReason(p)}
                onDragStart={(e) => handleDragStart(e, p)} onHide={() => hidePerson(p.id)} />
            ))}
          </DropColumn>

          <DropColumn label="Day Off" dotColour="bg-slate-300" count={dayOffPeople.length}
            onDrop={(e) => moveToColumn(e.dataTransfer.getData('whosInPerson'), 'dayoff')}>
            {dayOffPeople.map(p => (
              <PersonCard key={p.id} person={p} status="dayoff"
                onDragStart={(e) => handleDragStart(e, p)} onHide={() => hidePerson(p.id)} />
            ))}
          </DropColumn>
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
              {/* Hidden people */}
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="text-xs font-semibold text-slate-600 mb-2">Hidden People</div>
                <p className="text-[11px] text-slate-400 mb-2">These won't appear on Who's In. Click to restore.</p>
                {hiddenPeople.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">None hidden</div>
                ) : (
                  <div className="space-y-1">
                    {hiddenPeople.map(c => (
                      <button key={c.id} onClick={() => showPerson(c.id)}
                        className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-colors flex items-center justify-between">
                        <span>{c.name}</span>
                        <span className="text-[10px] text-slate-400">restore</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* All staff visibility by group */}
              {Object.entries(STAFF_GROUPS).map(([groupKey, groupInfo]) => {
                const groupPeople = allClinicians.filter(c => c.group === groupKey && c.status !== 'left');
                if (groupPeople.length === 0) return null;
                return (
                  <div key={groupKey} className="px-4 py-3 border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-600 mb-2">{groupInfo.label}</div>
                    <div className="space-y-1">
                      {groupPeople.map(c => (
                        <button key={c.id} onClick={() => c.showWhosIn !== false ? hidePerson(c.id) : showPerson(c.id)}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between ${c.showWhosIn !== false ? 'bg-slate-900 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>
                          <span>{c.name}</span>
                          <span className="text-[10px] opacity-60">{c.role}</span>
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
