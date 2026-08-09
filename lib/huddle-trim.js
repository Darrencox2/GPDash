// lib/huddle-trim.js
//
// Server-side enforcement of the huddle CSV retention window. The client
// merge (lib/huddle.js mergeHuddleData) applies the same window at upload
// time, but that only protects saves made through a current bundle: a
// stale open session holding an oversized dataset in memory will happily
// re-send the whole thing on its next save, clobbering any server-side
// cleanup (observed live on 2026-08-09: a database trim was overwritten
// within minutes by an open tab re-uploading an 8-year, 4.4MB blob that
// then broke the huddle-data endpoint against Vercel's ~4.5MB response
// limit). Enforcing the window HERE, at the save boundary, makes the
// stored blob's size a server guarantee rather than a client courtesy.
//
// Self-contained on purpose: no imports, own date parser, so the API
// route stays lean and this can never pick up client-side dependencies.

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function parseEmisDate(ds) {
  // "DD-Mon-YYYY" (e.g. "01-Sep-2026"); tolerate "Sept" for safety.
  if (typeof ds !== 'string') return null;
  const m = ds.match(/^(\d{1,2})-([A-Za-z]{3,4})-(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month == null) return null;
  const d = new Date(Number(m[3]), month, Number(m[1]));
  return isNaN(d) ? null : d;
}

const DATE_KEYED_STORES = [
  'dateData', 'bookedData', 'embargoedData', 'blockedData',
  'locationData', 'splitSiteData', 'slotRows', 'slotLocationData',
];

// Returns a new blob with every date-keyed store filtered to the window
// and the dates array rebuilt. Unknown/other properties pass through
// untouched. Safe on null/malformed input (returned as-is).
export function trimHuddleWindow(blob, { pastDays = 124, futureDays = 92 } = {}) {
  if (!blob || typeof blob !== 'object' || !Array.isArray(blob.dates)) return blob;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const lo = new Date(now); lo.setDate(lo.getDate() - pastDays);
  const hi = new Date(now); hi.setDate(hi.getDate() + futureDays);
  const inWindow = (ds) => {
    const d = parseEmisDate(ds);
    return d != null && d >= lo && d <= hi;
  };

  const out = { ...blob };
  for (const store of DATE_KEYED_STORES) {
    const src = blob[store];
    if (!src || typeof src !== 'object') continue;
    const filtered = {};
    for (const [ds, v] of Object.entries(src)) {
      if (inWindow(ds)) filtered[ds] = v;
    }
    out[store] = filtered;
  }
  const dateSet = new Set();
  for (const store of ['dateData', 'bookedData', 'embargoedData']) {
    Object.keys(out[store] || {}).forEach((ds) => dateSet.add(ds));
  }
  out.dates = Array.from(dateSet).sort((a, b) => parseEmisDate(a) - parseEmisDate(b));
  return out;
}
