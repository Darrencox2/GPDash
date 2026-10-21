// Buddy board week arrows across a clock change.
//
// Stepping by 7 * 24 hours from Monday 19 October 2026 (BST) lands at 11pm
// on Sunday 25 October (GMT), so the whole next week read and saved one day
// early. addWeeks steps by calendar days and must land on Monday midnight
// either side of both clock changes.
import { test, expect } from '@playwright/test';
import { addWeeks, getWeekStart, toLocalIso } from '../../lib/data.js';

const at = (y, m, d) => new Date(y, m - 1, d);
let savedTz;

test.describe('week stepping', () => {
  test.beforeAll(() => { savedTz = process.env.TZ; process.env.TZ = 'Europe/London'; });
  test.afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; });

  test('forward over the clocks going back lands on Monday 26 October', () => {
    const next = addWeeks(at(2026, 10, 19), 1);
    expect(toLocalIso(next)).toBe('2026-10-26');
    expect(next.getDay()).toBe(1);
    expect(next.getHours()).toBe(0);
  });

  test('back over the clocks going back lands on Monday 19 October', () => {
    expect(toLocalIso(addWeeks(at(2026, 10, 26), -1))).toBe('2026-10-19');
  });

  test('over the clocks going forward stays on Monday midnight', () => {
    const next = addWeeks(at(2027, 3, 22), 1);
    expect(toLocalIso(next)).toBe('2027-03-29');
    expect(next.getHours()).toBe(0);
    expect(toLocalIso(addWeeks(next, -1))).toBe('2027-03-22');
  });

  test('a year of steps forward and back keeps Mondays and returns home', () => {
    const start = getWeekStart(at(2026, 10, 21));
    let d = start;
    for (let i = 0; i < 52; i++) {
      d = addWeeks(d, 1);
      expect(d.getDay()).toBe(1);
      expect(d.getHours()).toBe(0);
    }
    expect(toLocalIso(addWeeks(d, -52))).toBe(toLocalIso(start));
  });

  test('the old millisecond step really was a day out', () => {
    const old = new Date(at(2026, 10, 19).getTime() + 7 * 86400000);
    expect(toLocalIso(old)).toBe('2026-10-25');
  });
});
