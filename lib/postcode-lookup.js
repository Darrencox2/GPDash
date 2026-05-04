// lib/postcode-lookup.js
//
// Postcode → LEA lookup using postcodes.io (free, no auth, UK only).
// Used during practice setup to populate region + school-holiday calendar
// from a single postcode entry.
//
// postcodes.io returns a lot of fields; we only need:
//   - admin_district  → roughly the LEA (e.g. "North Somerset")
//   - region          → for region tag (e.g. "South West")
//   - country         → "England" / "Scotland" / "Wales" / "Northern Ireland"
//
// School holiday calendars by LEA are kept in lib/school-holidays-by-lea.js.
// If the looked-up admin_district isn't in our dataset, we fall back to a
// generic England calendar (defined there).

const POSTCODES_IO_BASE = 'https://api.postcodes.io';

/**
 * Look up a UK postcode. Returns null if not found or on network error.
 * Caller is responsible for handling the null case (e.g. let admin retry).
 *
 * Note: postcodes.io is unauthenticated and rate-limits per IP. For our
 * volumes (one lookup per practice setup) this is fine. We deliberately
 * don't cache — postcode data is essentially static, but we'd rather
 * re-query than maintain a cache layer right now.
 */
export async function lookupPostcode(postcode) {
  if (!postcode || typeof postcode !== 'string') return null;
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d{1,2}[A-Z]?\d[A-Z]{2}$/.test(cleaned)) return null;

  try {
    const res = await fetch(`${POSTCODES_IO_BASE}/postcodes/${encodeURIComponent(cleaned)}`, {
      // Short timeout: this runs during setup, no point waiting forever
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 200 || !json.result) return null;

    const r = json.result;
    return {
      postcode: r.postcode,
      admin_district: r.admin_district || null,
      admin_county: r.admin_county || null,
      region: r.region || null,
      country: r.country || null,
      // Useful for future: actual lat/lng for weather lookup, etc.
      latitude: r.latitude,
      longitude: r.longitude,
      // Codes (more stable than names if we ever need to match against
      // gov.uk datasets — admin districts get renamed occasionally)
      codes: r.codes || {},
    };
  } catch {
    // Network errors, timeouts, invalid JSON — all fail closed
    return null;
  }
}

/**
 * Validate format only (no network call). Returns true for plausible UK
 * postcodes; doesn't guarantee the postcode actually exists.
 */
export function isValidPostcodeFormat(postcode) {
  if (!postcode || typeof postcode !== 'string') return false;
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{1,2}\d{1,2}[A-Z]?\d[A-Z]{2}$/.test(cleaned);
}

/**
 * Format a postcode in canonical "AA9A 9AA" form.
 */
export function formatPostcode(postcode) {
  if (!postcode || typeof postcode !== 'string') return postcode;
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 7) return postcode;
  return cleaned.slice(0, -3) + ' ' + cleaned.slice(-3);
}
