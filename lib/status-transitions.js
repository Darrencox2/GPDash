// lib/status-transitions.js
//
// Clinician status transitions for the buddy system: structured ways to
// change someone's standing that go beyond a single-day present/absent
// toggle. Born from a real workflow (2026-06): when a clinician leaves,
// results and letters keep arriving for ~2 months, so "left" must mean
// "covered while their work drains, THEN removed" - not "vanished today".
//
// Design: each transition builds (a) a planned absence covering the period
// (the existing buddy engine then allocates cover automatically - no new
// status machinery) and (b) a windDown marker on the clinician that the
// sweep resolves later. Add new transitions to STATUS_TRANSITIONS; the
// panel UI and the sweep pick them up generically.
//
// IMPORTANT: wind-down absences carry source 'gpdash' so the TeamNet sync
// (which replaces only source:'teamnet' rows) leaves them alone.

import { DAYS, toLocalIso, toHuddleDateStr, matchesStaffMember, logEvent } from '@/lib/data';
import { getCliniciansForDate } from '@/lib/huddle';

const WEEK_MS = 7 * 86400000;

export const STATUS_TRANSITIONS = {
  left_winddown: {
    key: 'left_winddown',
    label: 'Has left',
    defaultWeeks: 9, // ~2 months
    describe: (weeks, endDate) =>
      `Covered by the buddy system for ${weeks} weeks (until ${endDate}), then automatically marked as left.`,
    reason: 'Leaving - wind down cover',
    windDownType: 'left',
  },
  long_term_sick: {
    key: 'long_term_sick',
    label: 'Long term absence',
    defaultWeeks: 4,
    describe: (weeks, endDate) =>
      `Marked absent for ${weeks} weeks (until ${endDate}). If EMIS shows booked sessions for them before then, they are automatically marked as back.`,
    reason: 'Long term absence',
    windDownType: 'sick',
  },
};

// Apply a transition. Returns a NEW data object ready for saveData.
export function applyTransition(data, clinicianId, transitionKey, { weeks, by } = {}) {
  const t = STATUS_TRANSITIONS[transitionKey];
  if (!t) throw new Error(`Unknown transition: ${transitionKey}`);
  const w = Math.max(1, Math.min(52, Number(weeks) || t.defaultWeeks));
  const start = new Date();
  const end = new Date(start.getTime() + w * WEEK_MS);
  const startDate = toLocalIso(start);
  const endDate = toLocalIso(end);

  const absence = {
    id: `winddown-${clinicianId}-${Date.now()}`,
    clinicianId,
    startDate,
    endDate,
    reason: t.reason,
    source: 'gpdash', // survives TeamNet sync (which only owns source:'teamnet')
  };

  const clinicians = (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {})).map((c) =>
    c.id === clinicianId
      ? {
          ...c,
          windDown: {
            type: t.windDownType,
            startDate,
            endDate,
            setBy: by || null,
            setAt: new Date().toISOString(),
          },
        }
      : c
  );

  const next = {
    ...data,
    clinicians,
    plannedAbsences: [...(Array.isArray(data.plannedAbsences) ? data.plannedAbsences : []), absence],
  };
  return logEvent(next, 'staff', `${t.label} set for ${(clinicians.find((c) => c.id === clinicianId) || {}).name || clinicianId} - ${w} week wind-down until ${endDate}${by ? ` (by ${by})` : ''}`);
}

// Sweep wind-downs on load. Returns { changed, data, events } where events
// are human-readable strings for toasts / audit.
//
//  - 'left' past its end date  -> clinician.status = 'left', marker cleared.
//  - 'sick' + EMIS shows booked sessions on any non-past day -> absence
//    truncated to end yesterday, marker cleared ("they are back").
export function sweepWindDowns(data, huddleData, { getDateKeyForDay } = {}) {
  const events = [];
  const todayIso = toLocalIso(new Date());
  let clinicians = Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {});
  let absences = Array.isArray(data.plannedAbsences) ? data.plannedAbsences : [];
  let changed = false;

  clinicians = clinicians.map((c) => {
    if (!c.windDown) return c;

    // 1. Leaver whose wind-down has completed
    if (c.windDown.type === 'left' && todayIso > c.windDown.endDate) {
      changed = true;
      events.push(`${c.name} marked as left - wind-down cover period complete`);
      return { ...c, status: 'left', windDown: null };
    }

    // 2. Long-term sick who EMIS says is back (booked sessions on any
    //    editable day this week)
    if (c.windDown.type === 'sick' && huddleData && typeof getDateKeyForDay === 'function') {
      for (const day of DAYS) {
        const dk = getDateKeyForDay(day);
        if (dk < todayIso) continue;
        const csv = getCliniciansForDate(huddleData, toHuddleDateStr(new Date(dk + 'T12:00:00')));
        if (csv.length && csv.some((name) => matchesStaffMember(name, c))) {
          changed = true;
          const yesterday = toLocalIso(new Date(Date.now() - 86400000));
          absences = absences.map((a) =>
            a.clinicianId === c.id && a.reason === STATUS_TRANSITIONS.long_term_sick.reason && a.endDate > yesterday
              ? { ...a, endDate: yesterday }
              : a
          );
          events.push(`${c.name} marked as back - EMIS shows booked sessions from ${day}`);
          return { ...c, windDown: null };
        }
      }
    }

    return c;
  });

  if (!changed) return { changed: false, data, events: [] };
  return { changed: true, data: { ...data, clinicians, plannedAbsences: absences }, events };
}


// Undo an active wind-down: clears the marker and removes the absence it
// created, restoring the clinician to their normal standing. Only valid
// while the marker is still present (after the sweep has flipped someone
// to status left, use the staff register to change status instead).
// Audited via the audit log.
export function undoTransition(data, clinicianId, { by } = {}) {
  const clinicians = (Array.isArray(data.clinicians) ? data.clinicians : Object.values(data.clinicians || {})).map((c) => {
    if (c.id !== clinicianId || !c.windDown) return c;
    const { windDown, ...rest } = c;
    return rest;
  });
  const target = (Array.isArray(data.clinicians) ? data.clinicians : []).find((c) => c.id === clinicianId);
  const absences = (Array.isArray(data.plannedAbsences) ? data.plannedAbsences : [])
    .filter((a) => !(typeof a.id === 'string' && a.id.startsWith(`winddown-${clinicianId}-`)));
  const label = target?.windDown?.type === 'sick' ? 'Long-term sick' : 'Has left';
  const next = { ...data, clinicians, plannedAbsences: absences };
  return logEvent(next, 'staff', `${label} status UNDONE for ${target?.name || clinicianId} - wind-down cancelled and cover absence removed${by ? ` (by ${by})` : ''}`);
}

// Error detection: a clinician marked as LEFT should not be in EMIS at
// all (their rota is removed when they leave). If EMIS still shows booked
// sessions for them on any non-past day this week, something has gone
// wrong - either the EMIS rota was not removed, or the status was set in
// error. Returns [{ clinicianId, name, type, days: [dayName] }]. The
// buddy panel renders these as loud warning cards with an undo option.
export function getWindDownAlerts(data, huddleData, { getDateKeyForDay } = {}) {
  if (!huddleData || typeof getDateKeyForDay !== 'function') return [];
  const todayIso = toLocalIso(new Date());
  const clinicians = Array.isArray(data.clinicians) ? data.clinicians : [];
  const alerts = [];
  for (const c of clinicians) {
    if (c.windDown?.type !== 'left') continue;
    const days = [];
    for (const day of DAYS) {
      const dk = getDateKeyForDay(day);
      if (dk < todayIso) continue;
      const csv = getCliniciansForDate(huddleData, toHuddleDateStr(new Date(dk + 'T12:00:00')));
      if (csv.length && csv.some((name) => matchesStaffMember(name, c))) days.push(day);
    }
    if (days.length) alerts.push({ clinicianId: c.id, name: c.name, type: 'left', days });
  }
  return alerts;
}


// Adjust an active wind-down's end date (notice periods change in real
// life). Updates both the marker and the cover absence, audited - this
// keeps the trail honest instead of forcing an undo + re-set.
export function adjustTransition(data, clinicianId, newEndDate, { by } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndDate || '')) return data;
  const target = (Array.isArray(data.clinicians) ? data.clinicians : []).find((c) => c.id === clinicianId);
  if (!target?.windDown) return data;
  const oldEnd = target.windDown.endDate;
  const clinicians = data.clinicians.map((c) =>
    c.id === clinicianId ? { ...c, windDown: { ...c.windDown, endDate: newEndDate } } : c
  );
  const absences = (Array.isArray(data.plannedAbsences) ? data.plannedAbsences : []).map((a) =>
    typeof a.id === 'string' && a.id.startsWith(`winddown-${clinicianId}-`)
      ? { ...a, endDate: newEndDate }
      : a
  );
  const label = target.windDown.type === 'sick' ? 'Long-term sick' : 'Has left';
  const next = { ...data, clinicians, plannedAbsences: absences };
  return logEvent(next, 'staff', `${label} wind-down for ${target.name} adjusted: end date ${oldEnd} -> ${newEndDate}${by ? ` (by ${by})` : ''}`);
}
