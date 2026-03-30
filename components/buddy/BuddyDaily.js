'use client';
import { useState } from 'react';
import { DAYS, getWeekStart, formatWeekRange, formatDate, getCurrentDay, generateBuddyAllocations, groupAllocationsByCovering, DEFAULT_SETTINGS, toLocalIso } from '@/lib/data';

export default function BuddyDaily({ data, saveData, password, toast, selectedWeek, setSelectedWeek, selectedDay, setSelectedDay, syncStatus, setSyncStatus, isGenerating, setIsGenerating, helpers }) {
  const { ensureArray, getDateKey, getDateKeyForDay, getTodayKey, isPastDate, isToday, isClosedDay, getClosedReason, toggleClosedDay, hasPlannedAbsence, getPlannedAbsenceReason, getPresentClinicians, getAbsentClinicians, getDayOffClinicians, getClinicianStatus, togglePresence, getCurrentAllocations, getClinicianById, getWeekAbsences, dataVersion, setDataVersion, setData } = helpers;

  const currentAlloc = getCurrentAllocations();
  const presentIds = ensureArray(getPresentClinicians(selectedDay));
  const absentIds = ensureArray(getAbsentClinicians(selectedDay));
  const dayOffIds = ensureArray(getDayOffClinicians(selectedDay));
  const cliniciansList = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
  const presentClinicians = cliniciansList.filter(c => presentIds.includes(c.id));
  const absentClinicians = cliniciansList.filter(c => absentIds.includes(c.id));
  const dayOffClinicians = cliniciansList.filter(c => dayOffIds.includes(c.id));
  const hasAllocations = currentAlloc && (Object.keys(currentAlloc.allocations || {}).length > 0 || Object.keys(currentAlloc.dayOffAllocations || {}).length > 0);
  const groupedAllocations = currentAlloc ? groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, presentIds) : {};

  // Detect which clinicians have been manually overridden
  const overriddenIds = (() => {
    const dateKey = getDateKey();
    const dayKey = `${dateKey}-${selectedDay}`;
    const override = data?.dailyOverrides?.[dayKey];
    if (!override?.present) return new Set();
    // Compute "natural" present from rota + absences (without override)
    const plannedAbs = Array.isArray(data.plannedAbsences) ? data.plannedAbsences : Object.values(data.plannedAbsences || {});
    const rota = data.weeklyRota?.[selectedDay] || [];
    const scheduled = Array.isArray(rota) ? rota : Object.values(rota);
    const naturalPresent = new Set(scheduled.filter(id => {
      const c = cliniciansList.find(c => c.id === id);
      if (!c || c.longTermAbsent) return false;
      return !plannedAbs.some(a => a.clinicianId === id && dateKey >= a.startDate && dateKey <= a.endDate);
    }));
    const overridePresent = new Set(Array.isArray(override.present) ? override.present : Object.values(override.present));
    const changed = new Set();
    // Present in override but not naturally → manually added
    overridePresent.forEach(id => { if (!naturalPresent.has(id)) changed.add(id); });
    // Naturally present but removed in override → manually removed
    naturalPresent.forEach(id => { if (!overridePresent.has(id)) changed.add(id); });
    return changed;
  })();

  const handleGenerate = () => {
    const dateKey = getDateKey();
    const day = selectedDay;
    const dayKey = `${dateKey}-${day}`;
    const hasOverride = !!(data?.dailyOverrides?.[dayKey]?.present);
    const pIds = ensureArray(getPresentClinicians(day));
    const aIds = ensureArray(getAbsentClinicians(day));
    const doIds = ensureArray(getDayOffClinicians(day));
    const cls = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
    const { allocations, dayOffAllocations } = generateBuddyAllocations(cls, pIds, aIds, doIds, data.settings || DEFAULT_SETTINGS);
    const newHistory = { ...data.allocationHistory, [dateKey]: { date: dateKey, day, allocations, dayOffAllocations, presentIds: pIds, absentIds: aIds, dayOffIds: doIds, hasOverride, overriddenIds: hasOverride ? Array.from(overriddenIds) : [] } };
    saveData({ ...data, allocationHistory: newHistory });
  };

  const handleCopyAllocations = () => {
    const dateKey = getDateKey();
    const date = new Date(dateKey + 'T12:00:00');
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!currentAlloc) return;
    const grouped = groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, currentAlloc.presentIds || []);
    let text = `BUDDY ALLOCATION\n${dateStr}\n\n`;
    const allPresentIds = ensureArray(currentAlloc.presentIds);
    const allPresentRows = allPresentIds.map(id => {
      const clinician = getClinicianById(id);
      const tasks = grouped[id] || { absent: [], dayOff: [] };
      const canCover = clinician?.canProvideCover !== false;
      const hasAllocs = tasks.absent.length > 0 || tasks.dayOff.length > 0;
      return { id, clinician, tasks, canCover, hasAllocs };
    }).filter(row => row.clinician);
    allPresentRows.sort((a, b) => {
      if (a.canCover && !b.canCover) return -1;
      if (!a.canCover && b.canCover) return 1;
      if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; }
      return 0;
    });
    allPresentRows.forEach(({ clinician, tasks }) => {
      const fileStr = tasks.absent.length > 0 ? tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
      const viewStr = tasks.dayOff.length > 0 ? tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
      text += `${clinician.initials}: File ${fileStr} / View ${viewStr}\n`;
    });
    navigator.clipboard.writeText(text.trim());
    toast('Copied to clipboard', 'success', 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Daily Allocation</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data.lastSyncTime ? `TeamNet synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'TeamNet not synced'}
            {syncStatus && <span className="ml-2 text-emerald-600">{syncStatus}</span>}
          </p>
        </div>
        {isGenerating ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 min-w-[160px]"><div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full animate-progress" /></div></div>
            <button onClick={() => setIsGenerating(false)} className="btn-secondary text-xs py-1 px-2">Stop</button>
          </div>
        ) : (
          <button onClick={async () => {
            setIsGenerating(true);
            await new Promise(r => setTimeout(r, 50));
            const currentData = data;
            let generated = 0;
            const newHistory = { ...currentData.allocationHistory };
            const today = new Date();
            const clins = (Array.isArray(currentData.clinicians) ? currentData.clinicians : Object.values(currentData.clinicians || {})).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
            const allClins = Array.isArray(currentData.clinicians) ? currentData.clinicians : Object.values(currentData.clinicians || {});
            const plannedAbs = Array.isArray(currentData.plannedAbsences) ? currentData.plannedAbsences : Object.values(currentData.plannedAbsences || {});
            const idxToDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            
            // Replicate isAbsentUntilNextPresent from page.js
            const isAbsOnDate = (cid, dk) => plannedAbs.some(a => a.clinicianId === cid && dk >= a.startDate && dk <= a.endDate);
            const isAbsentCascade = (cid, fromDk) => {
              const c = allClins.find(c => c.id === cid);
              if (!c) return false;
              if (c.longTermAbsent) return true;
              const rota = currentData.weeklyRota || {};
              const workDays = DAYS.filter(d => { const r = rota[d] || []; return (Array.isArray(r) ? r : Object.values(r)).includes(cid); });
              if (workDays.length === 0) return false;
              const startDate = new Date(fromDk + 'T12:00:00');
              // Check backwards for last working day
              for (let j = 1; j <= 7; j++) {
                const pd = new Date(startDate); pd.setDate(pd.getDate() - j);
                const pdi = pd.getDay(); const pdn = idxToDay[pdi]; const pdk = toLocalIso(pd);
                if (pdi === 0 || pdi === 6) continue;
                if (workDays.includes(pdn)) { if (isAbsOnDate(cid, pdk)) return true; break; }
              }
              // Check forwards for next working day
              for (let j = 0; j <= 28; j++) {
                const fd = new Date(startDate); fd.setDate(fd.getDate() + j);
                const fdi = fd.getDay(); const fdn = idxToDay[fdi]; const fdk = toLocalIso(fd);
                if (fdi === 0 || fdi === 6) continue;
                if (workDays.includes(fdn)) { if (isAbsOnDate(cid, fdk)) return true; return false; }
              }
              return false;
            };
            
            for (let i = 0; i < 28; i++) {
              const checkDate = new Date(today);
              checkDate.setDate(checkDate.getDate() + i);
              const dayIndex = checkDate.getDay();
              if (dayIndex === 0 || dayIndex === 6) continue;
              const dayName = idxToDay[dayIndex];
              const dateKey = toLocalIso(checkDate);
              const dayKey = `${dateKey}-${dayName}`;
              if (currentData.closedDays?.[dateKey]) continue;
              
              // Check for manual override — respect it if present
              const override = currentData.dailyOverrides?.[dayKey];
              const hasOverride = !!(override?.present);
              let present, scheduled;
              let genOverriddenIds = [];
              
              // Always compute natural present for comparison
              const rota = currentData.weeklyRota?.[dayName] || [];
              const naturalScheduled = Array.isArray(rota) ? rota : Object.values(rota);
              const naturalPresent = new Set(naturalScheduled.filter(id => {
                const c = allClins.find(c => c.id === id);
                if (!c || c.longTermAbsent) return false;
                if (isAbsOnDate(id, dateKey)) return false;
                if (isAbsentCascade(id, dateKey)) return false;
                return true;
              }));
              
              if (hasOverride) {
                present = Array.isArray(override.present) ? override.present : Object.values(override.present);
                scheduled = Array.isArray(override.scheduled || []) ? (override.scheduled || []) : Object.values(override.scheduled || {});
                const overrideSet = new Set(present);
                naturalPresent.forEach(id => { if (!overrideSet.has(id)) genOverriddenIds.push(id); });
                overrideSet.forEach(id => { if (!naturalPresent.has(id)) genOverriddenIds.push(id); });
              } else {
                scheduled = naturalScheduled;
                present = Array.from(naturalPresent);
              }
              
              const absentIds = scheduled.filter(id => !present.includes(id));
              const dayOffIds = clins.filter(c => !scheduled.includes(c.id) && !c.longTermAbsent).map(c => c.id);
              
              const { allocations, dayOffAllocations } = generateBuddyAllocations(clins, present, absentIds, dayOffIds, currentData.settings || DEFAULT_SETTINGS);
              newHistory[dateKey] = { date: dateKey, day: dayName, allocations, dayOffAllocations, presentIds: present, absentIds, dayOffIds, hasOverride, overriddenIds: genOverriddenIds };
              generated++;
              await new Promise(r => setTimeout(r, 10));
            }
            if (generated > 0) {
              const nd = { ...currentData, allocationHistory: newHistory };
              setData(nd);
              try { await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-password': password }, body: JSON.stringify(nd) }); } catch (err) { console.error(err); }
              setDataVersion(v => v + 1);
            }
            setIsGenerating(false);
            setSyncStatus(`Done — ${generated} days`);
            setTimeout(() => setSyncStatus(''), 4000);
          }} className="btn-primary">Generate Next 4 Weeks</button>
        )}
      </div>

      {/* Week navigator */}
      <div className="card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">◀</button>
            <div className="text-sm font-medium text-slate-900 min-w-[180px] text-center">{formatWeekRange(selectedWeek)}</div>
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 24 * 60 * 60 * 1000))} className="btn-secondary py-1.5 px-3 text-sm">▶</button>
            <button onClick={() => { setSelectedWeek(getWeekStart(new Date())); setSelectedDay(getCurrentDay()); }} className="ml-2 px-4 py-1.5 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 shadow-md">Today</button>
          </div>
          <div className="flex items-center gap-2">
            {DAYS.map(day => {
              const dk = getDateKeyForDay(day);
              const closed = isClosedDay(dk);
              const todayDate = isToday(dk);
              return (
                <button key={day} onClick={() => setSelectedDay(day)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative ${selectedDay === day ? 'bg-slate-900 text-white' : closed ? 'bg-slate-200 text-slate-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                  {day.slice(0, 3)}
                  {todayDate && <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full"></span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {isClosedDay(getDateKey()) ? (
        <div className="card p-8 text-center">
          <div className="text-2xl mb-2">🏠</div>
          <div className="text-lg font-medium text-slate-900 mb-1">Practice Closed</div>
          <div className="text-sm text-slate-500">{getClosedReason(getDateKey())}</div>
          {!isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey())} className="mt-4 text-sm text-purple-600 hover:text-purple-800">Mark as open →</button>}
        </div>
      ) : (
        <>
          {/* Attendance */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Attendance</h2>
                <p className="text-xs text-slate-500 mt-0.5">{formatDate(getDateKey())}{!isPastDate(getDateKey()) && ' — Click to toggle'}</p>
              </div>
              <div className="flex items-center gap-2">
                {!isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey(), 'Bank Holiday')} className="text-xs text-slate-400 hover:text-slate-600">Mark closed</button>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {cliniciansList.map(c => {
                const status = getClinicianStatus(c.id, selectedDay);
                const lta = c.longTermAbsent;
                const hasPlanned = hasPlannedAbsence(c.id, getDateKey());
                const plannedReason = getPlannedAbsenceReason(c.id, getDateKey());
                const past = isPastDate(getDateKey());
                const isOverridden = overriddenIds.has(c.id);
                return (
                  <div key={c.id} className={`clinician-card ${status}`} style={{minHeight:56,maxHeight:56,overflow:'hidden',...(isOverridden?{outline:'2px solid #f59e0b',outlineOffset:'-2px'}:{})}}>
                    <div className="flex items-center justify-between h-full">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`initials-badge ${status} flex-shrink-0`}>{c.initials || '??'}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 truncate">{c.name}</span>
                            {isOverridden && <span className="group relative flex-shrink-0" title={status === 'present' ? 'Manually set to present (would normally be absent/day off)' : 'Manually set to absent (would normally be present)'}><span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white" style={{fontSize:10,fontWeight:800,lineHeight:1}}>!</span></span>}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{c.role}{hasPlanned ? ` · ${plannedReason}` : ''}{lta ? ' · LTA' : ''}</div>
                        </div>
                      </div>
                      {past ? <span className="text-xs text-slate-400 flex-shrink-0">{status === 'present' ? '✓' : status === 'absent' ? '✗' : '—'}</span> : <button onClick={() => togglePresence(c.id, selectedDay)} className={`toggle-btn ${status === 'present' ? 'on' : status === 'dayoff' ? 'dayoff' : 'off'} flex-shrink-0`} />}
                    </div>
                  </div>
                );
              })}
            </div>
            {overriddenIds.size > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>!</span>
                <span>Manually overridden — attendance differs from rota / planned absences</span>
              </div>
            )}
          </div>

          {/* Allocations */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Buddy Allocations</h2>
                <p className="text-sm text-slate-500 mt-0.5">Workload balanced across present clinicians</p>
              </div>
              <div className="flex items-center gap-2">
                {hasAllocations && <button onClick={handleCopyAllocations} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-md flex items-center gap-2">📋 Copy</button>}
                {!isPastDate(getDateKey()) && <button onClick={handleGenerate} disabled={presentClinicians.length === 0} className="btn-primary">{hasAllocations ? 'Generate day' : 'Generate'}</button>}
              </div>
            </div>
            {!hasAllocations ? (
              <div className="text-center py-8 text-slate-400">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-sm">No allocations yet for {selectedDay}</div>
                {presentClinicians.length > 0 && !isPastDate(getDateKey()) && <div className="text-xs mt-1">Click Generate to create buddy assignments</div>}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide">Covering</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide"><span className="text-red-600">File & Action</span><span className="text-slate-400 font-normal ml-1">(absent)</span></th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500 uppercase tracking-wide"><span className="text-amber-600">View Only</span><span className="text-slate-400 font-normal ml-1">(day off)</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rows = presentIds.map(id => {
                          const c = getClinicianById(id);
                          const t = groupedAllocations[id] || { absent: [], dayOff: [] };
                          const can = c?.canProvideCover !== false;
                          const has = t.absent.length > 0 || t.dayOff.length > 0;
                          return { id, clinician: c, tasks: t, canCover: can, hasAllocs: has };
                        }).filter(r => r.clinician);
                        rows.sort((a, b) => {
                          if (a.canCover && !b.canCover) return -1;
                          if (!a.canCover && b.canCover) return 1;
                          if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; }
                          return 0;
                        });
                        return rows.map(({ clinician, tasks, canCover }) => (
                          <tr key={clinician.id} className={`border-b border-slate-50 last:border-0 ${!canCover ? 'opacity-50' : ''}`}>
                            <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="initials-badge present">{clinician.initials}</div><div><div className="text-sm font-medium text-slate-900">{clinician.name}</div><div className="text-xs text-slate-500">{clinician.role}</div></div></div></td>
                            <td className="py-3 px-4">{tasks.absent.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.absent.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="status-tag absent">{x.initials}</span> : null; })}</div> : <span className="text-slate-300">—</span>}</td>
                            <td className="py-3 px-4">{tasks.dayOff.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.dayOff.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="status-tag dayoff">{x.initials}</span> : null; })}</div> : <span className="text-slate-300">—</span>}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex gap-6 text-xs text-slate-500">
                  <span><strong className="text-emerald-600">{presentClinicians.length}</strong> present</span>
                  <span><strong className="text-red-600">{absentClinicians.length}</strong> absent</span>
                  <span><strong className="text-amber-600">{dayOffClinicians.length}</strong> day off</span>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
