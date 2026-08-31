// ═══════════════════════════════════════════════════════════════════════════
// lib/rota-design.js — GP rota design rules over the workforce template
// ═══════════════════════════════════════════════════════════════════════════
//
// The planner engine (lib/workforce.js) knows who is WHERE. This module knows
// what a week of general practice NEEDS: it prices each activity in clinical
// yield, converts the template into appointment capacity per weekday, compares
// that to the practice's own demand shape, and applies the design rules a GP
// partner applies by instinct when reading a draft rota.
//
// Pure functions over plain data. No React, no I/O — everything testable.

import { WF_DAYS, WF_DAY_NAMES, WF_SESSIONS, cellKey, typicalWeekdayDemand, activityHitsSession, activityInWeek, activityFraction } from '@/lib/workforce';

// ─── Activity catalogue ────────────────────────────────────────────────────
// `yield` = the fraction of a clinical session's appointment book that
// SURVIVES this activity taking part of the session. A routine surgery keeps
// the book (1); duty triages instead of booking (0); a tutorial halves it in
// practice because the trainer books light around teaching (0.5), and so on.
// These are design-time planning weights, not payroll categories — the point
// is that "9 bodies in" does not mean "9 books open".
export const ACTIVITY_KINDS = [
  { id: 'surgery',   label: 'Routine surgery',   yield: 1,    clinical: true  },
  { id: 'duty',      label: 'Duty / triage',     yield: 0,    clinical: true  },
  { id: 'visits',    label: 'Home visits',       yield: 0.25, clinical: true  },
  { id: 'clinic',    label: 'Special clinic',    yield: 0.5,  clinical: true  }, // coils, minor surgery, baby imms…
  { id: 'teaching',  label: 'Teaching / tutorial', yield: 0.5, clinical: false },
  { id: 'admin',     label: 'Admin / paperwork', yield: 0,    clinical: false },
  { id: 'meeting',   label: 'Meeting / PLT',     yield: 0,    clinical: false },
  { id: 'cpd',       label: 'CPD / appraisal',   yield: 0,    clinical: false },
  { id: 'other',     label: 'Other',             yield: 0,    clinical: false },
];
export const KIND_BY_ID = Object.fromEntries(ACTIVITY_KINDS.map(k => [k.id, k]));

// Sensible default: a standard 10-minute-appointment GP session books ~13-15.
export const DEFAULT_APPTS_PER_SESSION = 14;

// ─── Effective clinical capacity ───────────────────────────────────────────
// For one cell (day+session): every allocated head starts as one full book;
// each assigned activity in that cell subtracts (1 - yield) × its fraction
// of a session from THAT clinician's book. Unassigned activities subtract
// from the cell total anyway — the work exists whether or not it is named to
// a person yet, and pretending otherwise overstates capacity.
export function effectiveSessions({ allocation, activities, week = 'a', includedIds }) {
  const inc = includedIds instanceof Set ? includedIds : new Set(includedIds || []);
  const out = {};
  for (const day of WF_DAYS) {
    out[day] = {};
    for (const s of WF_SESSIONS) {
      const heads = (allocation?.[day]?.[s] || []).filter(id => inc.size === 0 || inc.has(id));
      let effective = heads.length;
      const detail = [];
      for (const a of activities || []) {
        if (a.day !== day || !activityHitsSession(a, s) || !activityInWeek(a, week)) continue;
        const kind = KIND_BY_ID[a.kind] || KIND_BY_ID.other;
        const cost = (1 - kind.yield) * activityFraction(a);
        if (cost <= 0) continue;
        effective -= cost;
        detail.push({ label: a.label || kind.label, kind: kind.id, cost, assigned: !!a.assignedClinicianId });
      }
      out[day][s] = { heads: heads.length, effective: Math.max(0, effective), detail };
    }
  }
  return out;
}

// ─── Capacity vs demand, in appointments ───────────────────────────────────
export function capacityVsDemand({ allocation, activities, week = 'a', includedIds, demandSettings, listSize, apptsPerSession = DEFAULT_APPTS_PER_SESSION }) {
  const demand = typicalWeekdayDemand(demandSettings, listSize);
  const eff = effectiveSessions({ allocation, activities, week, includedIds });
  const perDay = {};
  let weekCapacity = 0;
  for (const day of WF_DAYS) {
    const sessions = eff[day].am.effective + eff[day].pm.effective;
    const capacity = Math.round(sessions * apptsPerSession);
    weekCapacity += capacity;
    perDay[day] = {
      demand: demand[day],
      effectiveSessions: Math.round(sessions * 10) / 10,
      heads: eff[day].am.heads + eff[day].pm.heads,
      capacity,
      surplus: capacity - demand[day],
      cover: demand[day] > 0 ? capacity / demand[day] : null,
    };
  }
  return { perDay, weekDemand: demand.weeklyTotal, weekCapacity, weekSurplus: weekCapacity - demand.weeklyTotal };
}

// ─── The design rules ──────────────────────────────────────────────────────
// Everything a partner scans a draft rota for, as data. Severity:
// 'critical' = the week does not function; 'warn' = it functions but will
// hurt; 'info' = worth a look.
export function designFindings({ allocation, activities, week = 'a', includedIds, clinicians, demandSettings, listSize, apptsPerSession = DEFAULT_APPTS_PER_SESSION, dutyCapableIds }) {
  const findings = [];
  const inc = includedIds instanceof Set ? includedIds : new Set(includedIds || []);
  const nameOf = (id) => (clinicians || []).find(c => c.id === id)?.name || 'someone';
  const cvd = capacityVsDemand({ allocation, activities, week, includedIds, demandSettings, listSize, apptsPerSession });

  // 1. Duty cover: every session of every open day needs a duty activity,
  //    and it needs a name on it.
  for (const day of WF_DAYS) {
    for (const s of WF_SESSIONS) {
      const duties = (activities || []).filter(a => a.day === day && activityHitsSession(a, s) && activityInWeek(a, week) && (KIND_BY_ID[a.kind]?.id === 'duty'));
      if (duties.length === 0) {
        findings.push({ rule: 'duty-missing', severity: 'critical', day, session: s,
          message: `No duty/triage cover planned for ${WF_DAY_NAMES[day]} ${s.toUpperCase()}` });
      } else if (duties.every(a => !a.assignedClinicianId)) {
        findings.push({ rule: 'duty-unassigned', severity: 'warn', day, session: s,
          message: `Duty on ${WF_DAY_NAMES[day]} ${s.toUpperCase()} has no one assigned` });
      } else if (dutyCapableIds && dutyCapableIds.size > 0) {
        for (const a of duties) {
          if (a.assignedClinicianId && !dutyCapableIds.has(a.assignedClinicianId)) {
            findings.push({ rule: 'duty-not-capable', severity: 'warn', day, session: s,
              message: `${nameOf(a.assignedClinicianId)} is on duty ${WF_DAY_NAMES[day]} ${s.toUpperCase()} but is not marked duty-capable` });
          }
        }
      }
    }
  }

  // 2. Capacity below demand on any day.
  for (const day of WF_DAYS) {
    const d = cvd.perDay[day];
    if (d.demand > 0 && d.capacity < d.demand) {
      findings.push({ rule: 'capacity-short', severity: d.capacity < d.demand * 0.85 ? 'critical' : 'warn', day,
        message: `${WF_DAY_NAMES[day]}: ~${d.capacity} appointments planned against ~${d.demand} expected (${d.surplus})` });
    }
  }

  // 3. Peak alignment: the busiest day should hold the biggest share of
  //    capacity. Monday under-weighting is the classic GP rota failure.
  const days = WF_DAYS.map(d => cvd.perDay[d]);
  const peakDemandDay = WF_DAYS[days.reduce((bi, d, i) => d.demand > days[bi].demand ? i : bi, 0)];
  const peakCapacityDay = WF_DAYS[days.reduce((bi, d, i) => d.capacity > days[bi].capacity ? i : bi, 0)];
  if (cvd.perDay[peakDemandDay].demand > 0 && peakDemandDay !== peakCapacityDay
      && cvd.perDay[peakCapacityDay].capacity > cvd.perDay[peakDemandDay].capacity * 1.1) {
    findings.push({ rule: 'peak-misaligned', severity: 'warn', day: peakDemandDay,
      message: `${WF_DAY_NAMES[peakDemandDay]} is the busiest day but ${WF_DAY_NAMES[peakCapacityDay]} carries the most capacity` });
  }

  // 4. All-clinical weeks: a clinician on 6+ sessions with no admin/CPD
  //    activity anywhere in the week is a paperwork backlog being designed in.
  const sessionsById = {};
  for (const day of WF_DAYS) for (const s of WF_SESSIONS)
    for (const id of (allocation?.[day]?.[s] || [])) sessionsById[id] = (sessionsById[id] || 0) + 1;
  const nonClinicalById = new Set((activities || [])
    .filter(a => a.assignedClinicianId && activityInWeek(a, week) && KIND_BY_ID[a.kind] && !KIND_BY_ID[a.kind].clinical)
    .map(a => a.assignedClinicianId));
  for (const [id, n] of Object.entries(sessionsById)) {
    if (inc.size > 0 && !inc.has(id)) continue;
    if (n >= 6 && !nonClinicalById.has(id)) {
      findings.push({ rule: 'no-admin-time', severity: 'info', clinicianId: id,
        message: `${nameOf(id)} has ${n} sessions and no admin/CPD time in the template` });
    }
  }

  // 5. Duty + full surgery double-booking: the duty holder cannot also run a
  //    full book in the same session.
  for (const a of (activities || [])) {
    if (!a.assignedClinicianId || KIND_BY_ID[a.kind]?.id !== 'duty' || !activityInWeek(a, week)) continue;
    const clash = (activities || []).find(b => b !== a && b.assignedClinicianId === a.assignedClinicianId
      && b.day === a.day && activityHitsSession(b, a.session) && KIND_BY_ID[b.kind]?.id === 'surgery' && activityInWeek(b, week));
    if (clash) findings.push({ rule: 'duty-surgery-clash', severity: 'warn', day: a.day, session: a.session, clinicianId: a.assignedClinicianId,
      message: `${nameOf(a.assignedClinicianId)} holds duty AND a routine surgery on ${WF_DAY_NAMES[a.day]} ${a.session.toUpperCase()}` });
  }

  const order = { critical: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return { findings, capacity: cvd };
}

// ─── One number for the top of the panel ───────────────────────────────────
// 100 = every session covered, duty everywhere, capacity meets demand daily.
export function templateScore({ findings, capacity }) {
  let score = 100;
  for (const f of findings) score -= f.severity === 'critical' ? 15 : f.severity === 'warn' ? 5 : 2;
  for (const day of WF_DAYS) {
    const d = capacity.perDay[day];
    if (d.demand > 0 && d.capacity < d.demand) score -= 5;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
