// lib/demand-recalibration.js
//
// Fits a per-practice demand model from uploaded daily request counts.
//
// Procedure:
//   1. Drop weekend rows (the model is Mon-Fri only)
//   2. Drop bank holidays / school holiday days (we want to model the
//      "normal" demand; holidays are added as additive effects later)
//   3. Linear regression: requests ~ days_since_first → growth slope + intercept
//   4. Detrend: residual = actual - predicted_from_trend
//   5. baseline = mean of detrended values (≈0 by construction; we use the
//      midpoint-of-trend value instead so prediction has a sensible anchor)
//   6. dowEffects[i] = mean of detrended values for that weekday
//   7. If span ≥ 270 days: monthEffects[m] = mean of detrended values for that month
//   8. Save settings
//
// Detrending matters because a practice with growing list size would
// otherwise show artificial seasonality (later months look bigger purely
// because they're more recent). Separating growth from seasonality is
// the whole reason the existing Winscombe model has both MONTHLY_TREND
// and MONTH_EFFECTS as distinct factors.

const MIN_SAMPLE_FOR_DOW = 20;        // need ≥4 of each weekday-ish for stable DOW
const MIN_SPAN_DAYS_FOR_MONTHS = 270; // ~9 months: full seasonal cycle minus a quarter

/**
 * @param {Array<{ date: string, count: number }>} rows  Sorted by date asc.
 * @param {Array<{ start: string, end: string }>} holidayRanges  School holiday ranges.
 * @returns {Object} demand_settings JSONB shape, or null if insufficient data.
 */
export function recalibrateDemandModel(rows, holidayRanges = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  // Build holiday lookup
  const holidaySet = new Set();
  for (const range of holidayRanges) {
    let d = new Date(range.start || range[0]);
    const end = new Date(range.end || range[1]);
    while (d <= end) {
      holidaySet.add(toIso(d));
      d.setDate(d.getDate() + 1);
    }
  }

  // Filter: weekdays only, exclude holidays, count > 0 sanity
  const points = [];
  for (const r of rows) {
    const d = new Date(r.date);
    const dow = d.getDay(); // 0=Sun..6=Sat
    if (dow === 0 || dow === 6) continue;
    if (holidaySet.has(r.date)) continue;
    if (r.count == null || r.count < 0) continue;
    points.push({ ...r, dow, jsDate: d });
  }

  if (points.length < MIN_SAMPLE_FOR_DOW) {
    return {
      sufficient: false,
      sampleSize: points.length,
      reason: `Need at least ${MIN_SAMPLE_FOR_DOW} non-holiday weekday data points (got ${points.length})`,
    };
  }

  // ─── Linear regression: count ~ daysSinceFirst ─────────────────
  const t0 = points[0].jsDate.getTime();
  const xs = points.map(p => (p.jsDate.getTime() - t0) / (1000 * 60 * 60 * 24));
  const ys = points.map(p => p.count);

  const meanX = mean(xs);
  const meanY = mean(ys);
  let sxy = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    sxx += (xs[i] - meanX) ** 2;
  }
  const growthPerDay = sxx === 0 ? 0 : sxy / sxx;
  // Intercept is at t=0 (the first data point). We anchor the baseline at
  // the midpoint of the data so future predictions extrapolate symmetrically.
  const baselineAtMidpoint = meanY; // = intercept + growthPerDay * meanX
  const referenceDate = new Date(t0 + meanX * 86400000);

  // ─── Detrend ───────────────────────────────────────────────────
  const residuals = points.map((p, i) => ({
    ...p,
    residual: p.count - (baselineAtMidpoint + growthPerDay * (xs[i] - meanX)),
  }));

  // ─── DOW effects: residual mean by weekday (Mon=0..Fri=4) ─────
  // Convert JS getDay() (Sun=0) to our index (Mon=0).
  const dowResiduals = [[], [], [], [], []];
  for (const p of residuals) {
    const idx = p.dow - 1; // Mon=1 in JS → 0 here
    if (idx >= 0 && idx < 5) dowResiduals[idx].push(p.residual);
  }
  const dowEffects = dowResiduals.map(arr => arr.length === 0 ? 0 : mean(arr));

  // ─── Month effects (only if we have enough span) ───────────────
  const spanDays = xs[xs.length - 1] - xs[0];
  let monthEffects = null;
  if (spanDays >= MIN_SPAN_DAYS_FOR_MONTHS) {
    const monthResiduals = Array.from({ length: 12 }, () => []);
    for (const p of residuals) {
      monthResiduals[p.jsDate.getMonth()].push(p.residual);
    }
    monthEffects = monthResiduals.map(arr => arr.length < 5 ? 0 : mean(arr));
  }

  return {
    sufficient: true,
    sampleSize: points.length,
    spanDays: Math.round(spanDays),
    baseline: round2(baselineAtMidpoint),
    growthPerDay: round4(growthPerDay),
    referenceDate: toIso(referenceDate),
    dowEffects: dowEffects.map(round2),
    monthEffects: monthEffects ? monthEffects.map(round2) : null,
    monthEffectsAvailable: monthEffects !== null,
    holidayCalendarApplied: holidayRanges.length > 0,
  };
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}
function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
function toIso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
