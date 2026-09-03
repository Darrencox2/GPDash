// Unit tests for lib/huddle-trim.js — the server-side retention window on the
// huddle CSV blob.
//
// The stakes are recorded in the module header and they are not theoretical:
// on 2026-08-09 a database trim was overwritten within minutes by a stale open
// tab re-sending an 8-year, 4.4MB blob, which then broke the huddle-data
// endpoint against Vercel's response limit. This function is the reason that
// cannot happen again, so its window arithmetic and its date rebuild both need
// to be pinned.
import { test, expect } from '@playwright/test';
import { trimHuddleWindow } from '../../lib/huddle-trim.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// EMIS writes "DD-Mon-YYYY". Build one that many days from today.
function emisDateOffset(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function blobWith(offsets) {
  const dateData = {};
  const slotRows = {};
  for (const o of offsets) {
    const ds = emisDateOffset(o);
    dateData[ds] = { total: 10 };
    slotRows[ds] = [{ time: 'Before 12:59' }];
  }
  return { dates: Object.keys(dateData), dateData, slotRows };
}

test.describe('the window boundaries', () => {
  test('keeps today and drops what falls outside the default window', () => {
    const blob = blobWith([-200, -125, -124, 0, 92, 93, 200]);
    const out = trimHuddleWindow(blob);
    // Default window is 124 days back, 92 forward, inclusive at both ends.
    expect(Object.keys(out.dateData)).toEqual(expect.arrayContaining([
      emisDateOffset(-124), emisDateOffset(0), emisDateOffset(92),
    ]));
    expect(out.dateData[emisDateOffset(-125)]).toBeUndefined();
    expect(out.dateData[emisDateOffset(-200)]).toBeUndefined();
    expect(out.dateData[emisDateOffset(93)]).toBeUndefined();
    expect(out.dateData[emisDateOffset(200)]).toBeUndefined();
  });

  test('honours a custom window', () => {
    const blob = blobWith([-30, -5, 5, 30]);
    const out = trimHuddleWindow(blob, { pastDays: 10, futureDays: 10 });
    expect(Object.keys(out.dateData).sort()).toEqual(
      [emisDateOffset(-5), emisDateOffset(5)].sort()
    );
  });

  test('trims every date-keyed store, not just dateData', () => {
    // slotRows is the big one — leaving it untrimmed is what blew the payload
    // limit even when dateData looked small.
    const blob = blobWith([-500, 0]);
    const out = trimHuddleWindow(blob);
    expect(Object.keys(out.slotRows)).toEqual([emisDateOffset(0)]);
  });
});

test.describe('the rebuilt dates array', () => {
  test('is rebuilt from the surviving data, not carried over', () => {
    const blob = blobWith([-500, -1, 0, 1]);
    const out = trimHuddleWindow(blob);
    // A stale dates array pointing at pruned keys is what makes the huddle
    // render empty days rather than no days.
    expect(out.dates).not.toContain(emisDateOffset(-500));
    for (const ds of out.dates) expect(out.dateData[ds]).toBeDefined();
  });

  test('comes back in chronological order', () => {
    const blob = blobWith([5, -5, 0, -2, 3]);
    const out = trimHuddleWindow(blob);
    expect(out.dates).toEqual([
      emisDateOffset(-5), emisDateOffset(-2), emisDateOffset(0),
      emisDateOffset(3), emisDateOffset(5),
    ]);
  });
});

test.describe('malformed and hostile input', () => {
  test('unparseable date keys are dropped rather than kept forever', () => {
    // A key that no parser understands must not be treated as in-window; that
    // would let junk accumulate indefinitely, which is the failure this
    // module exists to prevent.
    const blob = {
      dates: ['not-a-date'],
      dateData: { 'not-a-date': { total: 1 }, '2026-09-04': { total: 1 }, [emisDateOffset(0)]: { total: 1 } },
    };
    const out = trimHuddleWindow(blob);
    expect(out.dateData['not-a-date']).toBeUndefined();
    expect(out.dateData['2026-09-04']).toBeUndefined();  // ISO form is not EMIS form
    expect(out.dateData[emisDateOffset(0)]).toBeDefined();
  });

  test('accepts the four-letter Sept spelling', () => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (d.getMonth() === 8) {
      const ds = `${String(d.getDate()).padStart(2, '0')}-Sept-${d.getFullYear()}`;
      const out = trimHuddleWindow({ dates: [ds], dateData: { [ds]: { total: 1 } } });
      expect(out.dateData[ds]).toBeDefined();
    }
  });

  test('null, non-object and shapeless input come back untouched', () => {
    expect(trimHuddleWindow(null)).toBe(null);
    expect(trimHuddleWindow(undefined)).toBe(undefined);
    const noDates = { dateData: {} };
    expect(trimHuddleWindow(noDates)).toBe(noDates);
  });

  test('unknown properties pass through', () => {
    const blob = { ...blobWith([0]), settings: { keepMe: true }, version: 3 };
    const out = trimHuddleWindow(blob);
    expect(out.settings).toEqual({ keepMe: true });
    expect(out.version).toBe(3);
  });

  test('does not mutate the blob it was given', () => {
    const blob = blobWith([-500, 0]);
    const before = JSON.stringify(blob);
    trimHuddleWindow(blob);
    expect(JSON.stringify(blob)).toBe(before);
  });
});
