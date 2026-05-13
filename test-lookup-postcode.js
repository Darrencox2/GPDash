// Test /api/v4/lookup-practice-postcode against mocked OpenPrescribing
// + postcodes.io responses.

const fs = require('fs');
const path = require('path');

async function loadRoute() {
  const src = fs.readFileSync(
    path.join(__dirname, 'app/api/v4/lookup-practice-postcode/route.js'),
    'utf8'
  );
  const transformed = src
    .replace(/^import\s+\{?\s*NextResponse\s*\}?\s+from\s+'next\/server';?$/m,
      "const NextResponse = { json: (data, init) => ({ data, status: init?.status || 200 }) };")
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+async\s+function/m, 'async function');
  const fn = new Function(transformed + '\nreturn GET;');
  return fn();
}

async function runTest(name, mockResponses, query) {
  console.log(`\n— ${name}`);
  let i = 0;
  global.fetch = async (url, opts) => {
    const m = mockResponses[i++];
    if (!m) throw new Error(`Unexpected fetch to ${url}`);
    const bodyStr = m.bodyText !== undefined
      ? m.bodyText
      : (m.body != null ? JSON.stringify(m.body) : '');
    return {
      ok: m.ok !== false,
      status: m.status || 200,
      json: async () => m.body,
      text: async () => bodyStr,
    };
  };
  const GET = await loadRoute();
  const result = await GET({ url: `http://localhost/api/v4/lookup-practice-postcode?${query}` });
  console.log('  status:', result.status);
  console.log('  postcode:', result.data.postcode ?? '(null)');
  if (result.data.reason) console.log('  reason:', result.data.reason);
  if (result.data.lat) console.log('  lat/lng:', result.data.lat, '/', result.data.lng);
  return result;
}

(async () => {
  // Test 1: invalid ODS
  const r1 = await runTest('invalid ODS', [], 'ods=');
  if (r1.status !== 400) { console.error('FAIL: should be 400'); process.exit(1); }

  // Test 2: happy path
  await runTest('happy path: org_location returns feature, postcodes.io returns nearest', [
    {
      // OpenPrescribing org_location response
      body: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { code: 'L82085', name: 'WINSCOMBE & BANWELL FAMILY PRACTICE' },
          geometry: { type: 'Point', coordinates: [-2.8389, 51.3239] },
        }],
      },
    },
    {
      // postcodes.io reverse response
      body: {
        status: 200,
        result: [{
          postcode: 'BS25 1HZ',
          admin_district: 'North Somerset',
          region: 'South West',
          country: 'England',
        }],
      },
    },
  ], 'ods=L82085');

  // Test 3: org_location returns empty
  await runTest('org_location returns empty', [
    { body: { type: 'FeatureCollection', features: [] } },
  ], 'ods=ZZZ123');

  // Test 4: postcodes.io fails
  await runTest('postcodes.io 500', [
    {
      body: { features: [{ properties: { code: 'L82085' }, geometry: { coordinates: [-2.83, 51.32] } }] },
    },
    { ok: false, status: 500, body: null },
  ], 'ods=L82085');

  // Test 5: org_location returns HTML (Django REST default)
  await runTest('org_location returns HTML (no format=json equivalent issue)', [
    {
      ok: true, status: 200,
      bodyText: '<!DOCTYPE html><html>...not JSON...',
    },
  ], 'ods=L82085');

  // Test 6: invalid characters in ODS
  const r6 = await runTest('invalid ODS chars', [], 'ods=L82085;DROP');
  if (r6.status !== 400) { console.error('FAIL: should reject bad chars'); process.exit(1); }

  console.log('\n— All tests completed');
})().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
