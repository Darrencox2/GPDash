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
  }
  return out;
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
};

export const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function describeSchedule(s) {
  if (!s) return '';
  if (s.cadence === 'monthly') {
    const d = s.day_of_month || 1;
    const suffix = (d % 10 === 1 && d !== 11) ? 'st' : (d % 10 === 2 && d !== 12) ? 'nd' : (d % 10 === 3 && d !== 13) ? 'rd' : 'th';
    return `Monthly on the ${d}${suffix}`;
  }
  const day = DOW_LABELS[s.day_of_week ?? 1];
  return `${CADENCE_LABELS[s.cadence] || ''} on ${day}s`;
}
