// lib/school-holidays-by-lea.js
//
// School holiday term-date dataset, keyed by LEA / admin_district name as
// returned by postcodes.io. Each entry is an array of [start, end] date
// ranges (inclusive, ISO format).
//
// Maintenance: we add LEAs as practices join. To extend, copy the dates from
// the LEA's website (most publish term dates 2 years ahead) and add a new
// key. The fallback ENGLAND_AVERAGE is used for any unknown LEA — it's a
// reasonable approximation since most English LEAs cluster around the same
// dates with ±1 week variance.
//
// NOT a substitute for real per-LEA data, but acceptable as a default when
// we don't have a specific calendar.

// Helper: years and date strings are used as-is (no parsing here)
// Each range is [startDate, endDate] inclusive
const NORTH_SOMERSET = {
  name: 'North Somerset',
  ranges: [
    ['2024-10-28','2024-11-01'], ['2024-12-23','2025-01-03'],
    ['2025-02-17','2025-02-21'], ['2025-04-07','2025-04-21'],
    ['2025-05-26','2025-05-30'], ['2025-07-23','2025-09-03'],
    ['2025-10-27','2025-10-31'], ['2025-12-22','2026-01-02'],
    ['2026-02-16','2026-02-20'], ['2026-03-30','2026-04-10'],
    ['2026-05-25','2026-05-29'], ['2026-07-22','2026-09-02'],
    ['2026-10-26','2026-10-30'], ['2026-12-21','2027-01-01'],
    ['2027-02-15','2027-02-19'], ['2027-03-29','2027-04-09'],
    ['2027-05-31','2027-06-04'], ['2027-07-21','2027-09-02'],
  ],
};

// England-average fallback. Roughly midpoint of typical LEA dates.
const ENGLAND_AVERAGE = {
  name: 'England (average)',
  ranges: [
    ['2024-10-28','2024-11-01'], ['2024-12-23','2025-01-03'],
    ['2025-02-17','2025-02-21'], ['2025-04-07','2025-04-21'],
    ['2025-05-26','2025-05-30'], ['2025-07-23','2025-09-03'],
    ['2025-10-27','2025-10-31'], ['2025-12-22','2026-01-02'],
    ['2026-02-16','2026-02-20'], ['2026-03-30','2026-04-10'],
    ['2026-05-25','2026-05-29'], ['2026-07-22','2026-09-02'],
    ['2026-10-26','2026-10-30'], ['2026-12-21','2027-01-01'],
    ['2027-02-15','2027-02-19'], ['2027-03-29','2027-04-09'],
    ['2027-05-31','2027-06-04'], ['2027-07-21','2027-09-02'],
  ],
};

// Add LEAs here as practices onboard. Use the exact admin_district string
// returned by postcodes.io as the key (or list multiple variants if needed).
const KNOWN_LEAS = {
  'North Somerset': NORTH_SOMERSET,
  // 'Bristol, City of': BRISTOL,
  // 'Bath and North East Somerset': BANES,
  // 'Somerset': SOMERSET,
  // ...
};

/**
 * Look up school holidays for an admin_district. Falls back to England
 * average if not found. Always returns a calendar — never null.
 *
 * Returns: { name: string, ranges: [[startISO, endISO], ...], isFallback: bool }
 */
export function getSchoolHolidaysForLEA(adminDistrict) {
  if (adminDistrict && KNOWN_LEAS[adminDistrict]) {
    return { ...KNOWN_LEAS[adminDistrict], isFallback: false };
  }
  return { ...ENGLAND_AVERAGE, isFallback: true };
}

/**
 * List all LEAs we have specific data for. For settings UI dropdown.
 */
export function listKnownLEAs() {
  return Object.keys(KNOWN_LEAS).sort();
}
