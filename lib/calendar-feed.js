// lib/calendar-feed.js
//
// Pure helpers for the personal ICS calendar feed (see
// /api/v4/calendar/[token]). Kept out of the route so they can be tested
// against real CSV data - the September lesson: prove output, not logs.

const pad = (n) => String(n).padStart(2, '0');
export const icsStamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
export const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function parseTimeMins(timeStr) {
  const m = String(timeStr || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Group a day's rows into session blocks. REALITY CHECK (verified against
// a live export): EMIS row times are session-level buckets, "Before 12:59"
// and "After or At 13:00", not per-appointment clocks - so the feed works
// at session granularity. Occasional literal clock times are assigned to
// a session by hour; anything at or after 18:30 becomes an Evening block.
// Times shown are sensible session spans, since exact clocks are not in
// the export: AM 08:30-13:00, PM 13:30-18:00, Evening 18:30-20:00.
const SESSION_SPANS = {
  AM: { startMins: 8 * 60 + 30, endMins: 13 * 60 },
  PM: { startMins: 13 * 60 + 30, endMins: 18 * 60 },
  Evening: { startMins: 18 * 60 + 30, endMins: 20 * 60 },
};

export function buildBlocks(rows) {
  const buckets = {};
  for (const r of rows || []) {
    const t = String(r.time || '').toLowerCase();
    let session = null;
    if (t.includes('before')) session = 'AM';
    else if (t.includes('after')) session = 'PM';
    else {
      const mins = parseTimeMins(r.time);
      if (mins != null) session = mins >= 18 * 60 + 30 ? 'Evening' : mins < 13 * 60 ? 'AM' : 'PM';
    }
    if (!session) continue;
    (buckets[session] = buckets[session] || []).push(r);
  }
  return ['AM', 'PM', 'Evening'].filter((k) => buckets[k]).map((k) => {
    const locCounts = {};
    const slotCounts = {};
    let total = 0;
    for (const r of buckets[k]) {
      const n = Number(r.count) || 1;
      total += n;
      if (r.location) locCounts[r.location] = (locCounts[r.location] || 0) + n;
      if (r.slotType) slotCounts[r.slotType] = (slotCounts[r.slotType] || 0) + n;
    }
    const site = Object.entries(locCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const slotSummary = Object.entries(slotCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t2, n]) => `${n}x ${t2}`)
      .join('\n');
    return { session: k, ...SESSION_SPANS[k], site, total, slotSummary };
  });
}

