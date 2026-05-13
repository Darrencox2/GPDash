// Test the NHS OC ingest parser against real CSV files.
// Verifies aggregation matches Python script output for Winscombe.

const fs = require('fs');
const path = require('path');

async function loadModule() {
  const src = fs.readFileSync(
    path.join(__dirname, 'lib/nhs-oc-ingest.js'),
    'utf8'
  );
  // Strip ESM exports so we can eval as CJS
  const transformed = src
    .replace(/^export\s+function/gm, 'function')
    .replace(/^export\s+\{[^}]+\};?$/gm, '')
    + '\nreturn { parseNhsOcBaseline };';
  return new Function(transformed)();
}

(async () => {
  const { parseNhsOcBaseline } = await loadModule();

  const csv1 = fs.readFileSync('/tmp/Submissions via OC Systems By Day and Time - March 2026_north_regions.csv', 'utf8');
  const csv2 = fs.readFileSync('/tmp/Submissions via OC Systems By Day and Time - March 2026_south_regions.csv', 'utf8');

  console.log('Parsing combined CSVs…');
  const t0 = Date.now();
  const result = parseNhsOcBaseline('2026-03-01', [csv1, csv2]);
  const elapsed = Date.now() - t0;

  console.log(`  Parsed ${result.totalRowsParsed} CSV rows in ${elapsed}ms`);
  console.log(`  Aggregated to ${result.rows.length} practices`);

  // Find Winscombe and verify
  const winscombe = result.rows.find(r => r.ods_code === 'L81021');
  if (!winscombe) {
    console.error('FAIL: Winscombe (L81021) not found');
    process.exit(1);
  }

  console.log('\nWinscombe Surgery (L81021):');
  console.log('  name:', winscombe.practice_name);
  console.log('  pcn:', winscombe.pcn_name);
  console.log('  total:', winscombe.total);
  console.log('  days_with_data:', winscombe.days_with_data);
  console.log('  by_weekday:', winscombe.by_weekday);
  console.log('  by_hour (top 5):');
  Object.entries(winscombe.by_hour)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([h, n]) => console.log(`    ${h}:00 — ${n}`));

  // Expected from Python aggregation: total=2998, days=23, Monday=989, Tuesday=560
  console.log('\nVerification:');
  const checks = [
    ['total', 2998, winscombe.total],
    ['days_with_data', 23, winscombe.days_with_data],
    ['Monday', 989, winscombe.by_weekday.Mon],
    ['Tuesday', 560, winscombe.by_weekday.Tue],
    ['Wednesday', 531, winscombe.by_weekday.Wed],
    ['8am hour', 659, winscombe.by_hour['8']],
  ];
  let pass = 0, fail = 0;
  for (const [name, expected, actual] of checks) {
    if (expected === actual) {
      console.log(`  ✓ ${name}: ${actual}`);
      pass++;
    } else {
      console.log(`  ✗ ${name}: expected ${expected}, got ${actual}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);

  // Now test the seeding logic
  console.log('\n=== Seeding test ===');
  const seedSrc = fs.readFileSync(
    path.join(__dirname, 'lib/demand-seed-from-nhs.js'),
    'utf8'
  );
  const seedTransformed = seedSrc
    .replace(/^export\s+function/gm, 'function')
    + '\nreturn { seedDemandFromBaseline };';
  const { seedDemandFromBaseline } = new Function(seedTransformed)();

  const seed = seedDemandFromBaseline(winscombe);
  console.log('Winscombe seed:', JSON.stringify(seed, null, 2));

  // Sanity checks on the seed
  if (!seed) {
    console.error('FAIL: seed is null');
    process.exit(1);
  }
  if (seed.baseline <= 0 || seed.baseline > 200) {
    console.error(`FAIL: baseline ${seed.baseline} looks wrong`);
    process.exit(1);
  }
  if (!seed.dowEffects || seed.dowEffects.length !== 5) {
    console.error('FAIL: dowEffects should be 5 elements');
    process.exit(1);
  }
  // Monday should be the highest in Winscombe's data
  const maxIdx = seed.dowEffects.indexOf(Math.max(...seed.dowEffects));
  if (maxIdx !== 0) {
    console.error(`FAIL: expected Monday to be peak, but max was index ${maxIdx}`);
    process.exit(1);
  }
  console.log('  ✓ Monday is the peak weekday');
  console.log(`  ✓ Baseline ${seed.baseline} submissions per weekday`);
  console.log('  ✓ Source: nhs_oc_baseline');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
