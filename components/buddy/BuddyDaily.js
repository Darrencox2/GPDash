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
    if (!currentAlloc) return;
    const grouped = groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, currentAlloc.presentIds || []);



    let s = 'BUDDY COVER\n';
    s += `${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    s += 'www.gpdash.net/buddy\n\n';

    const rows = ensureArray(currentAlloc.presentIds).map(id => {
      const c = getClinicianById(id); const t = grouped[id] || { absent: [], dayOff: [] };
      return c ? { clinician: c, tasks: t, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 } : null;
    }).filter(Boolean).filter(r => r.hasAllocs);

    if (rows.length > 0) {
      rows.forEach(({ clinician, tasks }) => {
        const initials = clinician.initials || '??';
        const padded = initials.length < 4 ? initials + ' '.repeat(4 - initials.length) : initials;
        const parts = [];
        if (tasks.absent.length > 0) parts.push('File: ' + tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(' '));
        if (tasks.dayOff.length > 0) parts.push('View: ' + tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(' '));
        s += `  ${padded}\t${parts.join('  |  ')}\n`;
      });
    } else {
      s += '  No cover needed\n';
    }

    navigator.clipboard.writeText(s.trim());
    toast('Copied to clipboard', 'success', 2000);
  };

  const handleCopyWeek = () => {
    const missing = DAYS.filter(d => { const dk = getDateKeyForDay(d); return !isClosedDay(dk) && !data?.allocationHistory?.[dk]; });
    if (missing.length > 0) { alert(`Missing allocations for: ${missing.join(', ')}`); return; }



    let s = 'BUDDY COVER\n';
    const wcDate = new Date(getDateKeyForDay('Monday') + 'T12:00:00');
    s += `Week commencing ${wcDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    s += 'www.gpdash.net/buddy\n\n';

    DAYS.forEach(d => {
      const dk = getDateKeyForDay(d);
      const dt = new Date(dk + 'T12:00:00');
      const ds = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

      if (isClosedDay(dk)) {
        s += `${ds}\n  PRACTICE CLOSED - ${getClosedReason(dk)}\n\n`;
        return;
      }

      const e = data?.allocationHistory?.[dk];
      if (!e) { s += `${ds}\n  No allocation generated\n\n`; return; }

      const g = groupAllocationsByCovering(e.allocations || {}, e.dayOffAllocations || {}, e.presentIds || []);
      const rows = (e.presentIds || []).map(id => {
        const c = getClinicianById(id);
        const t = g[id] || { absent: [], dayOff: [] };
        return c ? { clinician: c, tasks: t, canCover: c.canProvideCover !== false, hasAllocs: t.absent.length > 0 || t.dayOff.length > 0 } : null;
      }).filter(Boolean);
      rows.sort((a, b) => {
        if (a.canCover && !b.canCover) return -1;
        if (!a.canCover && b.canCover) return 1;
        if (a.hasAllocs && !b.hasAllocs) return -1;
        if (!a.hasAllocs && b.hasAllocs) return 1;
        return 0;
      });

      const activeRows = rows.filter(r => r.hasAllocs);
      if (activeRows.length === 0) { s += `${ds}\n  No cover needed\n\n`; return; }

      s += `${ds}\n`;
      activeRows.forEach(({ clinician, tasks }) => {
        const initials = clinician.initials || '??';
        const padded = initials.length < 4 ? initials + ' '.repeat(4 - initials.length) : initials;
        const parts = [];
        if (tasks.absent.length > 0) parts.push('File: ' + tasks.absent.map(id => getClinicianById(id)?.initials || '??').join(' '));
        if (tasks.dayOff.length > 0) parts.push('View: ' + tasks.dayOff.map(id => getClinicianById(id)?.initials || '??').join(' '));
        s += `  ${padded}\t${parts.join('  |  ')}\n`;
      });
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
    <div className="-m-4 lg:-m-6 min-h-screen" style={{background:'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #0f172a 100%)'}}>
    <div className="max-w-6xl mx-auto p-4 lg:p-6 space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white" style={{fontFamily:"'Outfit',sans-serif"}}>Buddy Cover</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data.lastSyncTime ? `TeamNet synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'TeamNet not synced'}
            {syncStatus && <span className="ml-2 text-emerald-600">{syncStatus}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopyWeek} className="px-3 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5" style={{background:"rgba(16,185,129,0.6)",border:"1px solid rgba(16,185,129,0.3)"}}>Copy Week</button>
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
            }} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{background:"rgba(124,58,237,0.7)",border:"1px solid rgba(124,58,237,0.3)"}}>Generate 4 Weeks</button>
          )}
        </div>
      </div>

      {/* ═══ WEEK STRIP ═══ */}
      <div className="rounded-xl overflow-hidden" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{background:'rgba(15,23,42,0.85)',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
          <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 86400000))} className="px-2.5 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10" style={{border:'1px solid rgba(255,255,255,0.2)'}}>◀</button>
          <div className="text-sm font-semibold text-white">{formatWeekRange(selectedWeek)}</div>
          <div className="flex items-center gap-2">
            {selectedWeek.getTime() !== getWeekStart(new Date()).getTime() && (
              <button onClick={() => { setSelectedWeek(getWeekStart(new Date())); setSelectedDay(getCurrentDay()); }} className="text-xs text-white/70 hover:text-white font-medium">This week</button>
            )}
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 86400000))} className="px-2.5 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10" style={{border:'1px solid rgba(255,255,255,0.2)'}}>▶</button>
          </div>
        </div>
        <div className="overflow-x-auto"><div className="grid grid-cols-5 divide-x divide-white/5 min-w-[600px]">
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
              <button key={day} onClick={() => setSelectedDay(day)} className="text-left transition-all duration-150 flex flex-col" style={{
                background: isSel ? 'rgba(124,58,237,0.15)' : 'rgba(15,23,42,0.4)',
                borderBottom: isSel ? '4px solid #7c3aed' : todayDate ? '4px solid #6d28d9' : '4px solid transparent',
                boxShadow: isSel ? 'inset 0 0 0 1px rgba(124,58,237,0.3)' : 'none',
                height: 320,
              }}>
                {/* Day header */}
                <div className="px-3 py-2 flex items-center justify-between flex-shrink-0">
                  <div>
                    <div className="text-lg font-bold" style={{color: isSel ? '#a78bfa' : closed ? '#475569' : '#e2e8f0'}}>{day.slice(0, 3)}</div>
                    <div className="text-sm" style={{color: isSel ? '#a78bfa' : '#475569'}}>{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  {closed ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{background:'rgba(100,116,139,0.15)',color:'#64748b'}}>Closed</span>
                  ) : has ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{background:'rgba(16,185,129,0.15)',color:'#34d399'}}>Ready</span>
                  ) : (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold" style={{background:'rgba(245,158,11,0.15)',color:'#fbbf24'}}>Pending</span>
                  )}
                </div>

                {/* Mini allocations — single column, aligned grid */}
                {!closed && has && (() => {
                  const rows = (e.presentIds || []).map(bid => {
                    const b = getClinicianById(bid);
                    const t = g[bid] || { absent: [], dayOff: [] };
                    if (!b || (t.absent.length === 0 && t.dayOff.length === 0)) return null;
                    return { bid, b, t };
                  }).filter(Boolean);
                  return rows.length > 0 ? (
                    <div className="px-2.5 flex-1 overflow-hidden flex flex-col" style={{gap:3}}>
                      {rows.slice(0, 10).map(({ bid, b, t }) => (
                        <div key={bid} className="flex items-center" style={{gap:6}}>
                          <span className="font-bold text-slate-200 flex-shrink-0 text-right" style={{fontFamily:"'Outfit',sans-serif",fontSize:'clamp(11px,1.2vw,14px)',width:28}}>{b.initials}</span>
                          <svg width="6" height="6" viewBox="0 0 6 6" style={{flexShrink:0,opacity:0.3}}><path d="M1 3h4M3 1l2 2-2 2" stroke="#64748b" strokeWidth="1" fill="none"/></svg>
                          <div className="flex gap-1 flex-wrap flex-1 min-w-0">
                            {t.absent.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="rounded font-bold text-white flex-shrink-0" style={{background:'#ef4444',fontSize:'clamp(10px,1.1vw,13px)',padding:'1px 5px'}}>{x.initials}</span> : null; })}
                            {t.dayOff.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="rounded font-bold text-white flex-shrink-0" style={{background:'#f59e0b',fontSize:'clamp(10px,1.1vw,13px)',padding:'1px 5px'}}>{x.initials}</span> : null; })}
                          </div>
                        </div>
                      ))}
                      {rows.length > 10 && <div className="text-xs text-slate-600">+{rows.length - 10} more</div>}
                    </div>
                  ) : null;
                })()}

                {/* Leave badges — separated */}
                {dayAbs.length > 0 && !closed && (
                  <div className="px-2 pb-2 mt-auto flex-shrink-0">
                    <div className="pt-2 flex gap-1.5 flex-wrap" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                      <span className="text-xs text-slate-500 mr-1" style={{lineHeight:'24px'}}>Leave:</span>
                      {dayAbs.slice(0, 4).map((a, i) => {
                        const ccStyle = a.reason === 'Holiday' || a.reason === 'Annual Leave' ? {background:'rgba(59,130,246,0.15)',color:'#60a5fa'} : a.reason === 'Training' || a.reason === 'Study' ? {background:'rgba(245,158,11,0.15)',color:'#fbbf24'} : a.reason === 'Sick' ? {background:'rgba(239,68,68,0.15)',color:'#f87171'} : {background:'rgba(100,116,139,0.15)',color:'#94a3b8'};
                        return <span key={i} className="text-xs font-medium px-1.5 py-0.5 rounded" style={ccStyle} title={`${a.clinician.name} — ${a.reason}`}>{a.clinician.initials}</span>;
                      })}
                      {dayAbs.length > 4 && <span className="text-xs text-slate-500">+{dayAbs.length - 4}</span>}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div></div>
      </div>

      {/* ═══ DAILY DETAIL ═══ */}
      {isClosedDay(getDateKey()) ? (
        <div className="glass rounded-xl p-8 text-center">
          <div className="text-2xl mb-2">🏠</div>
          <div className="text-lg font-medium text-white mb-1" style={{fontFamily:"'Outfit',sans-serif"}}>Practice Closed</div>
          <div className="text-sm text-slate-500">{getClosedReason(getDateKey())}</div>
          {!isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey())} className="mt-4 text-sm text-purple-600 hover:text-purple-800">Mark as open →</button>}
        </div>
      ) : (
        <>
          {/* Attendance */}
          <div className="rounded-xl overflow-hidden" className="glass" style={{borderRadius:12}}>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">{selectedDay} — Attendance</h2>
                <p className="text-xs text-slate-400 mt-0.5">{formatDate(getDateKey())}{!isPastDate(getDateKey()) && ' — Click to toggle'}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-4 text-xs">
                  <span><strong className="text-emerald-400">{presentClinicians.length}</strong> <span className="text-slate-500">present</span></span>
                  <span><strong className="text-red-400">{absentClinicians.length}</strong> <span className="text-slate-500">absent</span></span>
                  <span><strong className="text-amber-400">{dayOffClinicians.length}</strong> <span className="text-slate-500">day off</span></span>
                </div>
                {!isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey(), 'Bank Holiday')} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded" style={{border:'1px solid #334155'}}>Mark closed</button>}
              </div>
            </div>
            <div className="px-5 pb-5">
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
                const cardBg = status === 'present' ? 'rgba(16,185,129,0.12)' : status === 'absent' ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.08)';
                const cardBorder = status === 'present' ? '#10b98140' : status === 'absent' ? '#ef444440' : '#f59e0b30';
                return (
                  <div key={c.id} className="rounded-lg px-3 py-2.5" title={getDiagnostic(c)} style={{background:cardBg, border:`1px solid ${cardBorder}`, cursor:'help', ...(outlineCol?{outline:`2px solid ${outlineCol}`,outlineOffset:'-2px'}:{})}}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0" style={{
                          background: status === 'present' ? '#10b98130' : status === 'absent' ? '#ef444430' : '#f59e0b20',
                          color: status === 'present' ? '#34d399' : status === 'absent' ? '#f87171' : '#fbbf24',
                          border: `1px solid ${status === 'present' ? '#10b98150' : status === 'absent' ? '#ef444450' : '#f59e0b40'}`,
                        }}>{c.initials || '??'}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-200 truncate">{c.name}</span>
                            {isOverridden && <span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>!</span>}
                            {hasCsvFlag && <span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>?</span>}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{c.role}{hasPlanned ? ` · ${plannedReason}` : ''}{lta ? ' · LTA' : ''}</div>
                        </div>
                      </div>
                      {past ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full flex-shrink-0" style={{
                          background: status === 'present' ? '#10b98125' : status === 'absent' ? '#ef444425' : '#f59e0b18',
                          border: `1px solid ${status === 'present' ? '#10b98140' : status === 'absent' ? '#ef444440' : '#f59e0b30'}`,
                        }}>
                          <span style={{fontSize:12, color: status === 'present' ? '#34d399' : status === 'absent' ? '#f87171' : '#fbbf24'}}>{status === 'present' ? '✓' : status === 'absent' ? '✗' : '—'}</span>
                          <span style={{fontSize:11, fontWeight:500, color: status === 'present' ? '#34d399' : status === 'absent' ? '#f87171' : '#fbbf24'}}>{status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : 'Day off'}</span>
                        </span>
                      ) : (
                        <button onClick={() => togglePresence(c.id, selectedDay)} className="flex items-center gap-1.5 rounded-full flex-shrink-0 transition-all duration-150" style={{
                          padding: '5px 14px',
                          background: status === 'present' ? '#10b98130' : status === 'absent' ? '#ef444430' : '#f59e0b20',
                          border: `1px solid ${status === 'present' ? '#10b98160' : status === 'absent' ? '#ef444460' : '#f59e0b40'}`,
                          cursor: 'pointer',
                        }}>
                          <span style={{fontSize:13, color: status === 'present' ? '#34d399' : status === 'absent' ? '#f87171' : '#fbbf24'}}>{status === 'present' ? '✓' : status === 'absent' ? '✗' : '—'}</span>
                          <span style={{fontSize:12, fontWeight:500, color: status === 'present' ? '#34d399' : status === 'absent' ? '#f87171' : '#fbbf24'}}>{status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : 'Day off'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              </div>
              {(overriddenIds.size > 0 || hasCsvMismatches) && (
                <div className="flex items-center gap-4 mt-3 pt-3 text-xs text-slate-500 flex-wrap" style={{borderTop:'1px solid #334155'}}>
                  {overriddenIds.size > 0 && <span className="flex items-center gap-1.5"><span className="flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>!</span>Manually overridden</span>}
                  {hasCsvMismatches && <span className="flex items-center gap-1.5"><span className="flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white flex-shrink-0" style={{fontSize:10,fontWeight:800,lineHeight:1}}>?</span>EMIS / Rota mismatch</span>}
                </div>
              )}
            </div>
          </div>

          {/* KEY */}
          <div className="flex gap-4 text-xs text-slate-500 flex-wrap px-1">
            <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:'rgba(16,185,129,0.15)',color:'#34d399'}}>Ready</span>Generated</span>
            <span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{background:'rgba(245,158,11,0.15)',color:'#fbbf24'}}>Pending</span>Not generated</span>
            <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{background:'rgba(239,68,68,0.15)',color:'#f87171'}}>XX</span>File & action</span>
            <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{background:'rgba(245,158,11,0.1)',color:'#fbbf24'}}>XX</span>View only</span>
            <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded text-xs font-medium" style={{background:'rgba(59,130,246,0.1)',color:'#60a5fa'}}>XX</span>On leave</span>
          </div>

          {/* Allocations */}
          <div className="rounded-xl overflow-hidden" style={{background:'rgba(15,23,42,0.7)',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="flex items-center justify-between" style={{background:'rgba(15,23,42,0.85)',padding:'12px 20px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
              <div>
                <h2 className="text-base font-semibold text-white">Buddy Allocations — {selectedDay}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Workload balanced across present clinicians</p>
              </div>
              <div className="flex items-center gap-2">
                {hasAllocations && <button onClick={handleCopyDay} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5" style={{background:'rgba(16,185,129,0.6)',border:'1px solid rgba(16,185,129,0.3)'}}>Copy Day</button>}
                {!isPastDate(getDateKey()) && <button onClick={handleGenerate} disabled={presentClinicians.length === 0} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40" style={{background:'rgba(124,58,237,0.7)',border:'1px solid rgba(124,58,237,0.3)'}}>{hasAllocations ? 'Regenerate' : 'Generate'}</button>}
              </div>
            </div>
            <div className="p-5">
            {!hasAllocations ? (
              <div className="text-center py-8 text-slate-500">
                <div className="text-2xl mb-2">📋</div>
                <div className="text-sm">No allocations yet for {selectedDay}</div>
                {presentClinicians.length > 0 && !isPastDate(getDateKey()) && <div className="text-xs mt-1">Click Generate to create buddy assignments</div>}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto"><table className="w-full min-w-[500px]">
                    <thead>
                      <tr style={{borderBottom:"1px solid rgba(255,255,255,0.06)"}}>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Covering</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide"><span className="text-red-400">File & Action</span><span className="text-slate-400 font-normal ml-1">(absent)</span></th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide"><span className="text-amber-400">View Only</span><span className="text-slate-400 font-normal ml-1">(day off)</span></th>
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
                          <tr key={clinician.id} style={{borderBottom:"1px solid rgba(255,255,255,0.04)"}} className={!canCover ? "opacity-50" : ""}>
                            <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{background:"#10b981",fontFamily:"'Outfit',sans-serif"}}>{clinician.initials}</div><div><div className="text-sm font-medium text-slate-200">{clinician.name}</div><div className="text-xs text-slate-500">{clinician.role}</div></div></div></td>
                            <td className="py-3 px-4">{tasks.absent.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.absent.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="inline-flex items-center justify-center rounded-md text-sm font-bold text-white" style={{padding:'4px 8px',background:'#ef4444',minWidth:32}}>{x.initials}</span> : null; })}</div> : <span className="text-slate-600">—</span>}</td>
                            <td className="py-3 px-4">{tasks.dayOff.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.dayOff.map(id => { const x = getClinicianById(id); return x ? <span key={id} className="inline-flex items-center justify-center rounded-md text-sm font-bold text-white" style={{padding:'4px 8px',background:'#f59e0b',minWidth:32}}>{x.initials}</span> : null; })}</div> : <span className="text-slate-600">—</span>}</td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table></div>
                <div className="mt-4 pt-4 flex gap-6 text-xs text-slate-500" style={{borderTop:"1px solid rgba(255,255,255,0.06)"}}>
                  <span><strong className="text-emerald-600">{presentClinicians.length}</strong> present</span>
                  <span><strong className="text-red-600">{absentClinicians.length}</strong> absent</span>
                  <span><strong className="text-amber-600">{dayOffClinicians.length}</strong> day off</span>
                </div>
              </>
            )}
            </div>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
