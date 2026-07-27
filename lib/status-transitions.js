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

import { DAYS, toLocalIso, toHuddleDateStr, matchesStaffMember } from '@/lib/data';
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
    label: 'Long-term sick',
    defaultWeeks: 4,
    describe: (weeks, endDate) =>
      `Marked absent for ${weeks} weeks (until ${endDate}). If EMIS shows booked sessions for them before then, they are automatically marked as back.`,
    reason: 'Long-term sickness',
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

  return {
    ...data,
    clinicians,
    plannedAbsences: [...(Array.isArray(data.plannedAbsences) ? data.plannedAbsences : []), absence],
  };
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
