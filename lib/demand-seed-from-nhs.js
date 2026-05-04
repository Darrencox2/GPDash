// Convert an NHS OC baseline row into the practice's demand_settings shape,
// matching the output of lib/demand-recalibration.js so consumers can use
// either source interchangeably.
//
// Note: NHS data covers ONE month at a time. With one month we can fit:
//   - baseline (avg weekday submissions per day)
//   - dowEffects (Mon-Fri additive deltas)
//   - growthPerDay = 0 (no trend info)
//   - monthEffects = null (need 9+ months)
//
// When the practice later uploads their own AskMyGP history, the existing
// recalibration replaces this with a fitted model — but until then, this
// gives meaningful predictions on day one.

const WEEKDAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * @param {object} baseline — single row from nhs_oc_baseline
 * @returns {object|null} demand_settings shape, or null if insufficient data
 */
export function seedDemandFromBaseline(baseline) {
  if (!baseline) return null;
  const byWeekday = baseline.by_weekday || {};
  const daysPerWeekday = baseline.days_per_weekday || {};

  // Compute per-weekday average (submissions per Monday, per Tuesday, etc.)
  const perWeekdayAvg = {};
  let totalWeekdayDays = 0;
  let totalWeekdayCount = 0;
  for (const wd of WEEKDAY_KEYS) {
    const dayCount = daysPerWeekday[wd] || 0;
    const submissionCount = byWeekday[wd] || 0;
    if (dayCount > 0) {
      perWeekdayAvg[wd] = submissionCount / dayCount;
      totalWeekdayDays += dayCount;
      totalWeekdayCount += submissionCount;
    } else {
      perWeekdayAvg[wd] = 0;
    }
  }

  if (totalWeekdayDays < 5) {
    // Not enough weekday days to be useful — at least one of each weekday ideally
    return null;
  }

  // baseline = average weekday submissions per day
  const baselineAvg = totalWeekdayCount / totalWeekdayDays;

  // dowEffects[i] = average for that weekday minus the overall baseline
  const dowEffects = WEEKDAY_KEYS.map(wd => perWeekdayAvg[wd] - baselineAvg);

  // referenceDate = midpoint of the data month
  // baseline.month is e.g. '2026-03-01'; midpoint is the 15th
  const monthStart = new Date(baseline.month);
  const referenceDate = new Date(monthStart);
  referenceDate.setDate(15);

  return {
    sufficient: true,
    sampleSize: totalWeekdayDays,
    spanDays: baseline.days_with_data || 0,
    baseline: round2(baselineAvg),
    growthPerDay: 0,
    referenceDate: toIso(referenceDate),
    dowEffects: dowEffects.map(round2),
    monthEffects: null,
    monthEffectsAvailable: false,
    holidayCalendarApplied: false,
    // Provenance — so the UI can show "seeded from NHS data" and replace
    // this when better data is available.
    source: 'nhs_oc_baseline',
    sourceMonth: baseline.month,
    sourceTotal: baseline.total,
    sourceClinical: baseline.clinical,
    sourceAdmin: baseline.admin,
    sourceUnknownOther: baseline.unknown_other,
    sourceBaselineAvg: round2(baselineAvg), // submissions per weekday
    // Hour pattern from NHS data — useful for intraday predictions even
    // though the existing model is daily-only. Future intraday models can
    // use this directly.
    hourPattern: baseline.by_hour || {},
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
