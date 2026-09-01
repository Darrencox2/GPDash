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

// ─── Day-level timeline (what the chart draws) ─────────────────────────────
// The monthly walk above buckets every event to a whole month, which is right
// for a grid of month squares and wrong for a line: maternity starting on the
// 28th should hold the line up until the 28th, not drop it on the 1st.
//
// Events that carry no dates fall back to the month boundary the monthly walk
// already uses, so nothing recorded before exact dates existed moves.

const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function daysInMonth(mk) {
  const [y, m] = mk.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
export function shiftDay(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return isoOf(x.getFullYear(), x.getMonth() + 1, x.getDate());
}

// Where a date sits on an axis of equal-width month bands: the month's index
// plus how far through that month it falls. Equal bands (rather than real day
// counts) are what keeps the chart aligned with the grid columns underneath.
export function monthFraction(iso, months) {
  const mk = String(iso).slice(0, 7);
  const i = months.indexOf(mk);
  if (i < 0) return mk < months[0] ? 0 : months.length;
  const day = Number(String(iso).slice(8, 10)) || 1;
  return i + (day - 1) / daysInMonth(mk);
}

// Short codes rather than words — a chart label has room for MAT, not for
// "maternity leave". Handles the snake_case the absence records use.
export function absenceCode(reason) {
  const r = String(reason || '').toLowerCase();
  if (/matern/.test(r)) return 'MAT';
  if (/patern/.test(r)) return 'PAT';
  if (/sick/.test(r)) return 'SICK';
  if (/holiday|annual|leave/.test(r)) return 'HOL';
  if (/train|study/.test(r)) return 'TRG';
  if (/notice/.test(r)) return 'NOTICE';
  return 'AWAY';
}

// The tag a chart chip carries: real staff have initials, planned people are
// only ever a first name.
export function personTag(p) {
  return p?.initials || String(p?.name || '').trim().split(/\s+/)[0] || '?';
}

// Returns { steps, marks }:
//   steps — every date the total changes, with the running total and the
//           split by staff group. Step-after: the value holds until the next.
//   marks — one per person per date they move, carrying the SIGNED CHANGE
//           (+2, not "now 6") and a short code, which is what the chart and
//           its ribbon label.
export function capacityTimeline(people, events, months) {
  const winStart = `${months[0]}-01`;
  const winEnd = monthEndDate(months[months.length - 1]);

  const recs = (people || []).map((p) => {
    const mine = (events || []).filter((e) => e.personRef === p.id);
    const base = [];   // { date, value, type } — join / change / leave
    const away = [];   // { start, end, reason } — temp leave
    for (const e of mine) {
      const mStart = `${e.month}-01`;
      if (e.type === 'join' || e.type === 'change') {
        if (e.sessions != null) base.push({ date: e.startDate || mStart, value: e.sessions, type: e.type });
      } else if (e.type === 'leave') {
        // A stated leaving date is the person's LAST day, so capacity drops
        // the day after. A month-only leave keeps the monthly walk's cruder
        // "gone from the 1st", so historical rows do not shift.
        const last = e.endDate || e.startDate;
        base.push({ date: last ? shiftDay(last, 1) : mStart, value: 0, type: 'leave' });
      } else if (e.type === 'temp_leave') {
        away.push({
          start: e.startDate || mStart,
          end: e.endDate || monthEndDate(e.toMonth || e.month),
          reason: e.reason,
        });
      }
    }
    base.sort((a, b) => a.date.localeCompare(b.date));
    return { p, base, away };
  });

  const valueAt = (rec, date) => {
    for (const a of rec.away) if (date >= a.start && date <= a.end) return 0;
    let v = rec.p.kind === 'planned' ? 0 : (rec.p.sessions || 0);
    for (const b of rec.base) { if (b.date > date) break; v = b.value; }
    return v;
  };
  const describe = (rec, date) => {
    const started = rec.away.find((a) => a.start === date);
    if (started) return { type: 'temp_leave', code: absenceCode(started.reason), reason: started.reason || null };
    const ended = rec.away.find((a) => shiftDay(a.end, 1) === date);
    if (ended) return { type: 'return', code: 'BACK', reason: ended.reason || null };
    const b = rec.base.filter((x) => x.date === date).pop();
    if (b) return { type: b.type, code: b.type === 'join' ? 'JOIN' : b.type === 'leave' ? 'LEFT' : null, reason: null };
    return { type: 'change', code: null, reason: null };
  };

  const dates = new Set([winStart]);
  const inWindow = (d) => d > winStart && d <= winEnd;
  for (const rec of recs) {
    for (const b of rec.base) if (inWindow(b.date)) dates.add(b.date);
    for (const a of rec.away) {
      if (inWindow(a.start)) dates.add(a.start);
      const back = shiftDay(a.end, 1);
      if (inWindow(back)) dates.add(back);
    }
  }

  const steps = [];
  const marks = [];
  let prev = shiftDay(winStart, -1);
  for (const date of [...dates].sort()) {
    const byGroup = { gp: 0, nursing: 0, hca: 0, other: 0 };
    let value = 0;
    for (const rec of recs) {
      const v = valueAt(rec, date);
      value += v;
      const g = rec.p.group || 'other';
      byGroup[g] = (byGroup[g] || 0) + v;
      const delta = v - valueAt(rec, prev);
      if (delta !== 0) {
        marks.push({
          ...describe(rec, date),
          date, x: monthFraction(date, months), delta,
          personRef: rec.p.id, name: rec.p.name, tag: personTag(rec.p), group: g,
        });
      }
    }
    // A date can be a breakpoint for one person and a no-op overall (a
    // "change" to the sessions someone already worked). Keep the path clean.
    const last = steps[steps.length - 1];
    const moved = !last || last.value !== value ||
      Object.keys(byGroup).some((g) => last.byGroup[g] !== byGroup[g]);
    if (moved) steps.push({ date, x: monthFraction(date, months), value, byGroup });
    prev = date;
  }
  return { steps, marks };
}
