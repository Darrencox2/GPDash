// Cadence maths for scheduled report emails. Pure functions, no React,
// no DB — so the modal, the dispatcher and the tests all agree on when
// "every other Tuesday at 08:00" actually falls.
//
// TIMEZONE: a practice says "08:00" and means 08:00 in the room, all
// year round. The database stores next_send_at as a UTC instant, so BST
// has to be resolved somewhere; it is resolved here, at write time,
// rather than by every reader. That is why the send time columns are a
// wall clock and next_send_at is not.
//
// The cadence vocabulary is deliberately the same one meeting schedules
// use (lib/meeting-schedules.js), plus 'daily'. Labels are imported from
// there rather than restated. The date arithmetic is not shared: that
// module works in the server's local timezone, which is fine for
// meetings booked by a human in the UI and wrong for a UTC cron box
// deciding whether 00:30 London has happened yet.

import { DOW_LABELS, NTH_LABELS } from './meeting-schedules';

export const TZ = 'Europe/London';

export const CADENCE_OPTIONS = [
  { id: 'daily', label: 'Every day' },
  { id: 'weekly', label: 'Every week' },
  { id: 'fortnightly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Every month (date)' },
  { id: 'monthly_nth', label: 'Every month (weekday)' },
];

// The dispatcher wakes every 15 minutes, so offering 08:07 would be a
// promise we cannot keep.
export const MINUTE_OPTIONS = [0, 15, 30, 45];

// ─── Timezone primitives ─────────────────────────────────────────────────

// Wall-clock parts of a UTC instant, as seen in `timeZone`.
function tzParts(date, timeZone = TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(date)) {
    if (type !== 'literal') p[type] = value;
  }
  // en-US with hour12:false renders midnight as '24' in some ICU versions.
  const hh = p.hour === '24' ? 0 : Number(p.hour);
  return { y: +p.year, m: +p.month, d: +p.day, hh, mi: +p.minute, ss: +p.second };
}

// Minutes east of UTC that `timeZone` was observing at that instant.
// Europe/London: 0 in GMT, 60 in BST.
function offsetMinutes(date, timeZone = TZ) {
  const p = tzParts(date, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mi, p.ss);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / 60000);
}

// A London wall clock -> the UTC instant it refers to.
//
// Two passes: guess by treating the wall clock as UTC, correct by the
// offset in force at that guess, then re-check. The second pass matters
// only within an hour of a DST boundary, which is exactly when a naive
// single pass is wrong. Times that do not exist (01:30 on the spring
// forward Sunday) resolve to the instant the clock jumps to; times that
// happen twice (autumn) resolve to the second, i.e. the GMT one. Both
// are verified in tests/unit/report-schedules.spec.js rather than
// reasoned about, because both are easy to get subtly wrong.
export function londonToUtc(y, m, d, hh = 0, mi = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mi);
  const off1 = offsetMinutes(new Date(guess));
  let ts = guess - off1 * 60000;
  const off2 = offsetMinutes(new Date(ts));
  if (off2 !== off1) ts = guess - off2 * 60000;
  return new Date(ts);
}

// Day of week (0=Sun) for a calendar date, independent of any timezone.
function dowOf(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Whole days between two calendar dates.
function daysBetween(a, b) {
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

function parseIsoDate(iso) {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}

// ─── Occurrence matching ─────────────────────────────────────────────────

// Does this calendar date carry an occurrence of `schedule`?
function matchesDate(schedule, y, m, d) {
  const dow = dowOf(y, m, d);
  switch (schedule.cadence) {
    case 'daily':
      return true;

    case 'weekly':
      return dow === (schedule.day_of_week ?? 1);

    case 'fortnightly': {
      if (dow !== (schedule.day_of_week ?? 1)) return false;
      // Parity is measured from the anchor. Without one, every matching
      // weekday qualifies and the first candidate found wins — which is
      // the same thing as anchoring on the first send.
      const anchor = parseIsoDate(schedule.anchor_date);
      if (!anchor) return true;
      const diff = daysBetween({ y, m, d }, anchor);
      return ((diff % 14) + 14) % 14 === 0;
    }

    case 'monthly':
      return d === (schedule.day_of_month ?? 1);

    case 'monthly_nth': {
      if (dow !== (schedule.day_of_week ?? 1)) return false;
      const nth = schedule.week_of_month ?? 1;
      if (nth === 5) return d + 7 > daysInMonth(y, m);   // last one of the month
      return Math.ceil(d / 7) === nth;
    }

    default:
      return false;
  }
}

// The next UTC instant this schedule should send, strictly after `from`.
// Returns null if the cadence is unrecognised or somehow never matches.
//
// Walks forward a day at a time rather than doing closed-form arithmetic
// per cadence. 400 iterations costs nothing and there is no cadence whose
// edge cases (month lengths, the fifth Friday, BST) can trip it up.
export function nextSendAt(schedule, from = new Date()) {
  if (!schedule?.cadence) return null;
  const hh = clampInt(schedule.send_hour, 0, 23, 8);
  const mi = MINUTE_OPTIONS.includes(schedule.send_minute) ? schedule.send_minute : 0;

  const start = tzParts(from);
  let { y, m, d } = start;

  for (let i = 0; i < 400; i++) {
    if (matchesDate(schedule, y, m, d)) {
      const when = londonToUtc(y, m, d, hh, mi);
      if (when.getTime() > from.getTime()) return when;
    }
    // Step one calendar day.
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear(); m = next.getUTCMonth() + 1; d = next.getUTCDate();
  }
  return null;
}

// The next `count` sends, for the "you'll get this on…" preview.
export function nextSends(schedule, count = 3, from = new Date()) {
  const out = [];
  let cursor = from;
  for (let i = 0; i < count; i++) {
    const next = nextSendAt(schedule, cursor);
    if (!next) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

function clampInt(v, lo, hi, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

// ─── Description ─────────────────────────────────────────────────────────

export function timeLabel(hour, minute) {
  return `${String(clampInt(hour, 0, 23, 8)).padStart(2, '0')}:${String(minute || 0).padStart(2, '0')}`;
}

const ORDINAL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 21: '21st', 22: '22nd', 23: '23rd' };
function ordinal(n) {
  return ORDINAL[n] || `${n}th`;
}

export function describeReportSchedule(s) {
  if (!s?.cadence) return '';
  const at = ` at ${timeLabel(s.send_hour, s.send_minute)}`;
  const day = DOW_LABELS[s.day_of_week ?? 1] || 'Monday';
  switch (s.cadence) {
    case 'daily':        return `Every day${at}`;
    case 'weekly':       return `Every ${day}${at}`;
    case 'fortnightly':  return `Every other ${day}${at}`;
    case 'monthly':      return `The ${ordinal(s.day_of_month ?? 1)} of each month${at}`;
    case 'monthly_nth':  return `The ${NTH_LABELS[s.week_of_month ?? 1] || 'first'} ${day} of each month${at}`;
    default:             return '';
  }
}

// "Fri 5 Sep, 08:00" — London, for the preview line and the send log.
export function formatSendTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(/,([^,]*)$/, ',$1');
}

// ─── Defaults ────────────────────────────────────────────────────────────

// What the email includes. The chart is not optional: it is the point of
// the email, and a scheduled report with the chart switched off is just a
// worse version of the CSV.
export const DEFAULT_LAYOUT = {
  headline: true,     // the single overall number
  insight: true,      // the "X is highest at…" sentence, when there is one
  chart: true,        // always on; kept in the shape for forward compatibility
  table: false,       // full data table inline — off by default, the CSV carries detail
  topN: 12,           // rows drawn in the email chart (0 = all)
  csv: true,          // attach the full table as a CSV
  freshness: true,    // "data last updated N days ago" when the CSV is stale
};

export function normaliseLayout(layout) {
  const l = layout || {};
  return {
    ...DEFAULT_LAYOUT,
    ...l,
    chart: true,
    topN: clampInt(l.topN, 0, 40, DEFAULT_LAYOUT.topN),
  };
}
