'use client';
import { useState, useMemo } from 'react';
import { DAYS, getWeekStart, formatWeekRange, formatDate, getCurrentDay, generateBuddyAllocations, groupAllocationsByCovering, DEFAULT_SETTINGS, toLocalIso, toHuddleDateStr, matchesStaffMember, computeDayStatus } from '@/lib/data';
import { getCliniciansForDate } from '@/lib/huddle';

export default function BuddyDaily({ data, saveData, password, toast, selectedWeek, setSelectedWeek, selectedDay, setSelectedDay, syncStatus, setSyncStatus, isGenerating, setIsGenerating, helpers, huddleData }) {
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

  const overriddenIds = (() => {
    const dateKey = getDateKey();
    const dayKey = `${dateKey}-${selectedDay}`;
    const override = data?.dailyOverrides?.[dayKey];
    if (!override?.present) return new Set();
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
    overridePresent.forEach(id => { if (!naturalPresent.has(id)) changed.add(id); });
    naturalPresent.forEach(id => { if (!overridePresent.has(id)) changed.add(id); });
    return changed;
  })();

  const csvMismatches = (() => {
    if (!huddleData) return { presentNoCSV: new Set(), absentHasCSV: new Set() };
    const dateKey = getDateKey();
    const d = new Date(dateKey + 'T12:00:00');
    const csvDateStr = toHuddleDateStr(d);
    const csvClinicians = getCliniciansForDate(huddleData, csvDateStr);
    if (csvClinicians.length === 0) return { presentNoCSV: new Set(), absentHasCSV: new Set() };
    const presentNoCSV = new Set();
    const absentHasCSV = new Set();
    presentIds.forEach(id => {
      const c = cliniciansList.find(cl => cl.id === id);
      if (!c) return;
      const inCSV = csvClinicians.some(csv => matchesStaffMember(csv, c));
      if (!inCSV) presentNoCSV.add(id);
    });
    [...absentIds, ...dayOffIds].forEach(id => {
      const c = cliniciansList.find(cl => cl.id === id);
      if (!c) return;
      const inCSV = csvClinicians.some(csv => matchesStaffMember(csv, c));
      if (inCSV) absentHasCSV.add(id);
    });
    return { presentNoCSV, absentHasCSV };
  })();
  const hasCsvMismatches = csvMismatches.presentNoCSV.size > 0 || csvMismatches.absentHasCSV.size > 0;

  const getDiagnostic = (c) => {
    const status = getClinicianStatus(c.id, selectedDay);
    const dateKey = getDateKey();
    const lines = [`${c.name} (${c.initials})`, `Status: ${status}`, `Role: ${c.role}`];
    if (hasPlannedAbsence(c.id, dateKey)) lines.push(`Planned: ${getPlannedAbsenceReason(c.id, dateKey)}`);
    if (c.longTermAbsent) lines.push('Long-term absent');
    const isOverridden = overriddenIds.has(c.id);
    const csvNoSession = csvMismatches.presentNoCSV.has(c.id);
    const csvHasSession = csvMismatches.absentHasCSV.has(c.id);
    const hasOverride = currentAlloc?.hasOverride;
    if (csvNoSession) lines.push('⚠ EMIS: No sessions found');
    if (csvHasSession) lines.push('⚠ EMIS: Has sessions booked');
    if (isOverridden && hasOverride) lines.push('⚠ Manual override active');
    return lines.join('\n');
  };

  const handleGenerate = () => {
    const dateKey = getDateKey();
    const day = selectedDay;
    const cls = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
    const status = computeDayStatus(data, dateKey, day);
    const { allocations, dayOffAllocations } = generateBuddyAllocations(cls, status.present, status.absent, status.dayOff, data.settings || DEFAULT_SETTINGS);
    const newHistory = { ...data.allocationHistory, [dateKey]: { date: dateKey, day, allocations, dayOffAllocations, presentIds: status.present, absentIds: status.absent, dayOffIds: status.dayOff, hasOverride: status.hasOverride, overriddenIds: status.overriddenIds } };
    saveData({ ...data, allocationHistory: newHistory });
  };

  const handleCopyDay = () => {
    const dateKey = getDateKey();
    const date = new Date(dateKey + 'T12:00:00');
    const dateStr = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (!currentAlloc) return;
    const grouped = groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, currentAlloc.presentIds || []);
    let text = `BUDDY ALLOCATION\n${dateStr}\n\n`;
    const rows = ensureArray(currentAlloc.presentIds).map(id => {
      const c = getClinicianById(id); const t = grouped[id] || { absent: [], dayOff: [] };
      return c ? { clinician: c, tasks: t, canCover: c.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 } : null;
    }).filter(Boolean);
    rows.sort((a, b) => { if (a.canCover && !b.canCover) return -1; if (!a.canCover && b.canCover) return 1; if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; } return 0; });
    rows.forEach(({ clinician, tasks }) => {
      const f = tasks.absent.length > 0 ? tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
      const v = tasks.dayOff.length > 0 ? tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-';
      text += `${clinician.initials}: File ${f} / View ${v}\n`;
    });
    navigator.clipboard.writeText(text.trim());
    toast('Copied to clipboard', 'success', 2000);
  };

  const handleCopyWeek = () => {
    const missing = DAYS.filter(d => { const dk = getDateKeyForDay(d); return !isClosedDay(dk) && !data?.allocationHistory?.[dk]; });
    if (missing.length > 0) { alert(`Missing allocations for: ${missing.join(', ')}`); return; }
    let s = `BUDDY ALLOCATIONS — ${formatWeekRange(selectedWeek)}\n${'='.repeat(50)}\n\n`;
    DAYS.forEach(d => {
      const dk = getDateKeyForDay(d);
      const dt = new Date(dk + 'T12:00:00');
      const ds = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      if (isClosedDay(dk)) { s += `${ds}\nPRACTICE CLOSED — ${getClosedReason(dk)}\n\n`; return; }
      const e = data?.allocationHistory?.[dk]; if (!e) { s += `${ds}\nNo allocation generated\n\n`; return; }
      s += `${ds}\n`;
      const g = groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []);
      const rows = (e.presentIds || []).map(id => { const c = getClinicianById(id); const t = g[id] || { absent: [], dayOff: [] }; return c ? { clinician: c, tasks: t, canCover: c.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 } : null; }).filter(Boolean);
      rows.sort((a, b) => { if (a.canCover && !b.canCover) return -1; if (!a.canCover && b.canCover) return 1; if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; } return 0; });
      rows.forEach(({ clinician, tasks }) => { const f = tasks.absent.length > 0 ? tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-'; const v = tasks.dayOff.length > 0 ? tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(', ') : '-'; s += `${clinician.initials}: File ${f} / View ${v}\n`; });
      s += '\n';
    });
    navigator.clipboard.writeText(s.trim());
    toast('Week copied to clipboard', 'success', 2000);
  };

  // Week strip data
  const weekAbsences = useMemo(() => {
    const abs = {};
    DAYS.forEach(d => {
      const dk = getDateKeyForDay(d);
      abs[d] = ensureArray(data?.plannedAbsences).filter(a => dk >= a.startDate && dk <= a.endDate).map(a => {
        const c = cliniciansList.find(cl => cl.id === a.clinicianId);
        return c ? { ...a, clinician: c } : null;
      }).filter(Boolean);
    });
    return abs;
  }, [data?.plannedAbsences, selectedWeek, cliniciansList]);

  return (
    <div className="space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Buddy Cover</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data.lastSyncTime ? `TeamNet synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'TeamNet not synced'}
            {syncStatus && <span className="ml-2 text-emerald-600">{syncStatus}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopyWeek} className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-sm flex items-center gap-1.5">📋 Week</button>
          {isGenerating ? (
            <div className="flex items-center gap-2">
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full w-1/3 bg-gradient-to-r from-violet-500 to-purple-600 rounded-full animate-progress" /></div>
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
              const idxToDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
              for (let i = 0; i < 28; i++) {
                const checkDate = new Date(today); checkDate.setDate(checkDate.getDate() + i);
                const dayIndex = checkDate.getDay(); if (dayIndex === 0 || dayIndex === 6) continue;
                const dayName = idxToDay[dayIndex]; const dateKey = toLocalIso(checkDate);
                if (currentData.closedDays?.[dateKey]) continue;
                const status = computeDayStatus(currentData, dateKey, dayName);
                const { allocations, dayOffAllocations } = generateBuddyAllocations(clins, status.present, status.absent, status.dayOff, currentData.settings || DEFAULT_SETTINGS);
                newHistory[dateKey] = { date: dateKey, day: dayName, allocations, dayOffAllocations, presentIds: status.present, absentIds: status.absent, dayOffIds: status.dayOff, hasOverride: status.hasOverride, overriddenIds: status.overriddenIds };
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
              setSyncStatus(`Done — ${generated} days`); setTimeout(() => setSyncStatus(''), 4000);
            }} className="btn-primary text-sm">Generate 4 Weeks</button>
          )}
        </div>
      </div>

      {/* ═══ WEEK STRIP ═══ */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 86400000))} className="btn-secondary py-1 px-2.5 text-sm">◀</button>
          <div className="text-sm font-semibold text-slate-700">{formatWeekRange(selectedWeek)}</div>
          <div className="flex items-center gap-2">
            {selectedWeek.getTime() !== getWeekStart(new Date()).getTime() && (
              <button onClick={() => { setSelectedWeek(getWeekStart(new Date())); setSelectedDay(getCurrentDay()); }} className="text-xs text-purple-600 hover:text-purple-800 font-medium">This week</button>
            )}
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 86400000))} className="btn-secondary py-1 px-2.5 text-sm">▶</button>
          </div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-slate-100">
          {DAYS.map(day => {
            const dk = getDateKeyForDay(day);
            const dt = new Date(dk + 'T12:00:00');
            const closed = isClosedDay(dk);
            const isSel = selectedDay === day;
            const todayDate = isToday(dk);
            const e = data?.allocationHistory?.[dk];
            const has = !!e;
            const g = has ? groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []) : {};
            const dayAbs = weekAbsences[day] || [];

            return (
              <button key={day} onClick={() => setSelectedDay(day)} className="text-left transition-colors" style={{
                background: isSel ? '#f8fafc' : 'white',
                borderBottom: isSel ? '3px solid #7c3aed' : todayDate ? '3px solid #a855f7' : '3px solid transparent',
              }}>
                {/* Day header */}
                <div className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold" style={{color: closed ? '#94a3b8' : '#334155'}}>{day.slice(0, 3)}</div>
                    <div className="text-[10px] text-slate-400">{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  {closed ? (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">Closed</span>
                  ) : has ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Generated" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-amber-300" title="Not generated" />
                  )}
                </div>

                {/* Mini allocations */}
                {!closed && has && (
                  <div className="px-3 pb-2 space-y-0.5">
                    {(e.presentIds || []).slice(0, 6).map(bid => {
                      const b = getClinicianById(bid);
                      const t = g[bid] || { absent: [], dayOff: [] };
                      if (!b || (t.absent.length === 0 && t.dayOff.length === 0)) return null;
                      return (
                        <div key={bid} className="flex items-center gap-1 text-[10px]">
                          <span className="font-semibold text-slate-600 w-5">{b.initials}</span>
                          <div className="flex gap-0.5 flex-wrap">
                            {t.absent.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="px-1 py-px rounded text-[8px] font-medium bg-red-100 text-red-700">{x.initials}</span> : null; })}
                            {t.dayOff.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="px-1 py-px rounded text-[8px] font-medium bg-amber-100 text-amber-700">{x.initials}</span> : null; })}
                          </div>
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                )}

                {/* Leave badges */}
                {dayAbs.length > 0 && !closed && (
                  <div className="px-3 pb-2 flex gap-0.5 flex-wrap">
                    {dayAbs.slice(0, 4).map((a, i) => {
                      const cc = a.reason === 'Holiday' || a.reason === 'Annual Leave' ? 'bg-blue-50 text-blue-600' : a.reason === 'Training' || a.reason === 'Study' ? 'bg-amber-50 text-amber-600' : a.reason === 'Sick' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-500';
                      return <span key={i} className={`text-[8px] font-medium px-1 py-px rounded ${cc}`} title={`${a.clinician.name} — ${a.reason}`}>{a.clinician.initials}</span>;
                    })}
                    {dayAbs.length > 4 && <span className="text-[8px] text-slate-400">+{dayAbs.length - 4}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ KEY ═══ */}
      <div className="flex gap-4 text-xs text-slate-500 flex-wrap px-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" />Generated</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-300" />Not generated</span>
        <span className="flex items-center gap-1"><span className="px-1 py-px rounded text-[9px] font-medium bg-red-100 text-red-700">XX</span>File & action</span>
        <span className="flex items-center gap-1"><span className="px-1 py-px rounded text-[9px] font-medium bg-amber-100 text-amber-700">XX</span>View only</span>
        <span className="flex items-center gap-1"><span className="px-1 py-px rounded text-[9px] font-medium bg-blue-50 text-blue-600">XX</span>On leave</span>
      </div>

      {/* ═══ DAILY DETAIL ═══ */}
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
                <h2 className="text-base font-semibold text-slate-900">{selectedDay} — Attendance</h2>
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
                const csvNoSession = csvMismatches.presentNoCSV.has(c.id);
                const csvHasSession = csvMismatches.absentHasCSV.has(c.id);
                const hasCsvFlag = csvNoSession || csvHasSession;
                const outlineCol = isOverridden ? '#f59e0b' : hasCsvFlag ? '#3b82f6' : null;
                return (
                  <div key={c.id} className={`clinician-card ${status}`} title={getDiagnostic(c)} style={{minHeight:56,maxHeight:56,overflow:'hidden',cursor:'help',...(outlineCol?{outline:`2px solid ${outlineCol}`,outlineOffset:'-2px'}:{})}}>
                    <div className="flex items-center justify-between h-full">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={`initials-badge ${status} flex-shrink-0`}>{c.initials || '??'}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 truncate">{c.name}</span>
                            {isOverridden && <span className="flex-shrink-0" title="Manually overridden"><span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white" style={{fontSize:10,fontWeight:800,lineHeight:1}}>!</span></span>}
                            {hasCsvFlag && <span className="flex-shrink-0" title={csvNoSession ? 'No EMIS sessions' : 'Has EMIS sessions'}><span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white" style={{fontSize:10,fontWeight:800,lineHeight:1}}>?</span></span>}
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
            {(overriddenIds.size > 0 || hasCsvMismatches) && (
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 flex-wrap">
                {overriddenIds.size > 0 && <span className="flex items-center gap-1.5"><span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>!</span>Manually overridden</span>}
                {hasCsvMismatches && <span className="flex items-center gap-1.5"><span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>?</span>EMIS / Rota mismatch</span>}
              </div>
            )}
          </div>

          {/* Allocations */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Buddy Allocations — {selectedDay}</h2>
                <p className="text-sm text-slate-500 mt-0.5">Workload balanced across present clinicians</p>
              </div>
              <div className="flex items-center gap-2">
                {hasAllocations && <button onClick={handleCopyDay} className="px-3 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 shadow-sm flex items-center gap-1.5">📋 Day</button>}
                {!isPastDate(getDateKey()) && <button onClick={handleGenerate} disabled={presentClinicians.length === 0} className="btn-primary">{hasAllocations ? 'Regenerate' : 'Generate'}</button>}
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
                          const c = getClinicianById(id); const t = groupedAllocations[id] || { absent: [], dayOff: [] };
                          return c ? { id, clinician: c, tasks: t, canCover: c.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 } : null;
                        }).filter(Boolean);
                        rows.sort((a, b) => { if (a.canCover && !b.canCover) return -1; if (!a.canCover && b.canCover) return 1; if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; } return 0; });
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
