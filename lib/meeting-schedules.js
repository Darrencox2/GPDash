// Pure date generation for recurring meeting schedules. No DB, no React —
// just "given a schedule definition, what dates should exist?" so it can be
// unit-reasoned and reused by both the generator and the bulk-upload matcher.

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Generate the next `count` occurrence dates (ISO yyyy-mm-dd) for a schedule,
// on or after `fromIso` (default today). Returns an array of ISO date strings.
export function generateOccurrences(schedule, count = 12, fromIso = null) {
  if (!schedule || !schedule.cadence) return [];
  const from = fromIso ? new Date(fromIso + 'T00:00:00') : new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');
  const anchor = schedule.anchor_date ? new Date(schedule.anchor_date + 'T00:00:00') : from;
  const out = [];

  if (schedule.cadence === 'weekly' || schedule.cadence === 'fortnightly') {
    const dow = schedule.day_of_week ?? anchor.getDay();
    const step = schedule.cadence === 'weekly' ? 7 : 14;
    // Find the first occurrence of `dow` on/after `from`.
    let d = new Date(from);
    const delta = (dow - d.getDay() + 7) % 7;
    d = addDays(d, delta);
    // For fortnightly, align parity to the anchor: keep stepping until the
    // gap from anchor is a whole number of 14-day periods.
    if (schedule.cadence === 'fortnightly') {
      const anchorAligned = new Date(anchor);
      const aDelta = (dow - anchorAligned.getDay() + 7) % 7;
      const firstFromAnchor = addDays(anchorAligned, aDelta);
      const daysBetween = Math.round((d - firstFromAnchor) / 86400000);
      if (((daysBetween % 14) + 14) % 14 !== 0) d = addDays(d, 7);
    }
    for (let i = 0; i < count; i++) {
      out.push(toIso(d));
      d = addDays(d, step);
    }
  } else if (schedule.cadence === 'monthly') {
    const dom = schedule.day_of_month ?? Math.min(anchor.getDate(), 28);
    let y = from.getFullYear();
    let m = from.getMonth();
    // Start from this month's occurrence; if already past, go next month.
    let first = new Date(y, m, dom);
    if (first < from) { m += 1; first = new Date(y, m, dom); }
    let d = first;
    for (let i = 0; i < count; i++) {
      out.push(toIso(d));
      d = new Date(d.getFullYear(), d.getMonth() + 1, dom);
    }
  } else if (schedule.cadence === 'monthly_nth') {
    // "nth weekday of the month" — e.g. 2nd Wednesday. week_of_month 1..4 =
    // 1st..4th; 5 = last occurrence of that weekday in the month.
    const dow = schedule.day_of_week ?? anchor.getDay();
    const nth = schedule.week_of_month ?? 1;
    let y = from.getFullYear();
    let m = from.getMonth();
    let added = 0;
    let guard = 0;
    while (added < count && guard < count + 24) {
      guard++;
      const occ = nthWeekdayOfMonth(y, m, dow, nth);
      if (occ && occ >= from) { out.push(toIso(occ)); added++; }
      m += 1;
      if (m > 11) { m -= 12; y += 1; }
    }
  }
  return out;
}

// The date of the nth (1..4) or last (5) occurrence of weekday `dow` (0=Sun)
// in month `m` (0-based) of year `y`. Returns a Date, or null if nth doesn't
// exist (only relevant for 5 used as exactly-fifth, which we treat as last).
function nthWeekdayOfMonth(y, m, dow, nth) {
  if (nth >= 5) {
    // Last occurrence: walk back from the last day of the month.
    const last = new Date(y, m + 1, 0);
    const delta = (last.getDay() - dow + 7) % 7;
    return new Date(y, m, last.getDate() - delta);
  }
  // First occurrence of dow, then add (nth-1) weeks.
  const firstOfMonth = new Date(y, m, 1);
  const delta = (dow - firstOfMonth.getDay() + 7) % 7;
  const day = 1 + delta + (nth - 1) * 7;
  const dim = new Date(y, m + 1, 0).getDate();
  if (day > dim) return null; // e.g. a 5th Wednesday that doesn't exist
  return new Date(y, m, day);
}

// Given a schedule, existing meeting dates for it, and a target horizon,
// return only the NEW dates that need creating (so generation is idempotent —
// re-running never duplicates an occurrence).
export function missingOccurrences(schedule, existingIsoDates, count = 12, fromIso = null) {
  const want = generateOccurrences(schedule, count, fromIso);
  const have = new Set(existingIsoDates || []);
  return want.filter((iso) => !have.has(iso));
}

export const CADENCE_LABELS = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  monthly_nth: 'Monthly',
};

export const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const NTH_LABELS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'last' };

export function describeSchedule(s) {
  if (!s) return '';
  if (s.cadence === 'monthly') {
    const d = s.day_of_month || 1;
    const suffix = (d % 10 === 1 && d !== 11) ? 'st' : (d % 10 === 2 && d !== 12) ? 'nd' : (d % 10 === 3 && d !== 13) ? 'rd' : 'th';
    return `Monthly on the ${d}${suffix}`;
  }
  if (s.cadence === 'monthly_nth') {
    const nth = NTH_LABELS[s.week_of_month || 1] || 'first';
    const day = DOW_LABELS[s.day_of_week ?? 1];
    return `The ${nth} ${day} of each month`;
  }
  const day = DOW_LABELS[s.day_of_week ?? 1];
  return `${CADENCE_LABELS[s.cadence] || ''} on ${day}s`;
}
