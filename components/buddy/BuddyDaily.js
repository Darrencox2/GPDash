'use client';
import { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { DAYS, getWeekStart, getActiveWeekStart, formatWeekRange, formatDate, getCurrentDay, generateBuddyAllocations, groupAllocationsByCovering, DEFAULT_SETTINGS, toLocalIso, toHuddleDateStr, matchesStaffMember, computeDayStatus, logEvent, findCoveringAbsence, getScheduledSessions } from '@/lib/data';
import { getCliniciansForDate, parseHuddleDateStr } from '@/lib/huddle';
import { getEffectivePattern, patternDayLabel } from '@/lib/session-patterns';
import { STATUS_TRANSITIONS, applyTransition, undoTransition, adjustTransition, getWindDownAlerts } from '@/lib/status-transitions';
import { canEditPracticeData } from '@/lib/permissions';
import { createClient } from '@/utils/supabase/client';
import BuddyOverrideModal from './BuddyOverrideModal';
import ChangeHistoryPanel from './ChangeHistoryPanel';

export default function BuddyDaily({ data, saveData, password, toast, selectedWeek, setSelectedWeek, selectedDay, setSelectedDay, syncStatus, setSyncStatus, isGenerating, setIsGenerating, helpers, huddleData, setActiveSection, onRevertChange }) {
  const canEdit = canEditPracticeData(data);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { ensureArray, getDateKey, getDateKeyForDay, getTodayKey, isPastDate, isToday, isClosedDay, getClosedReason, toggleClosedDay, hasPlannedAbsence, getPlannedAbsenceReason, getPresentClinicians, getAbsentClinicians, getDayOffClinicians, getClinicianStatus, togglePresence, getCurrentAllocations, getClinicianById, getWeekAbsences, dataVersion, setDataVersion, setData } = helpers;

  // Lazy supabase client for the manual override audit-log insert.
  // Allocations themselves still flow through saveData → /api/v4/data
  // (mutation 4 handles buddy_allocations writes), but the audit
  // event we write alongside lives on the audit_events table which
  // doesn't have a bulk-save path.
  const supabaseRef = useRef(null);
  if (!supabaseRef.current && typeof window !== 'undefined') {
    supabaseRef.current = createClient();
  }
  // Manual override modal state. When set, the modal renders for that
  // absent person + covertype combination. Cleared on save or cancel.
  const [overrideTarget, setOverrideTarget] = useState(null);

  const currentAlloc = getCurrentAllocations();
  const presentIds = ensureArray(getPresentClinicians(selectedDay));
  const absentIds = ensureArray(getAbsentClinicians(selectedDay));
  const dayOffIds = ensureArray(getDayOffClinicians(selectedDay));
  const cliniciansList = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');

  // Wind-down awareness: while a clinician has an active windDown marker
  // (set via the Has left / Long-term sick transitions), their EMIS
  // mismatches are EXPECTED - a leaver's sessions typically stay in EMIS
  // for future weeks, and a sick person's are missing. Flagging them again
  // every week was the "it keeps re-asking me" bug. Suppress them from
  // both mismatch detectors and show a greyed label on the board instead.
  const windDownFor = (c, dateKey) =>
    c?.windDown && dateKey >= c.windDown.startDate && dateKey <= c.windDown.endDate
      ? c.windDown
      : null;
  const windDownLabel = (wd) => {
    const base = wd?.type === 'sick' ? 'Long term absence' : 'Leaving';
    if (!wd?.endDate) return base;
    const weeksLeft = Math.max(0, Math.ceil((new Date(wd.endDate + 'T23:59:59') - Date.now()) / (7 * 86400000)));
    return `${base} - ${weeksLeft} wk${weeksLeft === 1 ? '' : 's'} left`;
  };
  const [wdMenuOpen, setWdMenuOpen] = useState(null); // clinicianId
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
      if (!c || windDownFor(c, dateKey)) return;
      const inCSV = csvClinicians.some(csv => matchesStaffMember(csv, c));
      if (!inCSV) presentNoCSV.add(id);
    });
    [...absentIds, ...dayOffIds].forEach(id => {
      const c = cliniciansList.find(cl => cl.id === id);
      if (!c || windDownFor(c, dateKey)) return;
      // Half-day TeamNet absences (session am/pm): EMIS sessions in the
      // other half of the day are EXPECTED, not an inconsistency.
      const cov = findCoveringAbsence(data, id, dateKey);
      if (cov?.session === 'am' || cov?.session === 'pm') return;
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
    // Upgrade hint: if the live status is "absent" but the clinician
    // isn't scheduled on this day AND has no planned absence today,
    // it's the day-off-adjacent-to-leave upgrade firing. Explain why
    // so the user doesn't wonder "why is my Wednesday day-off person
    // showing as red absent?" The upgrade fires when the immediately
    // previous OR next working day has a planned absence — usually a
    // multi-day leave block that incidentally spans their day off.
    if (status === 'absent' && !hasPlannedAbsence(c.id, dateKey)) {
      const dayRota = data?.weeklyRota?.[selectedDay] || [];
      const isScheduled = (Array.isArray(dayRota) ? dayRota : Object.values(dayRota)).includes(c.id);
      if (!isScheduled) {
        lines.push('⚠ Flagged for cover (day off adjacent to leave)');
      }
    }
    const isOverridden = overriddenIds.has(c.id);
    const csvNoSession = csvMismatches.presentNoCSV.has(c.id);
    const csvHasSession = csvMismatches.absentHasCSV.has(c.id);
    const hasOverride = currentAlloc?.hasOverride;
    if (csvNoSession) lines.push('⚠ EMIS: No sessions found');
    if (csvHasSession) lines.push('⚠ EMIS: Has sessions booked');
    if (isOverridden && hasOverride) lines.push('⚠ Manual override active');
    return lines.join('\n');
  };

  // ─── Plain-English "why this status" for the hover tooltip ───────────
  // Mirrors the decision path in computeDayStatus so the explanation is
  // always faithful to how the conclusion was actually reached: working-
  // days grid → planned leave today → multi-day leave block → day-off
  // upgraded for cover → manual override.
  const [hovered, setHovered] = useState(null); // { id, rect }
  const explainStatus = (c) => {
    const dateKey = getDateKey();
    const status = getClinicianStatus(c.id, selectedDay); // present | absent | dayOff
    const dayRota = data?.weeklyRota?.[selectedDay] || [];
    const scheduled = (Array.isArray(dayRota) ? dayRota : Object.values(dayRota)).includes(c.id);
    const planned = hasPlannedAbsence(c.id, dateKey);
    const reason = planned ? getPlannedAbsenceReason(c.id, dateKey) : null;
    const isOverridden = overriddenIds.has(c.id) && currentAlloc?.hasOverride;
    const lines = [];

    if (c.longTermAbsent) {
      lines.push('Flagged as long-term absent, so always counted as away until that flag is cleared.');
    } else if (status === 'present') {
      lines.push(isOverridden
        ? `Manually set to present for today — this overrides the usual ${selectedDay} pattern.`
        : `Works ${selectedDay}s in the working-days grid, and has no leave recorded for today.`);
    } else if (status === 'dayOff') {
      lines.push(`Does not work ${selectedDay}s in the working-days grid, so today is a normal day off — no cover needed.`);
    } else if (status === 'absent') {
      if (isOverridden) {
        lines.push('Manually set to absent for today.');
      } else if (planned) {
        lines.push(`On planned leave today${reason ? ` — ${reason}` : ''}.`);
      } else if (!scheduled) {
        lines.push(`Normally off on ${selectedDay}s, but flagged for cover because an adjacent working day falls inside a leave block.`);
      } else {
        lines.push('Counted as away because today sits inside a multi-day leave block (the leave was recorded on a working day either side).');
      }
    }

    if (csvMismatches.presentNoCSV.has(c.id)) lines.push('Heads-up: no sessions found for them in the latest EMIS upload.');
    if (csvMismatches.absentHasCSV.has(c.id)) lines.push('Heads-up: EMIS shows sessions booked for them today.');

    // Audit trail: who last changed this clinician's status for this day.
    const ovMeta = data?.dailyOverrides?.[`${dateKey}-${selectedDay}`]?.meta?.[c.id];
    if (ovMeta?.at) {
      const when = new Date(ovMeta.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      lines.push(`Changed by ${ovMeta.by || 'a colleague'} \u00b7 ${when}`);
    }
    return { status, lines };
  };

  const handleGenerate = () => {
    const dateKey = getDateKey();
    const day = selectedDay;
    const cls = ensureArray(data.clinicians).filter(c => c.buddyCover && c.status !== 'left' && c.status !== 'administrative');
    const status = computeDayStatus(data, dateKey, day);
    const { allocations, dayOffAllocations } = generateBuddyAllocations(cls, status.present, status.absent, status.dayOff, data.settings || DEFAULT_SETTINGS);
    const newHistory = { ...data.allocationHistory, [dateKey]: { date: dateKey, day, allocations, dayOffAllocations, presentIds: status.present, absentIds: status.absent, dayOffIds: status.dayOff, hasOverride: status.hasOverride, overriddenIds: status.overriddenIds } };
    saveData(logEvent({ ...data, allocationHistory: newHistory }, 'allocation', `Buddy allocation generated for ${day} ${dateKey}`));
  };

  const handleCopyDay = () => {
    const dateKey = getDateKey();
    const date = new Date(dateKey + 'T12:00:00');
    if (!currentAlloc) return;
    const grouped = groupAllocationsByCovering(currentAlloc.allocations || {}, currentAlloc.dayOffAllocations || {}, currentAlloc.presentIds || []);

    let s = 'BUDDY COVER\n';
    s += `${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    // Public URL line — included only if this practice has opted in to
    // the public buddy cover page (BuddyCoverSettings → "Public buddy
    // cover page" toggle). Otherwise the URL would 404 for whoever
    // clicked it from EMIS, so we omit it. Environment-aware host —
    // uses window.location.origin so previews don't paste production
    // URLs into clipboards.
    const slug = data?._v4?.practiceSlug;
    if (data?._v4?.practiceBuddyCoverPublic && slug && typeof window !== 'undefined') {
      const host = window.location.host.replace(/^app\./, ''); // strip app. subdomain if present
      s += `https://${host}/buddy/${slug}\n\n`;
    } else {
      s += '\n';
    }

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
    // See handleCopyDay for the same logic — URL included only when
    // the practice has opted in to the public buddy cover page.
    const slug = data?._v4?.practiceSlug;
    if (data?._v4?.practiceBuddyCoverPublic && slug && typeof window !== 'undefined') {
      const host = window.location.host.replace(/^app\./, '');
      s += `https://${host}/buddy/${slug}\n\n`;
    } else {
      s += '\n';
    }

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

  // ═══ Weekly inconsistency review ═══
  // Clinician-days where the buddy board and the EMIS CSV disagree, across
  // this week's editable (non-past) days. A row disappears once someone makes
  // an explicit Present/Absent decision (which also stamps who + when).
  // Suggestions: a clinician with NO EMIS sessions on every CSV-covered,
  // non-past day they are due in this week has effectively disappeared from
  // EMIS "moving forward" - that pattern deserves a proactive suggestion
  // (left? long-term sick?) rather than a pile of identical daily rows.
  // One-off single-day mismatches stay as simple Present/Absent rows.
  // Inline status-transition confirm state for the inconsistency panel:
  // { id, key } when a row's "Left" / "Sick" option is open, plus the
  // editable cover period in weeks.
  const [transitionOpen, setTransitionOpen] = useState(null);
  const [transitionWeeks, setTransitionWeeks] = useState(9);
  const [suggestMenuOpen, setSuggestMenuOpen] = useState(null); // clinicianId

  const confirmTransition = (clinicianId) => {
    const t = STATUS_TRANSITIONS[transitionOpen?.key];
    if (!t) return;
    const next = applyTransition(data, clinicianId, t.key, {
      weeks: transitionWeeks,
      by: data?._v4?.userDisplayName || null,
    });
    saveData(next);
    // Direct row write - the bulk route cannot persist clinician fields.
    const marker = (Array.isArray(next.clinicians) ? next.clinicians : []).find((c) => c.id === clinicianId)?.windDown || null;
    persistWindDown(clinicianId, marker);
    setTransitionOpen(null);
  };

  const weekMismatches = (() => {
    if (!huddleData || !canEdit) return [];
    const out = [];
    DAYS.forEach((day) => {
      const dateKey = getDateKeyForDay(day);
      if (isPastDate(dateKey)) return;
      const csvDateStr = toHuddleDateStr(new Date(dateKey + 'T12:00:00'));
      const csvClinicians = getCliniciansForDate(huddleData, csvDateStr);
      if (csvClinicians.length === 0) return; // no CSV evidence for that day
      const dayMeta = data?.dailyOverrides?.[`${dateKey}-${day}`]?.meta || {};
      cliniciansList.forEach((c) => {
        if (windDownFor(c, dateKey)) return; // wind-down active - mismatches are expected
        const covHalf = findCoveringAbsence(data, c.id, dateKey);
        if (covHalf?.session === 'am' || covHalf?.session === 'pm') return; // half-day leave - other half in EMIS is expected
        if (dayMeta[c.id]) return; // explicitly decided — reviewed
        const status = getClinicianStatus(c.id, day);
        const inCSV = csvClinicians.some((csv) => matchesStaffMember(csv, c));
        if (status === 'present' && !inCSV) out.push({ id: c.id, name: c.name, day, type: 'presentNoCSV' });
        else if (status === 'absent' && inCSV) out.push({ id: c.id, name: c.name, day, type: 'absentHasCSV' });
      });
    });
    return out;
  })();

  // Wind-down ERROR detection: someone marked as LEFT should not be in
  // EMIS at all. If they are, something has gone wrong - surface it
  // loudly rather than suppressing it.
  const cliniciansListWithWindDown = ensureArray(data.clinicians).filter((c) => c.windDown && c.status !== 'left');
  const windDownAlerts = (canEdit && huddleData) ? getWindDownAlerts(data, huddleData, { getDateKeyForDay }) : [];

  // REVERSE inconsistency (user request): a clinician who regularly HAS
  // EMIS sessions on a weekday that is not one of their working days.
  // The system works out which day it is by scanning the last 28 days of
  // CSV history: 2+ occurrences of sessions on that weekday, while the
  // rota says not working, earns a suggestion to add the working day.
  // Session pattern labels for the viewed day (shared engine - same
  // source as the working days grid and locum spend).
  const dayPatternLabels = useMemo(() => {
    if (!huddleData) return {};
    const out = {};
    for (const c of cliniciansList) {
      const eff = getEffectivePattern(huddleData, c, data?.huddleSettings || {}, { data });
      out[c.id] = patternDayLabel(eff[selectedDay]);
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huddleData, cliniciansList, data?.huddleSettings?.sessionPatternOverrides, selectedDay]);

  const rotaSuggestions = useMemo(() => {
    if (!canEdit || !huddleData?.dates?.length) return [];
    const ignores = data?.huddleSettings?.rotaSuggestionIgnores || {};
    const dayNums = { Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5 };
    const cutoff = Date.now() - 28 * 86400000;
    const byDay = {};
    for (const ds of huddleData.dates) {
      const d = parseHuddleDateStr(ds);
      if (!d || isNaN(d) || d.getTime() < cutoff || d.getTime() > Date.now()) continue;
      const dayName = Object.keys(dayNums).find((k) => dayNums[k] === d.getDay());
      if (!dayName) continue;
      (byDay[dayName] = byDay[dayName] || []).push(ds);
    }
    const out = [];
    for (const c of cliniciansList) {
      if (c.windDown) continue;
      for (const [dayName, dsList] of Object.entries(byDay)) {
        if (getScheduledSessions(data, c.id, dayName).length) continue;
        if (ignores[`${c.id}-${dayName}`]) continue;
        let hits = 0;
        for (const ds of dsList) {
          const names = getCliniciansForDate(huddleData, ds);
          if (names.some((n) => matchesStaffMember(n, c))) hits += 1;
        }
        if (hits >= 2) out.push({ clinicianId: c.id, name: c.name, dayName, hits, weeks: dsList.length });
      }
    }
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [huddleData, data?.weeklyRota, data?.huddleSettings?.rotaSuggestionIgnores, cliniciansList, canEdit]);

  const applyRotaSuggestion = (sug) => {
    if (!canEdit) return;
    // Sessions from what EMIS actually showed on those days (fallback
    // morning + afternoon) - written to the authoritative sessionRota,
    // with the day-level view re-derived in the same save.
    const c = cliniciansList.find((x) => x.id === sug.clinicianId);
    const inferred = c && huddleData ? getEffectivePattern(huddleData, c, data?.huddleSettings || {})[sug.dayName]?.slots : null;
    const slots = inferred?.length ? inferred : ['M', 'A'];
    const sessionRota = { ...(data.sessionRota || {}), [sug.clinicianId]: { ...(data.sessionRota?.[sug.clinicianId] || {}), [sug.dayName]: slots } };
    const rota = { ...(data.weeklyRota || {}) };
    rota[sug.dayName] = [...new Set([...ensureArray(rota[sug.dayName]), sug.clinicianId])];
    saveData(logEvent({ ...data, sessionRota, weeklyRota: rota }, 'staff',
      `${sug.dayName} added as a working day for ${sug.name} (${slots.join('+')}) - EMIS showed sessions on ${sug.hits} of the last ${sug.weeks} ${sug.dayName}s`));
  };

  const ignoreRotaSuggestion = (sug) => {
    if (!canEdit) return;
    const hs = data.huddleSettings || {};
    const ignores = { ...(hs.rotaSuggestionIgnores || {}), [`${sug.clinicianId}-${sug.dayName}`]: true };
    saveData({ ...data, huddleSettings: { ...hs, rotaSuggestionIgnores: ignores } }, false);
  };

  const undoWindDown = (clinicianId) => {
    if (!canEdit) return;
    const c = cliniciansList.find((x) => x.id === clinicianId) || (data.clinicians || []).find?.((x) => x.id === clinicianId);
    const label = c?.windDown?.type === 'sick' ? 'Long term absence' : 'Has left';
    if (!window.confirm(`Undo the ${label} status for ${c?.name || 'this clinician'}? The wind-down cover will be removed and they return to normal.`)) return;
    saveData(undoTransition(data, clinicianId, { by: data?._v4?.userDisplayName || null }));
    persistWindDown(clinicianId, null);
    setWdMenuOpen(null);
  };

  const adjustWindDown = (clinicianId) => {
    if (!canEdit) return;
    const c = (data.clinicians || []).find((x) => x.id === clinicianId);
    if (!c?.windDown) return;
    const v = window.prompt('New end date for the wind-down (YYYY-MM-DD):', c.windDown.endDate);
    if (!v) { setWdMenuOpen(null); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) { window.alert('Please use the format YYYY-MM-DD, for example 2026-10-01.'); return; }
    const adjusted = adjustTransition(data, clinicianId, v.trim(), { by: data?._v4?.userDisplayName || null });
    saveData(adjusted);
    const adjMarker = (Array.isArray(adjusted.clinicians) ? adjusted.clinicians : []).find((cc) => cc.id === clinicianId)?.windDown || null;
    persistWindDown(clinicianId, adjMarker);
    setWdMenuOpen(null);
  };

  // Group this week's presentNoCSV mismatches by clinician; if someone is
  // missing from EMIS on 2+ days AND on every day we have CSV evidence for
  // them, promote them to a suggestion card and drop their daily rows.
  const { suggestions, singleMismatches } = (() => {
    const byClin = {};
    weekMismatches.forEach((m) => {
      if (m.type !== 'presentNoCSV') return;
      (byClin[m.id] = byClin[m.id] || { id: m.id, name: m.name, days: [] }).days.push(m.day);
    });
    const suggested = Object.values(byClin).filter((g) => g.days.length >= 2);
    const suggestedIds = new Set(suggested.map((g) => g.id));
    return {
      suggestions: suggested,
      singleMismatches: weekMismatches.filter((m) => !(m.type === 'presentNoCSV' && suggestedIds.has(m.id))),
    };
  })();

  // This week's decisions (audit history for the panel): every stamped manual
  // presence decision across the week, newest first.
  const decidedThisWeek = (() => {
    const out = [];
    DAYS.forEach((day) => {
      const dateKey = getDateKeyForDay(day);
      const meta = data?.dailyOverrides?.[`${dateKey}-${day}`]?.meta || {};
      Object.entries(meta).forEach(([cid, m]) => {
        const c = cliniciansList.find((cl) => cl.id === cid);
        out.push({ id: cid, name: c?.name || 'Unknown', day, to: m.to, by: m.by, at: m.at });
      });
    });
    return out.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  })();

  return (
    <div className="-m-4 lg:-m-6 min-h-screen buddy-scale-down" style={{background:'linear-gradient(135deg, var(--g-ink) 0%, var(--g-ink-2) 40%, var(--g-ink) 100%)'}}>
    <div className="max-w-6xl xl:max-w-[1480px] mx-auto p-4 lg:p-6 space-y-4">
      {/* ═══ HEADER ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" style={{fontFamily:"'Outfit',sans-serif", color:'var(--g-pill-text)'}}>Buddy Cover</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data.lastSyncTime ? `TeamNet synced: ${new Date(data.lastSyncTime).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'TeamNet not synced'}
            {syncStatus && <span className="ml-2 text-emerald-600">{syncStatus}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Link to the standing working pattern editor. Lives in
              Practice → Clinicians → Working days grid since v4.14.0
              (the in-dashboard team-rota was retired with the rest of
              the sidebar Clinicians page). Deep-links via ?grid=open
              so the modal opens on arrival rather than making the user
              find the button. */}
          {data?._v4?.practiceSlug && (
            <a
              href={`/v4/practice/${data._v4.practiceSlug}?tab=clinicians&grid=open`}
              className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 flex items-center gap-1.5 transition-colors hover:bg-white/10"
              style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)' }}
              title="Open the standing weekly pattern editor for the buddy-cover team"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 4v18M16 4v18"/></svg>
              Working days grid
            </a>
          )}
          <button
            onClick={() => setHistoryOpen(true)}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 flex items-center gap-1.5 transition-colors hover:bg-white/10"
            style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)' }}
            title="Who changed what, and when — with revert"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            History
          </button>
          {canEdit && (
          <button onClick={handleCopyWeek} className="px-3 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5" style={{background:"rgba(16,185,129,0.6)",border:"1px solid rgba(16,185,129,0.3)"}}>Copy Week</button>
          )}
          {canEdit && (isGenerating ? (
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
                await saveData(nd, false);
                setDataVersion(v => v + 1);
              }
              setIsGenerating(false);
              setSyncStatus(`Done — ${generated} days`); setTimeout(() => setSyncStatus(''), 4000);
            }} className="px-3 py-2 rounded-lg text-sm font-medium text-white" style={{background:"rgba(124,58,237,0.7)",border:"1px solid rgba(124,58,237,0.3)"}}>Generate 4 Weeks</button>
          ))}
        </div>
      </div>

      <div className="xl:flex xl:items-start xl:gap-5">
      <div className="flex-1 min-w-0 space-y-4">
      {/* First-visit prompt: if no clinicians are in the buddy-cover pool
          yet, the schedule below will be empty and confusing. Point the
          user straight to clinician setup so they can opt people in. */}
      {cliniciansList.length === 0 && (
        <div className="rounded-xl p-5" style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.3)' }}>
          <div className="flex items-start gap-3">
            <div className="text-2xl leading-none">👋</div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-white">No one is in the buddy-cover pool yet</h3>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                Buddy cover works out who covers absent colleagues, but first you need to choose which clinicians are part of the pool. Head to clinician setup and switch on &ldquo;in buddy system&rdquo; for the GPs and other clinicians who take part. GP partners and salaried GPs are switched on by default.
              </p>
              {data?._v4?.practiceSlug && (
                <a
                  href={`/v4/practice/${data._v4.practiceSlug}?tab=clinicians&grid=open`}
                  className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:brightness-110"
                  style={{ background: 'rgba(124,58,237,0.8)', border: '1px solid rgba(124,58,237,0.4)' }}
                >
                  Set up clinicians →
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ WEEK STRIP ═══ */}
      <div className="rounded-xl overflow-hidden" style={{background:'var(--g-panel-2)',border:'1px solid var(--g-border)'}}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{background:'var(--g-panel-2)',borderBottom:'1px solid var(--g-tile)'}}>
          <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() - 7 * 86400000))} className="px-2.5 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10" style={{border:'1px solid var(--g-label-faint)'}}>◀</button>
          <div className="text-sm font-semibold text-white">{formatWeekRange(selectedWeek)}</div>
          <div className="flex items-center gap-2">
            {selectedWeek.getTime() !== getActiveWeekStart().getTime() && (
              <button onClick={() => { setSelectedWeek(getActiveWeekStart()); setSelectedDay(getCurrentDay()); }} className="text-xs text-white/70 hover:text-white font-medium">This week</button>
            )}
            <button onClick={() => setSelectedWeek(new Date(selectedWeek.getTime() + 7 * 86400000))} className="px-2.5 py-1 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/10" style={{border:'1px solid var(--g-label-faint)'}}>▶</button>
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
                background: isSel ? 'rgba(124,58,237,0.15)' : 'var(--g-panel-soft)',
                borderBottom: isSel ? '4px solid #7c3aed' : todayDate ? '4px solid #6d28d9' : '4px solid transparent',
                boxShadow: isSel ? 'inset 0 0 0 1px rgba(124,58,237,0.3)' : 'none',
                height: 320,
              }}>
                {/* Day header */}
                <div className="px-3 py-2 flex items-center justify-between flex-shrink-0">
                  <div>
                    <div className="text-lg font-bold" style={{color: isSel ? '#a78bfa' : closed ? 'var(--g-text-faint)' : 'var(--g-text-hi)'}}>{day.slice(0, 3)}</div>
                    <div className="text-sm" style={{color: isSel ? '#a78bfa' : 'var(--g-text-faint)'}}>{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                  </div>
                  {closed ? (
                    <span className="text-xs px-2.5 py-0.5 rounded-full font-medium" style={{background:'rgba(100,116,139,0.15)',color:'var(--g-text-mid)'}}>Closed</span>
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
                          <svg width="6" height="6" viewBox="0 0 6 6" style={{flexShrink:0,opacity:0.3}}><path d="M1 3h4M3 1l2 2-2 2" style={{stroke:'var(--g-text-mid)'}} strokeWidth="1" fill="none"/></svg>
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
                    <div className="pt-2 flex gap-1.5 flex-wrap" style={{borderTop:'1px solid var(--g-border)'}}>
                      <span className="text-xs text-slate-500 mr-1" style={{lineHeight:'24px'}}>Leave:</span>
                      {dayAbs.slice(0, 4).map((a, i) => {
                        const ccStyle = a.reason === 'Holiday' || a.reason === 'Annual Leave' ? {background:'rgba(59,130,246,0.15)',color:'#60a5fa'} : a.reason === 'Training' || a.reason === 'Study' ? {background:'rgba(245,158,11,0.15)',color:'#fbbf24'} : a.reason === 'Sick' ? {background:'rgba(239,68,68,0.15)',color:'#f87171'} : {background:'rgba(100,116,139,0.15)',color:'var(--g-text-mid)'};
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
          {canEdit && !isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey())} className="mt-4 text-sm text-purple-600 hover:text-purple-800">Mark as open →</button>}
        </div>
      ) : (
        <>
          {/* Attendance */}
          <div className="rounded-xl overflow-hidden" className="glass" style={{borderRadius:'var(--r-lg)'}}>
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
                {canEdit && !isPastDate(getDateKey()) && <button onClick={() => toggleClosedDay(getDateKey(), 'Bank Holiday')} className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded" style={{border:'1px solid var(--g-divider)'}}>Mark closed</button>}
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
                const wd = windDownFor(c, getDateKey());
                const halfDay = (() => { const cov = findCoveringAbsence(data, c.id, getDateKey()); return (cov?.session === 'am' || cov?.session === 'pm') ? cov.session : null; })();
                const outlineCol = isOverridden ? '#f59e0b' : hasCsvFlag ? '#3b82f6' : null;
                const cardBg = status === 'present' ? 'rgba(16,185,129,0.12)' : status === 'absent' ? 'rgba(239,68,68,0.12)' : 'rgba(251,191,36,0.08)';
                const cardBorder = status === 'present' ? '#10b98140' : status === 'absent' ? '#ef444440' : '#f59e0b30';
                return (
                  <div
                    key={c.id}
                    className="rounded-lg px-3 py-2.5"
                    onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHovered({ id: c.id, rect: { top: r.top, left: r.left, width: r.width, height: r.height } }); }}
                    onMouseLeave={() => setHovered(h => (h?.id === c.id ? null : h))}
                    onClick={canEdit && !past ? () => togglePresence(c.id, selectedDay) : undefined}
                    style={{opacity: wd ? 0.55 : 1, background:cardBg, border:`1px solid ${cardBorder}`, cursor: canEdit && !past ? 'pointer' : 'help', ...(outlineCol?{outline:`2px solid ${outlineCol}`,outlineOffset:'-2px'}:{})}}
                  >
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
                            {halfDay && <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{background:'#38bdf825', border:'1px solid #38bdf850', color:'#7dd3fc'}}>{halfDay === 'pm' ? 'PM off - in AM' : 'AM off - in PM'}</span>}
                            {dayPatternLabels[c.id] && dayPatternLabels[c.id] !== 'Not in' && <span className="flex-shrink-0 text-[10px]" style={{color:'#64748b'}}>{dayPatternLabels[c.id]}</span>}
                            {wd && <span className="relative flex-shrink-0">
                              <button
                              title={canEdit ? 'Click to adjust or undo this status' : windDownLabel(wd)}
                              onClick={canEdit ? (e) => { e.stopPropagation(); setWdMenuOpen(m => m === c.id ? null : c.id); } : undefined}
                              className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                              style={{background:'#64748b25', border:'1px solid #64748b50', color:'#94a3b8', cursor: canEdit ? 'pointer' : 'default'}}>{windDownLabel(wd)}</button>
                              {wdMenuOpen === c.id && canEdit && (
                                <span className="absolute left-0 top-full mt-1 z-20 flex flex-col rounded-md overflow-hidden"
                                  style={{background:'#1e293b', border:'1px solid rgba(255,255,255,0.15)', minWidth:150}}
                                  onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => adjustWindDown(c.id)} className="px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-white/10">Adjust end date</button>
                                  <button onClick={() => undoWindDown(c.id)} className="px-3 py-1.5 text-left text-[11px] hover:bg-white/10" style={{color:'#fca5a5'}}>Undo status</button>
                                </span>
                              )}
                            </span>}
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
                        <button onClick={canEdit ? (e) => { e.stopPropagation(); togglePresence(c.id, selectedDay); } : undefined} className="flex items-center gap-1.5 rounded-full flex-shrink-0 transition-all duration-150" style={{
                          padding: '5px 14px',
                          background: status === 'present' ? '#10b98130' : status === 'absent' ? '#ef444430' : '#f59e0b20',
                          border: `1px solid ${status === 'present' ? '#10b98160' : status === 'absent' ? '#ef444460' : '#f59e0b40'}`,
                          cursor: canEdit ? 'pointer' : 'default',
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
                <div className="flex items-center gap-4 mt-3 pt-3 text-xs text-slate-500 flex-wrap" style={{borderTop:'1px solid var(--g-divider)'}}>
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
          <div className="rounded-xl overflow-hidden" style={{background:'var(--g-panel-2)',border:'1px solid var(--g-border)'}}>
            <div className="flex items-center justify-between" style={{background:'var(--g-panel-2)',padding:'12px 20px',borderBottom:'1px solid var(--g-tile)'}}>
              <div>
                <h2 className="text-base font-semibold text-white">Buddy Allocations — {selectedDay}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Workload balanced across present clinicians</p>
              </div>
              <div className="flex items-center gap-2">
                {canEdit && hasAllocations && <button onClick={handleCopyDay} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white flex items-center gap-1.5" style={{background:'rgba(16,185,129,0.6)',border:'1px solid rgba(16,185,129,0.3)'}}>Copy Day</button>}
                {canEdit && !isPastDate(getDateKey()) && <button onClick={handleGenerate} disabled={presentClinicians.length === 0} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40" style={{background:'rgba(124,58,237,0.7)',border:'1px solid rgba(124,58,237,0.3)'}}>{hasAllocations ? 'Regenerate' : 'Generate'}</button>}
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
                      <tr style={{borderBottom:"1px solid var(--g-border)"}}>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide">Covering</th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide"><span className="text-red-400">File & Action</span><span className="text-slate-400 font-normal ml-1">(absent)</span></th>
                        <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-400 uppercase tracking-wide"><span className="text-amber-400">View Only</span><span className="text-slate-400 font-normal ml-1">(day off)</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Filter to clinicians who are actually in the buddy
                        // system. Without this filter, anyone present in the
                        // rota shows up in the allocations table as a
                        // "Covering" row, including registrars/ANPs/anyone
                        // with buddyCover=false — even though they're
                        // (correctly) absent from the top mini grid which
                        // uses cliniciansList.
                        //
                        // Reclassification: the saved allocation captures who's
                        // assigned to cover whom (which is the bit we actually
                        // want to preserve), but its absent/dayOff split can
                        // go stale. Specifically: if a clinician was a
                        // regular day-off person at generation time and has
                        // since picked up an adjacent planned absence, the
                        // computeDayStatus upgrade logic moves them from
                        // dayOff to absent. The top mini grid uses live
                        // status and shows them red, but the saved
                        // allocation still has them in dayOffAllocations →
                        // bottom table shows them in the View Only column.
                        //
                        // Walk each person who was assigned (whether to the
                        // absent or dayOff column originally) and recheck
                        // their current status. People now present don't
                        // need cover at all and disappear from both
                        // columns; people now absent move into the File &
                        // Action column; people still on a day-off stay in
                        // View Only. Top and bottom now always agree.
                        const buddyIds = new Set(cliniciansList.map(c => c.id));
                        const rows = presentIds.filter(id => buddyIds.has(id)).map(id => {
                          const c = getClinicianById(id);
                          const t = groupedAllocations[id] || { absent: [], dayOff: [] };
                          const reclassified = { absent: [], dayOff: [] };
                          const allAssigned = [...(t.absent || []), ...(t.dayOff || [])];
                          for (const aid of allAssigned) {
                            if (!buddyIds.has(aid)) continue;
                            const liveStatus = getClinicianStatus(aid, selectedDay);
                            if (liveStatus === 'absent') reclassified.absent.push(aid);
                            else if (liveStatus === 'dayoff') reclassified.dayOff.push(aid);
                            // status === 'present' → don't render at all
                          }
                          return c ? { id, clinician: c, tasks: reclassified, canCover: c.canProvideCover !== false, hasAllocs: reclassified.absent.length > 0 || reclassified.dayOff.length > 0 } : null;
                        }).filter(Boolean);
                        rows.sort((a, b) => { if (a.canCover && !b.canCover) return -1; if (!a.canCover && b.canCover) return 1; if (a.canCover && b.canCover) { if (a.hasAllocs && !b.hasAllocs) return -1; if (!a.hasAllocs && b.hasAllocs) return 1; } return 0; });
                        return rows.map(({ clinician, tasks, canCover }) => {
                          // Build a set of (absent person id) → override info
                          // for this coverer's badges, so we can mark overridden
                          // ones visually + show the reason on hover.
                          const overrideByAbsentId = {};
                          for (const ov of (currentAlloc?.manualOverrides || [])) {
                            if (ov.toCovererId === clinician.id) {
                              overrideByAbsentId[ov.absentId] = ov;
                            }
                          }
                          const renderBadge = (id, type, bg) => {
                            const x = getClinicianById(id);
                            if (!x) return null;
                            const ov = overrideByAbsentId[id];
                            // Past days are read-only: you can't rewrite who
                            // covered whom on a day that has already happened.
                            const canReassign = canEdit && !isPastDate(getDateKey());
                            const title = ov
                              ? `Manual override: ${ov.reason} — reassigned from previous coverer`
                              : (canReassign ? 'Click to reassign' : '');
                            return (
                              <span
                                key={id}
                                onClick={canReassign ? () => setOverrideTarget({
                                  absentId: id,
                                  coverType: type,
                                  currentCovererId: clinician.id,
                                }) : undefined}
                                title={title}
                                className="inline-flex items-center justify-center rounded-md text-sm font-bold text-white"
                                style={{
                                  padding: '4px 8px',
                                  background: bg,
                                  minWidth: 32,
                                  cursor: canReassign ? 'pointer' : 'default',
                                  border: ov ? '1.5px dashed var(--g-marker)' : 'none',
                                  position: 'relative',
                                }}
                              >
                                {x.initials}
                                {ov && (
                                  <span style={{
                                    position: 'absolute', top: -4, right: -4,
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: '#a78bfa',
                                    border: '1.5px solid var(--g-surface)',
                                  }} />
                                )}
                              </span>
                            );
                          };
                          return (
                            <tr key={clinician.id} style={{borderBottom:"1px solid var(--g-tile)"}} className={!canCover ? "opacity-50" : ""}>
                              <td className="py-3 px-4"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{background:"#10b981",fontFamily:"'Outfit',sans-serif"}}>{clinician.initials}</div><div><div className="text-sm font-medium text-slate-200">{clinician.name}</div><div className="text-xs text-slate-500">{clinician.role}</div></div></div></td>
                              <td className="py-3 px-4">{tasks.absent.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.absent.map(id => renderBadge(id, 'absent', '#ef4444'))}</div> : <span className="text-slate-600">—</span>}</td>
                              <td className="py-3 px-4">{tasks.dayOff.length > 0 ? <div className="flex flex-wrap gap-1">{tasks.dayOff.map(id => renderBadge(id, 'dayOff', '#f59e0b'))}</div> : <span className="text-slate-600">—</span>}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table></div>
                <div className="mt-4 pt-4 flex gap-6 text-xs text-slate-500" style={{borderTop:"1px solid var(--g-border)"}}>
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

      <ChangeHistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} changeLog={data.changeLog} canEdit={canEdit} onRevert={onRevertChange} />

      {overrideTarget && currentAlloc && (
        <BuddyOverrideModal
          open={true}
          onClose={() => setOverrideTarget(null)}
          dateKey={getDateKey()}
          allocationEntry={currentAlloc}
          absentClinicianId={overrideTarget.absentId}
          coverType={overrideTarget.coverType}
          currentCovererId={overrideTarget.currentCovererId}
          cliniciansList={ensureArray(data.clinicians)}
          onSave={async (newEntry, override) => {
            try {
              // Persist the new allocation entry via the bulk save path
              // — mutation 4 picks up changes to allocationHistory and
              // upserts buddy_allocations on the changed date.
              const dk = getDateKey();
              const newHistory = { ...(data.allocationHistory || {}), [dk]: newEntry };
              saveData({ ...data, allocationHistory: newHistory });

              // Audit trail — separate insert into audit_events. Direct
              // supabase call (the bulk endpoint doesn't surface this
              // table). Best-effort: if it fails we still keep the
              // allocation change, just log a warning since the user
              // already got the operational win.
              const sb = supabaseRef.current;
              if (sb) {
                const practiceId = data?._v4?.practiceId;
                const userId = data?._v4?.userId;
                if (practiceId) {
                  const { error: aErr } = await sb.from('audit_events').insert({
                    practice_id: practiceId,
                    user_id: userId || null,
                    event_type: 'buddy_allocations_edited',
                    description: `Manually reassigned ${override.type === 'dayOff' ? 'day-off' : 'absent'} cover`,
                    details: { date: dk, override },
                  });
                  if (aErr) console.warn('audit_events insert failed', aErr);
                }
              }

              if (toast) toast('Buddy cover reassigned', 'success', 2000);
              return { ok: true };
            } catch (e) {
              return { error: e?.message || 'Save failed' };
            }
          }}
        />
      )}

      </div>

      {canEdit && (
        <aside className="xl:w-[300px] xl:shrink-0 xl:sticky xl:top-4 space-y-3">
          <div className="rounded-xl p-4 bg-card border border-edge">
            <div className="text-body font-semibold text-hi mb-2">This week&apos;s inconsistencies</div>
              {(() => {
                const active = cliniciansListWithWindDown;
                if (!active.length) return null;
                return (
                  <div className="mb-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(100,116,139,0.12)', border: '1px solid rgba(100,116,139,0.3)' }}>
                    <div className="text-caption font-semibold text-mid mb-1">Wind-downs in progress</div>
                    {active.map((c) => (
                      <div key={c.id} className="text-caption text-mid leading-normal">
                        {c.name} - {c.windDown.type === 'sick' ? 'long term absence' : 'leaving'}, until {new Date(c.windDown.endDate + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </div>
                    ))}
                  </div>
                );
              })()}
            {!huddleData ? (
              <div className="text-meta text-mid">Upload the appointment CSV to check the board against EMIS.</div>
            ) : (suggestions.length === 0 && singleMismatches.length === 0 && windDownAlerts.length === 0 && rotaSuggestions.length === 0) ? (
              <div className="text-body-sm" style={{ color: '#6ee7b7' }}>✓ No inconsistencies — the board matches EMIS for this week&apos;s editable days.</div>
            ) : (
              <>
              {windDownAlerts.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  {windDownAlerts.map((a) => (
                    <div key={a.clinicianId} className="px-3 py-2.5 rounded-lg border" style={{ background: '#ef444418', borderColor: '#ef444460' }}>
                      <div className="text-body-sm font-semibold" style={{ color: '#fca5a5' }}>{a.name} - marked as left, but EMIS still shows sessions</div>
                      <div className="text-caption mt-0.5 leading-normal text-mid">
                        Someone who has left should not appear in EMIS at all, yet they have booked sessions on {a.days.join(', ')}. Something has gone wrong - either their EMIS rota was not removed, or the status was set in error.
                      </div>
                      <button onClick={() => undoWindDown(a.clinicianId)}
                        className="mt-2 px-2.5 py-1 rounded-md text-caption font-semibold"
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', color: '#e2e8f0' }}>
                        Undo Has left
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {rotaSuggestions.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  {rotaSuggestions.map((sug) => (
                    <div key={`${sug.clinicianId}-${sug.dayName}`} className="px-3 py-2.5 rounded-lg border" style={{ background: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.4)' }}>
                      <div className="text-body-sm font-semibold" style={{ color: '#86efac' }}>{sug.name} - {sug.dayName} looks like a working day</div>
                      <div className="text-caption mt-0.5 leading-normal text-mid">
                        EMIS shows booked sessions on {sug.hits} of the last {sug.weeks} {sug.dayName}s, but {sug.dayName} is not one of their working days.
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => applyRotaSuggestion(sug)}
                          className="px-2.5 py-1 rounded-md text-caption font-semibold"
                          style={{ background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.5)', color: '#86efac' }}>
                          Add {sug.dayName}
                        </button>
                        <button onClick={() => ignoreRotaSuggestion(sug)}
                          className="px-2.5 py-1 rounded-md text-caption font-semibold"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#94a3b8' }}>
                          Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {suggestions.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  {suggestions.map((g) => (
                    <div key={g.id} className="px-3 py-2.5 rounded-lg border" style={{ background: 'rgba(251,191,36,0.06)', borderColor: 'rgba(251,191,36,0.4)' }}>
                      <div className="text-body-sm font-semibold text-hi">{g.name}</div>
                      <div className="text-caption mt-0.5 leading-normal" style={{ color: '#fcd34d' }}>
                        No booked EMIS sessions on any of their days this week ({g.days.join(', ')}).
                      </div>
                      <div className="text-caption text-mid mt-1 mb-2 leading-normal">
                        If they have left or are off long-term, set a status so their work keeps getting covered:
                      </div>
                      {transitionOpen?.id !== g.id && (
                        <div className="relative">
                          <button
                            onClick={() => setSuggestMenuOpen(suggestMenuOpen === g.id ? null : g.id)}
                            className="text-caption font-semibold px-3 py-1.5 rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                            style={{ background: 'rgba(103,232,249,0.12)', color: '#67e8f9', border: '1px solid rgba(103,232,249,0.35)' }}
                          >Set status <span style={{ fontSize: 9 }}>▾</span></button>
                          {suggestMenuOpen === g.id && (
                            <div className="mt-1.5 rounded-lg overflow-hidden border border-edge bg-card">
                              {Object.values(STATUS_TRANSITIONS).map((t) => (
                                <button
                                  key={t.key}
                                  onClick={() => {
                                    setSuggestMenuOpen(null);
                                    setTransitionOpen({ id: g.id, key: t.key });
                                    setTransitionWeeks(t.defaultWeeks);
                                  }}
                                  className="block w-full text-left px-3 py-2 text-caption cursor-pointer"
                                  style={{ color: '#e2e8f0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--g-divider)' }}
                                >
                                  <span className="font-semibold block">{t.label}</span>
                                  <span className="block mt-0.5" style={{ color: '#94a3b8' }}>{t.key === 'left_winddown' ? 'Covered while their work winds down, then removed' : 'Absent for an estimated period, auto-back when EMIS shows them'}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {transitionOpen?.id === g.id && STATUS_TRANSITIONS[transitionOpen.key] && (
                        <div className="px-3 py-2.5 rounded-lg bg-field border border-edge">
                          <div className="text-caption text-hi font-semibold mb-1.5">
                            {STATUS_TRANSITIONS[transitionOpen.key].label}: {g.name}
                          </div>
                          <label className="flex items-center gap-2 text-caption text-mid mb-2">
                            Period:
                            <input
                              type="number" min="1" max="52"
                              value={transitionWeeks}
                              onChange={(e) => setTransitionWeeks(e.target.value)}
                              className="w-14 px-1.5 py-1 rounded-md bg-card border border-edge text-hi text-caption"
                            />
                            weeks
                          </label>
                          <div className="text-caption text-mid mb-2 leading-normal">
                            {STATUS_TRANSITIONS[transitionOpen.key].describe(
                              Math.max(1, Math.min(52, Number(transitionWeeks) || STATUS_TRANSITIONS[transitionOpen.key].defaultWeeks)),
                              new Date(Date.now() + Math.max(1, Math.min(52, Number(transitionWeeks) || STATUS_TRANSITIONS[transitionOpen.key].defaultWeeks)) * 7 * 86400000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => confirmTransition(g.id)}
                              className="text-caption font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                              style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.35)' }}
                            >Confirm</button>
                            <button
                              onClick={() => setTransitionOpen(null)}
                              className="text-caption font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                              style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.25)' }}
                            >Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {singleMismatches.map((m) => (
                  <div key={`${m.id}-${m.day}`} className="px-3 py-2.5 rounded-lg bg-tile border" style={{ borderColor: 'rgba(251,191,36,0.35)' }}>
                    <div className="flex items-baseline gap-2">
                      <span className="text-body-sm font-semibold text-hi">{m.name}</span>
                      <span className="text-caption text-mid">{m.day}</span>
                    </div>
                    <div className="text-caption mt-0.5 mb-2" style={{ color: '#fcd34d' }}>
                      {m.type === 'presentNoCSV' ? 'Marked present — EMIS has no sessions' : 'Marked absent — EMIS has sessions'}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button
                        onClick={() => togglePresence(m.id, m.day, 'present')}
                        className="text-caption font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                        style={{ background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.35)' }}
                      >Present</button>
                      <button
                        onClick={() => togglePresence(m.id, m.day, 'absent')}
                        className="text-caption font-semibold px-2.5 py-1 rounded-lg cursor-pointer"
                        style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
                      >Absent</button>
                    </div>

                  </div>
                ))}
              </div>
              </>
            )}
            {decidedThisWeek.length > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--g-divider)' }}>
                <div className="text-caption font-semibold text-mid mb-2 uppercase tracking-wide">Decided this week</div>
                <div className="flex flex-col gap-1.5">
                  {decidedThisWeek.map((d, i) => (
                    <div key={`${d.id}-${d.day}-${i}`} className="px-3 py-2 rounded-lg bg-tile" style={{ opacity: 0.6 }}>
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-caption font-semibold text-hi">{d.name}</span>
                        <span className="text-caption text-mid">{d.day}</span>
                        <span className="text-caption font-semibold" style={{ color: d.to === 'present' ? '#6ee7b7' : d.to === 'absent' ? '#fca5a5' : 'var(--g-text-mid)' }}>
                          {d.to === 'present' ? 'Present' : d.to === 'absent' ? 'Absent' : 'Day off'}
                        </span>
                      </div>
                      <div className="text-caption text-mid mt-0.5">
                        {d.by || 'A colleague'}{d.at ? ` \u00b7 ${new Date(d.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
      </div>

      <StatusHoverTooltip hovered={hovered} explainStatus={explainStatus} getClinicianById={getClinicianById} />
    </div>
    </div>
  );
}

// Styled, portaled hover tooltip that explains WHY a clinician shows as
// Present / Absent / Day off. Portaled to document.body so it is never
// clipped by the buddy card grid's overflow, and positioned from the
// hovered card's rect (placed below, or above if there is no room).
const STATUS_META = {
  present: { label: 'Present', colour: '#34d399', bg: 'rgba(16,185,129,0.18)', icon: '✓' },
  absent:  { label: 'Absent',  colour: '#f87171', bg: 'rgba(239,68,68,0.18)',  icon: '✗' },
  dayOff:  { label: 'Day off', colour: '#fbbf24', bg: 'rgba(251,191,36,0.16)',  icon: '—' },
};
function StatusHoverTooltip({ hovered, explainStatus, getClinicianById }) {
  // Self-correcting horizontal clamp: the pill rect is measured inside the
  // zoomed page while the tip renders portaled to body — engines disagree on
  // how CSS zoom maps between those spaces (Safari drifts, worst at the right
  // edge). Measure where the tip ACTUALLY rendered and nudge by the real
  // overflow; converges in 1-3 passes regardless of engine.
  const tipRef = useRef(null);
  const [nudgeX, setNudgeX] = useState(0);
  useLayoutEffect(() => { setNudgeX(0); }, [hovered?.id]);
  useLayoutEffect(() => {
    const el = tipRef.current; if (!el) return;
    const vw = window.visualViewport?.width || window.innerWidth;
    const r = el.getBoundingClientRect();
    let delta = 0;
    if (r.right > vw - 10) delta = (vw - 10) - r.right;
    else if (r.left < 10) delta = 10 - r.left;
    if (Math.abs(delta) > 2) setNudgeX((n) => n + delta);
  }, [hovered, nudgeX]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted || !hovered || typeof document === 'undefined') return null;
  const c = getClinicianById(hovered.id);
  if (!c) return null;
  const { status, lines } = explainStatus(c);
  const meta = STATUS_META[status] || STATUS_META.dayOff;

  const rect = hovered.rect;
  const W = 300;
  const gap = 10;
  let left = rect.left + rect.width / 2 - W / 2;
  left = Math.max(10, Math.min(left, window.innerWidth - W - 10));
  const below = rect.top + rect.height + gap + 150 < window.innerHeight;
  const top = below ? rect.top + rect.height + gap : null;
  const bottom = below ? null : window.innerHeight - rect.top + gap;

  const tip = (
    <div
      ref={tipRef}
      style={{
        transform: `translateX(${nudgeX}px)`,
        position: 'fixed', zIndex: 1300, width: W, maxWidth: 'calc(100vw - 20px)',
        left, ...(below ? { top } : { bottom }),
        background: 'var(--surface-solid)', border: '1px solid var(--g-line)',
        borderRadius: 'var(--r-lg)', padding: '13px 15px', pointerEvents: 'none',
        boxShadow: '0 20px 50px -14px rgba(0,0,0,0.7)',
        animation: 'shtIn 0.16s ease-out',
      }}
    >
      <style>{`@keyframes shtIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div className="flex items-center gap-2 mb-2">
        <span style={{ fontWeight: 600, color: '#f1f5f9', fontSize: 14 }}>{c.name}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 'auto', padding: '2px 9px', borderRadius: 'var(--r-pill)', background: meta.bg, color: meta.colour, fontSize: 12, fontWeight: 600 }}>
          <span>{meta.icon}</span>{meta.label}
        </span>
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 13, color: i === 0 ? 'var(--g-text-hi)' : 'var(--g-text-mid)', lineHeight: 1.5, marginTop: i === 0 ? 0 : 6 }}>{l}</div>
      ))}
      <div style={{ fontSize: 11, color: 'var(--g-text-faint)', marginTop: 9 }}>{c.role}{c.initials ? ` · ${c.initials}` : ''}</div>
    </div>
  );
  return createPortal(tip, document.body);
}
