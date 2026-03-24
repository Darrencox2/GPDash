'use client';
import { useState } from 'react';
import { DAYS } from '@/lib/data';

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
const DEFAULT_ROLE_COLOUR = 'bg-slate-50 border-slate-200 text-slate-700';

function getPersonColour(role) {
  return ROLE_COLOURS[role] || DEFAULT_ROLE_COLOUR;
}

function PersonIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
    </svg>
  );
}

function PersonCard({ clinician, status, reason, onDragStart, onDrop, draggable = false, dropTarget = false }) {
  const [dragOver, setDragOver] = useState(false);
  const colourClass = getPersonColour(clinician.role);
  const statusDot = status === 'present' ? 'bg-emerald-400' : status === 'absent' ? 'bg-red-400' : 'bg-slate-300';

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={dropTarget ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={dropTarget ? () => setDragOver(false) : undefined}
      onDrop={dropTarget ? (e) => { e.preventDefault(); setDragOver(false); onDrop?.(e); } : undefined}
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${colourClass} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragOver ? 'ring-2 ring-indigo-400 scale-105' : ''}`}
    >
      <div className="relative flex-shrink-0">
        <PersonIcon className="w-5 h-5 opacity-60" />
        <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white ${statusDot}`} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold truncate">{clinician.name}</div>
        <div className="text-[10px] opacity-70 truncate">{clinician.role}</div>
        {reason && <div className="text-[9px] opacity-60 truncate">{reason}</div>}
      </div>
    </div>
  );
}

function DropZone({ onDrop, children, label, colour = 'border-slate-200', isEmpty }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop?.(e); }}
      className={`min-h-[60px] rounded-xl border-2 border-dashed p-2 transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50/50 scale-[1.01]' : colour}`}
    >
      {isEmpty && !dragOver && (
        <div className="flex items-center justify-center h-full py-3 text-xs text-slate-400">{label}</div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}

export default function WhosInOut({ data, saveData }) {
  const [showSettings, setShowSettings] = useState(false);

  if (!data?.clinicians) return null;

  const ensureArray = (val) => { if (!val) return []; if (Array.isArray(val)) return val; return Object.values(val); };
  const clinicians = ensureArray(data.clinicians).filter(c => !c.longTermAbsent);
  const today = new Date();
  const dayIndex = today.getDay();
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
  const dateKey = today.toISOString().split('T')[0];
  const dayKey = `${dateKey}-${dayName}`;

  if (!DAYS.includes(dayName)) return null; // weekend

  // Get scheduled from rota or daily override
  const scheduled = data.dailyOverrides?.[dayKey]?.scheduled
    ? ensureArray(data.dailyOverrides[dayKey].scheduled)
    : ensureArray(data.weeklyRota?.[dayName]);

  // Get present from override or compute
  const getPresent = () => {
    if (data.dailyOverrides?.[dayKey]?.present) return ensureArray(data.dailyOverrides[dayKey].present);
    const absences = ensureArray(data.plannedAbsences);
    return scheduled.filter(id => {
      const c = clinicians.find(c => c.id === id);
      if (!c) return false;
      return !absences.some(a => a.clinicianId === id && dateKey >= a.startDate && dateKey <= a.endDate);
    });
  };

  const presentIds = getPresent();
  const absentIds = scheduled.filter(id => !presentIds.includes(id));
  const dayOffIds = clinicians.filter(c => !scheduled.includes(c.id)).map(c => c.id);

  // Settings: which clinicians to show in day-off column
  const showDayOff = data.huddleSettings?.showDayOffClinicians || {};
  const dayOffVisible = dayOffIds.filter(id => {
    const c = clinicians.find(c => c.id === id);
    if (!c) return false;
    // Default: show unless explicitly hidden
    return showDayOff[id] !== false;
  });

  // Get absence reasons
  const getAbsenceReason = (id) => {
    const absences = ensureArray(data.plannedAbsences);
    const absence = absences.find(a => a.clinicianId === id && dateKey >= a.startDate && dateKey <= a.endDate);
    return absence?.reason || 'Absent';
  };

  // Drag handlers
  const handleDragStart = (e, clinicianId) => {
    e.dataTransfer.setData('clinicianId', String(clinicianId));
  };

  const moveToColumn = (clinicianId, targetColumn) => {
    const id = parseInt(clinicianId);
    const currentPresent = [...presentIds];
    const currentScheduled = [...scheduled];

    if (targetColumn === 'present') {
      if (!currentPresent.includes(id)) currentPresent.push(id);
      if (!currentScheduled.includes(id)) currentScheduled.push(id);
    } else if (targetColumn === 'absent') {
      const newPresent = currentPresent.filter(cid => cid !== id);
      if (!currentScheduled.includes(id)) currentScheduled.push(id);
      const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: currentScheduled } };
      saveData({ ...data, dailyOverrides: newOverrides });
      return;
    } else if (targetColumn === 'dayoff') {
      const newPresent = currentPresent.filter(cid => cid !== id);
      const newScheduled = currentScheduled.filter(cid => cid !== id);
      const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: newPresent, scheduled: newScheduled } };
      saveData({ ...data, dailyOverrides: newOverrides });
      return;
    }

    const newOverrides = { ...data.dailyOverrides, [dayKey]: { present: currentPresent, scheduled: currentScheduled } };
    saveData({ ...data, dailyOverrides: newOverrides });
  };

  const toggleDayOffVisibility = (id) => {
    const newShowDayOff = { ...showDayOff, [id]: showDayOff[id] === false ? true : false };
    saveData({ ...data, huddleSettings: { ...data.huddleSettings, showDayOffClinicians: newShowDayOff } });
  };

  const presentClinicians = clinicians.filter(c => presentIds.includes(c.id));
  const absentClinicians = clinicians.filter(c => absentIds.includes(c.id));
  const dayOffClinicians = clinicians.filter(c => dayOffVisible.includes(c.id));

  return (
    <div className="card overflow-hidden">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Who's In Today</div>
            <div className="text-[10px] text-white/60">{today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} — Drag to move</div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${showSettings ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
            ⚙ Settings
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <div className="text-xs font-medium text-slate-600 mb-2">Show in "Day Off" column:</div>
          <div className="flex flex-wrap gap-1.5">
            {clinicians.map(c => {
              const visible = showDayOff[c.id] !== false;
              return (
                <button key={c.id} onClick={() => toggleDayOffVisibility(c.id)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${visible ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border border-slate-200'}`}>
                  {c.initials} — {c.name.split(' ').pop()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* In Practice */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-semibold text-slate-700">In Practice ({presentClinicians.length})</span>
            </div>
            <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('clinicianId'), 'present')} colour="border-emerald-200" isEmpty={presentClinicians.length === 0} label="Drop here">
              {presentClinicians.map(c => (
                <PersonCard key={c.id} clinician={c} status="present" draggable
                  onDragStart={(e) => handleDragStart(e, c.id)} />
              ))}
            </DropZone>
          </div>

          {/* Absent / Leave */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-xs font-semibold text-slate-700">Leave / Absent ({absentClinicians.length})</span>
            </div>
            <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('clinicianId'), 'absent')} colour="border-red-200" isEmpty={absentClinicians.length === 0} label="Drop here for sick/absent">
              {absentClinicians.map(c => (
                <PersonCard key={c.id} clinician={c} status="absent" reason={getAbsenceReason(c.id)} draggable
                  onDragStart={(e) => handleDragStart(e, c.id)} />
              ))}
            </DropZone>
          </div>

          {/* Day Off */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-xs font-semibold text-slate-700">Day Off ({dayOffClinicians.length})</span>
            </div>
            <DropZone onDrop={(e) => moveToColumn(e.dataTransfer.getData('clinicianId'), 'dayoff')} colour="border-slate-200" isEmpty={dayOffClinicians.length === 0} label="Not scheduled">
              {dayOffClinicians.map(c => (
                <PersonCard key={c.id} clinician={c} status="dayoff" draggable
                  onDragStart={(e) => handleDragStart(e, c.id)} />
              ))}
            </DropZone>
          </div>
        </div>
      </div>
    </div>
  );
}
