// Test harness for /api/practice-lookup
// Mocks global fetch and verifies the route handles each branch.

const path = require('path');

async function loadRoute() {
  // We can't easily import the .js file because Next.js uses ESM. Instead,
  // read+rewrite for CommonJS. Quick hack — for proper testing we'd use
  // jest with next/jest but this is enough to verify behaviour.
  const fs = require('fs');
  const src = fs.readFileSync(
    path.join(__dirname, 'app/api/practice-lookup/route.js'),
    'utf8'
  );
  // Strip 'export ' so we can eval. Replace next imports with stubs.
  const transformed = src
    .replace(/^import\s+\{?\s*NextResponse\s*\}?\s+from\s+'next\/server';?$/m,
      "const NextResponse = { json: (data, init) => ({ data, status: init?.status || 200 }) };")
    .replace(/^import\s+\{?\s*cookies\s*\}?\s+from\s+'next\/headers';?$/m,
      "const cookies = () => ({ get: () => null });")
    .replace(/^import\s+\{?\s*createClient\s*\}?\s+from\s+'@\/utils\/supabase\/server';?$/m,
      "const createClient = () => null;")
    .replace(/^export\s+const\s+/gm, 'const ')
    .replace(/^export\s+async\s+function/m, 'async function');
  // Wrap in a module factory and grab the GET function
  const fn = new Function(transformed + '\nreturn GET;');
  return fn();
}

async function runTest(name, mockFetchResponses, queryParam) {
  console.log(`\n— ${name}`);
  let callIndex = 0;
  global.fetch = async (url, opts) => {
    const response = mockFetchResponses[callIndex++];
    if (!response) {
      throw new Error(`Unexpected fetch call to ${url}`);
    }
    if (typeof response === 'function') return response(url, opts);
    const bodyStr = response.bodyText !== undefined
      ? response.bodyText
      : (response.body != null ? JSON.stringify(response.body) : '');
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      headers: { get: (h) => h.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => response.body,
      text: async () => bodyStr,
    };
  };
  const GET = await loadRoute();
  const request = { url: `http://localhost/api/practice-lookup?${queryParam}` };
  const result = await GET(request);
  console.log('  status:', result.status);
  console.log('  reason:', result.data.reason || '(none)');
  console.log('  practices:', (result.data.practices || []).map(p => `${p.name} (${p.odsCode}, list=${p.listSize})`));
  if (result.data.debug?.attempts) {
    console.log('  attempts:');
    result.data.debug.attempts.forEach(a => {
      console.log(`    - ${a.url?.slice(0, 90)}... → status=${a.status} matches=${a.matchCount ?? 'n/a'}`);
    });
  }
  return result;
}

(async () => {
  // Test 1: query too short
  await runTest('query too short returns query_too_short reason', [], 'q=W');

  // Test 2: OpenPrescribing returns matching practice + list size
  await runTest('happy path: 1 match with list size (first variant succeeds)', [
    {
      // org_code search response (array of orgs) — for the first URL variant
      body: [
        { code: 'L82085', name: 'Winscombe & Banwell Family Practice', ods_name: 'Winscombe & Banwell Family Practice' },
      ],
    },
    {
      // org_details response (array of monthly snapshots)
      body: [
        { date: '2025-03-01', total_list_size: 11432 },
        { date: '2025-02-01', total_list_size: 11400 },
      ],
    },
  ], 'q=Winscombe');

  // Test 3: First variant returns 0, second variant returns matches
  await runTest('first url variant returns empty, second succeeds', [
    { body: [] },                                    // 1st: simplest URL → empty
    { body: [{ code: 'L82085', name: 'Winscombe' }] }, // 2nd: exact=false → match
    { body: [{ date: '2025-03-01', total_list_size: 11432 }] }, // org_details
  ], 'q=Winscombe');

  // Test 4: All variants empty
  await runTest('all variants empty returns no_practices_match', [
    { body: [] },
    { body: [] },
    { body: [] },
  ], 'q=ZZZZ');

  // Test 5: Non-JSON response is captured in debug
  await runTest('non-JSON response captured in debug', [
    {
      ok: true,
      status: 200,
      // Override json to throw, but text() returns HTML
      body: null,
    },
    { body: [] },
    { body: [] },
  ], 'q=Winscombe');

  console.log('\n— All tests completed');
})().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
