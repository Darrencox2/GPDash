// Unit tests for the v3-blob -> daily_overrides migration.
//
// This is the piece that could silently corrupt the huddle board: every
// consumer derives `absent = scheduled - present` (lib/data.js:385), so if
// the round-trip through the table changes either set, the practice sees the
// wrong people marked absent. These tests pin that it does not.
import { test, expect } from '@playwright/test';
import { dailyOverridesFromRows, syncDailyOverrides } from '../../lib/v4-data.js';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

// 17 June 2026 is a Wednesday — the key format the app writes is
// `${YYYY-MM-DD}-${WeekdayName}`.
const KEY = '2026-06-17-Wednesday';

test.describe('dailyOverridesFromRows', () => {
  test('rebuilds the v3 day key including the weekday name', () => {
    const out = dailyOverridesFromRows([{ clinician_id: A, date: '2026-06-17', am: 'in', pm: 'in' }]);
    expect(Object.keys(out)).toEqual([KEY]);
  });

  test("'in' lands in present and scheduled; 'off' in scheduled only", () => {
    const out = dailyOverridesFromRows([
      { clinician_id: A, date: '2026-06-17', am: 'in',  pm: 'in'  },
      { clinician_id: B, date: '2026-06-17', am: 'off', pm: 'off' },
    ]);
    expect(out[KEY].present.sort()).toEqual([A]);
    expect(out[KEY].scheduled.sort()).toEqual([A, B].sort());
  });

  test('present if EITHER session is in — day-level v3 semantics', () => {
    const out = dailyOverridesFromRows([
      { clinician_id: A, date: '2026-06-17', am: 'in',  pm: 'off' },
      { clinician_id: B, date: '2026-06-17', am: 'off', pm: 'in'  },
    ]);
    expect(out[KEY].present.sort()).toEqual([A, B].sort());
  });

  test('groups multiple dates independently', () => {
    const out = dailyOverridesFromRows([
      { clinician_id: A, date: '2026-06-17', am: 'in', pm: 'in' },
      { clinician_id: A, date: '2026-06-18', am: 'off', pm: 'off' },
    ]);
    expect(Object.keys(out).sort()).toEqual(['2026-06-17-Wednesday', '2026-06-18-Thursday']);
  });

  test('tolerates junk rows rather than throwing', () => {
    expect(dailyOverridesFromRows(null)).toEqual({});
    expect(dailyOverridesFromRows([{}, { date: '2026-06-17' }, { clinician_id: A }])).toEqual({});
  });
});

test.describe('round trip preserves the absent set', () => {
  // The only thing consumers actually derive from this data.
  const absentOf = (day) => (day.scheduled || []).filter(id => !(day.present || []).includes(id)).sort();

  const cases = [
    ['everyone in',        { present: [A, B], scheduled: [A, B] }],
    ['one absent',         { present: [A],    scheduled: [A, B] }],
    ['all absent',         { present: [],     scheduled: [A, B] }],
    ['unexpected arrival', { present: [A, C], scheduled: [A, B] }],
    ['empty day',          { present: [],     scheduled: []     }],
  ];

  for (const [name, v3] of cases) {
    test(name, () => {
      // v3 blob -> rows (mirrors the SQL backfill and syncDailyOverrideOps)
      const union = [...new Set([...v3.present, ...v3.scheduled])];
      const rows = union.map(cid => {
        const state = v3.present.includes(cid) ? 'in' : 'off';
        return { clinician_id: cid, date: '2026-06-17', am: state, pm: state };
      });
      // rows -> v3 blob
      const back = dailyOverridesFromRows(rows)[KEY] || { present: [], scheduled: [] };
      expect(absentOf(back)).toEqual(absentOf(v3));
    });
  }
});

test.describe('syncDailyOverrides', () => {
  // Minimal stub recording what would be sent.
  const stub = () => {
    const calls = [];
    const api = {
      from(table) {
        const ctx = { table, kind: null, filters: {}, rows: null };
        calls.push(ctx);
        const chain = {
          delete() { ctx.kind = 'delete'; return chain; },
          upsert(rows) { ctx.kind = 'upsert'; ctx.rows = rows; return chain; },
          eq(k, v) { ctx.filters[k] = v; return chain; },
          in(k, v) { ctx.filters[k] = v; return chain; },
          // Supabase queries are thenables; awaiting resolves them.
          then(res) { return Promise.resolve({ error: null }).then(res); },
        };
        return chain;
      },
    };
    return { api, calls };
  };

  test('does nothing when no day changed', async () => {
    const { api, calls } = stub();
    const map = { [KEY]: { present: [A], scheduled: [A, B] } };
    await syncDailyOverrides(api, [A, B], map, map);
    expect(calls).toHaveLength(0);
  });

  test('replaces only the changed date', async () => {
    const { api, calls } = stub();
    const before = { [KEY]: { present: [A], scheduled: [A, B] }, '2026-06-18-Thursday': { present: [A], scheduled: [A] } };
    const after  = { [KEY]: { present: [],  scheduled: [A, B] }, '2026-06-18-Thursday': { present: [A], scheduled: [A] } };
    await syncDailyOverrides(api, [A, B], before, after);
    const dates = calls.filter(c => c.kind === 'delete').map(c => c.filters.date);
    expect(dates).toEqual(['2026-06-17']);   // Thursday untouched
  });

  test('writes off for scheduled-but-not-present', async () => {
    const { api, calls } = stub();
    await syncDailyOverrides(api, [A, B], {}, { [KEY]: { present: [A], scheduled: [A, B] } });
    const rows = calls.find(c => c.kind === 'upsert').rows;
    expect(rows.find(r => r.clinician_id === A)).toMatchObject({ am: 'in', pm: 'in' });
    expect(rows.find(r => r.clinician_id === B)).toMatchObject({ am: 'off', pm: 'off' });
  });

  test('ignores clinician ids outside the practice', async () => {
    const { api, calls } = stub();
    await syncDailyOverrides(api, [A], {}, { [KEY]: { present: [A, C], scheduled: [A, C] } });
    const rows = calls.find(c => c.kind === 'upsert').rows;
    expect(rows.map(r => r.clinician_id)).toEqual([A]);
  });

  test('no clinicians means no writes at all', async () => {
    const { api, calls } = stub();
    await syncDailyOverrides(api, [], {}, { [KEY]: { present: [A], scheduled: [A] } });
    expect(calls).toHaveLength(0);
  });

  // The bug that emptied daily_overrides in production testing: deletes and
  // the upsert were handed to the caller's Promise.all together, so a delete
  // could land after the upsert and wipe what had just been written.
  test('every delete completes before the upsert', async () => {
    const order = [];
    const api = {
      from() {
        const chain = {
          delete() { chain._kind = 'delete'; return chain; },
          upsert() { chain._kind = 'upsert'; return chain; },
          eq() { return chain; },
          in() { return chain; },
          then(res) { order.push(chain._kind); return Promise.resolve({ error: null }).then(res); },
        };
        return chain;
      },
    };
    await syncDailyOverrides(api, [A, B], {}, {
      [KEY]: { present: [A], scheduled: [A, B] },
      '2026-06-18-Thursday': { present: [B], scheduled: [A, B] },
    });
    expect(order.length).toBeGreaterThan(1);
    expect(order[order.length - 1]).toBe('upsert');          // upsert is last
    expect(order.slice(0, -1).every(k => k === 'delete')).toBe(true);
  });
});
