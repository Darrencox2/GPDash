// Test demandPredictor refactor:
//   1. Calling predictDemand(date, weather) with no options gives same
//      result as before (Winscombe-calibrated)
//   2. Passing demandSettings overrides baseline + dowEffects + monthEffects

const { predictDemand } = require('./lib/demandPredictor.js');

// Pick a known weekday — Wednesday 2026-04-08 (after refactor, still in
// Winscombe-default mode this should give similar numbers to before)
const testDate = new Date('2026-04-08T12:00:00');

// Test 1: no options → Winscombe defaults
const r1 = predictDemand(testDate, null);
console.log(`Test 1 (Winscombe defaults): predicted=${r1.predicted}, baseline=${r1.factors.baseline}, dow=${r1.factors.dayOfWeek?.effect}`);
const test1Pass = r1.predicted > 0 && r1.factors.baseline === 131.38;
console.log(`  ${test1Pass ? '✓' : '✗'} Uses Winscombe baseline (131.38)`);

// Test 2: per-practice settings override
const customSettings = {
  baseline: 200.0,
  dowEffects: [10, 5, 0, -5, -10],
  monthEffects: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  growthPerDay: 0.1,
  referenceDate: '2026-01-01',
};
const r2 = predictDemand(testDate, null, { demandSettings: customSettings });
console.log(`Test 2 (custom): predicted=${r2.predicted}, baseline=${r2.factors.baseline}, dow=${r2.factors.dayOfWeek?.effect}`);
const test2Pass = r2.factors.baseline === 200 && r2.factors.dayOfWeek?.effect === 0; // Wed = index 2
console.log(`  ${test2Pass ? '✓' : '✗'} Uses custom baseline (200) + dowEffects (Wed=0)`);

// Test 3: passing custom school holidays
const r3a = predictDemand(testDate, null);
const customHols = [{ start: '2026-04-06', end: '2026-04-17' }]; // 2-week April hols covering test date
const r3b = predictDemand(testDate, null, { schoolHolidayRanges: customHols });
console.log(`Test 3 (school hols): defaults predicted=${r3a.predicted}, custom=${r3b.predicted}`);
const test3Pass = r3b.factors.schoolHoliday !== undefined; // should detect holiday
console.log(`  ${test3Pass ? '✓' : '✗'} Custom holiday set applied (factor present)`);

// Test 4: passing baselineAdjustment
const r4 = predictDemand(testDate, null, { baselineAdjustment: 25 });
console.log(`Test 4 (baselineAdj +25): predicted=${r4.predicted}, recal=${r4.factors.recalibration}`);
const test4Pass = r4.factors.recalibration === 25;
console.log(`  ${test4Pass ? '✓' : '✗'} Per-call baselineAdjustment applied`);

const allPass = test1Pass && test2Pass && test3Pass && test4Pass;
console.log(`\n${allPass ? 'ALL PASS' : 'FAILURES'} — backward compat ${test1Pass ? 'preserved' : 'BROKEN'}`);
process.exit(allPass ? 0 : 1);
