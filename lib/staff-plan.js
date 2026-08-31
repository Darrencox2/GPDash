// ═══════════════════════════════════════════════════════════════════════════
// lib/staff-plan.js — the Staff Changes timeline engine
// ═══════════════════════════════════════════════════════════════════════════
//
// People come live from the register + working patterns; only EVENTS and
// PLANNED people are stored (practice_settings.extras.staffPlan). Everything
// on the screen is derived here, pure and tested.
//
// Event shape: { id, personRef, type, month, toMonth?, reason?, sessions?, note? }
//   type: 'join' | 'leave' | 'temp_leave' | 'change'
//   month/toMonth: 'YYYY-MM'. personRef: clinician id or planned-person id.

import { classifyStaffRole } from '@/lib/site-staffing';

export const MONTH_MS = 30.44 * 86400000;

export function monthKey(d) {
  const x = d instanceof Date ? d : new Date(d + (String(d).length === 7 ? '-15' : ''));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m - 1, 15).toLocaleString('en-GB', { month: 'short' });
}
export function addMonths(mk, n) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 15);
  return monthKey(d);
}
// April-anchored: the financial year containing `d` starts in its April.
export function aprilStart(d = new Date()) {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04`;
}
export function monthRange(startMk, count) {
  return Array.from({ length: count }, (_, i) => addMonths(startMk, i));
}

// ─── People ────────────────────────────────────────────────────────────────
// Sessions/week from the session rota detail (in = 1, half = 0.5) — the same
// working-patterns truth the rest of the app runs on. clinicians.sessions is
// not used: it is unpopulated in practice.
export function derivePeople(data) {
  const clins = Array.isArray(data?.clinicians) ? data.clinicians : Object.values(data?.clinicians || {});
  const detail = data?.sessionRotaDetail || {};
  const out = [];
  for (const c of clins) {
    if (c.status !== 'active') continue;
    let n = 0;
    const days = detail[c.id] || {};
    for (const day of Object.values(days)) {
      for (const s of ['am', 'pm', 'eve']) {
        if (day?.[s] === 'in') n += 1;
        else if (day?.[s] === 'half') n += 0.5;
      }
    }
    if (n <= 0) continue;
    out.push({ id: c.id, name: c.name, initials: c.initials, role: c.role || '', group: classifyStaffRole(c.role), sessions: n, kind: 'real', windDown: c.windDown || null });
  }
  out.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
  return out;
}

// ─── The walk ──────────────────────────────────────────────────────────────
// A person's sessions in a month = base, stepped by their events in month
// order. Temp leave zeroes the span and restores the pre-leave value after.
export function sessionsByMonth(person, events, months) {
  const mine = (events || []).filter(e => e.personRef === person.id)
    .slice().sort((a, b) => a.month.localeCompare(b.month));
  const out = {};
  for (const mk of months) {
    let value = person.kind === 'planned' ? 0 : person.sessions;
    let away = false;
    for (const e of mine) {
      if (e.month > mk) break;
      if (e.type === 'join') value = e.sessions ?? value;
      else if (e.type === 'change') value = e.sessions ?? value;
      else if (e.type === 'leave') value = 0;
      else if (e.type === 'temp_leave') away = mk >= e.month && mk <= (e.toMonth || e.month);
    }
    // a temp span later in the sorted list can still cover mk
    if (!away) away = mine.some(e => e.type === 'temp_leave' && mk >= e.month && mk <= (e.toMonth || e.month));
    out[mk] = away ? 0 : value;
  }
  return out;
}

export function totalsByMonth(people, events, months) {
  const per = {};
  const totals = {};
  for (const mk of months) totals[mk] = 0;
  for (const p of people) {
    per[p.id] = sessionsByMonth(p, events, months);
    for (const mk of months) totals[mk] += per[p.id][mk];
  }
  return { perPerson: per, totals };
}

// Sessions per 1,000 patients. listSizeByMonth is sparse (NHS publishes some
// months); the nearest earlier known size carries forward, and the current
// registered size is the final fallback.
export function per1000ByMonth(totals, months, listSizeByMonth, currentListSize) {
  const out = {};
  let last = null;
  for (const mk of months) {
    if (listSizeByMonth && listSizeByMonth[mk]) last = listSizeByMonth[mk];
    const size = last || currentListSize || null;
    out[mk] = size ? Math.round((totals[mk] / (size / 1000)) * 10) / 10 : null;
  }
  return out;
}

// ─── Summaries for the chip row ───────────────────────────────────────────
export function planSummary(totals, months, todayMk) {
  const first = totals[months[0]];
  const last = totals[months[months.length - 1]];
  let lowMk = months[0];
  for (const mk of months) if (totals[mk] < totals[lowMk]) lowMk = mk;
  return {
    now: totals[todayMk] ?? first,
    end: last, endDelta: last - (totals[todayMk] ?? first),
    lowMk, low: totals[lowMk],
  };
}

// ─── Wind-down bridge (the "whole site knows" piece) ──────────────────────
// Existing wind-down markers become suggested events; accepting one records
// it in the plan. In the other direction the UI maps a plan event on a real
// person straight through applyTransition, so buddy/absences/audit all see
// the same change — this module only DESCRIBES the mapping.
export function suggestedEventsFromWindDowns(people, events) {
  const have = new Set((events || []).map(e => `${e.personRef}|${e.type}|${e.month}`));
  const out = [];
  for (const p of people) {
    const wd = p.windDown;
    if (!wd || !wd.endDate) continue;
    if (wd.type === 'left') {
      const month = monthKey(wd.endDate);
      if (!have.has(`${p.id}|leave|${month}`)) {
        out.push({ personRef: p.id, personName: p.name, type: 'leave', month, note: 'From buddy wind-down (leaving)' });
      }
    } else {
      const month = monthKey(wd.startDate || wd.endDate);
      const toMonth = monthKey(wd.endDate);
      if (!have.has(`${p.id}|temp_leave|${month}`)) {
        out.push({ personRef: p.id, personName: p.name, type: 'temp_leave', month, toMonth, reason: 'sick', note: 'From buddy wind-down (long-term absence)' });
      }
    }
  }
  return out;
}

export function eventTransitionKey(ev) {
  if (ev.type === 'leave') return 'left_winddown';
  if (ev.type === 'temp_leave') return 'long_term_sick';
  return null;
}
// End-of-month for a month key — what a leave "in November" means for cover.
export function monthEndDate(mk) {
  const [y, m] = mk.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
