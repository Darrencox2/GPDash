// Unit tests for lib/meeting-schedules.js — date generation for recurring
// practice meetings.
//
// The stakes: generation runs repeatedly against a live table, so the property
// that actually matters is idempotence. A drift of one day between runs does
// not show up as an error — it shows up as two partners' meetings in the same
// week, every week, forever.
import { test, expect } from '@playwright/test';
import {
  generateOccurrences, missingOccurrences, describeSchedule,
  CADENCE_LABELS, DOW_LABELS, NTH_LABELS,
} from '../../lib/meeting-schedules.js';

// 2026-09-04 is a Friday. Used as `from` throughout so nothing depends on the
// day the suite happens to run.
const FRI = '2026-09-04';
const WED = 3, THU = 4, FRI_DOW = 5;

test.describe('weekly', () => {
  test('lands on the requested weekday and steps seven days', () => {
    const got = generateOccurrences({ cadence: 'weekly', day_of_week: WED }, 4, FRI);
    expect(got).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
  });

  test('includes today when today is the meeting day', () => {
    // Excluding it would silently skip the meeting being generated on its own
    // morning, which is exactly when someone runs the generator.
    const got = generateOccurrences({ cadence: 'weekly', day_of_week: FRI_DOW }, 2, FRI);
    expect(got[0]).toBe(FRI);
  });

  test('returns exactly the requested count', () => {
    expect(generateOccurrences({ cadence: 'weekly', day_of_week: WED }, 12, FRI)).toHaveLength(12);
  });
});

test.describe('fortnightly', () => {
  test('keeps the anchor parity rather than just doubling the step', () => {
    // The anchor is what stops a regenerated schedule landing on the off week.
    const anchored = { cadence: 'fortnightly', day_of_week: WED, anchor_date: '2026-09-09' };
    expect(generateOccurrences(anchored, 3, FRI)).toEqual(['2026-09-09', '2026-09-23', '2026-10-07']);
  });

  test('an anchor on the other parity shifts the whole series by a week', () => {
    const anchored = { cadence: 'fortnightly', day_of_week: WED, anchor_date: '2026-09-16' };
    expect(generateOccurrences(anchored, 3, FRI)).toEqual(['2026-09-16', '2026-09-30', '2026-10-14']);
  });

  test('steps a fortnight, not a week', () => {
    const got = generateOccurrences({ cadence: 'fortnightly', day_of_week: WED, anchor_date: '2026-09-09' }, 4, FRI);
    for (let i = 1; i < got.length; i++) {
      const gap = (new Date(got[i]) - new Date(got[i - 1])) / 86400000;
      expect(gap).toBe(14);
    }
  });
});

test.describe('monthly by day-of-month', () => {
  test('starts this month when the day is still ahead', () => {
    expect(generateOccurrences({ cadence: 'monthly', day_of_month: 20 }, 3, FRI))
      .toEqual(['2026-09-20', '2026-10-20', '2026-11-20']);
  });

  test('rolls to next month when the day has passed', () => {
    expect(generateOccurrences({ cadence: 'monthly', day_of_month: 1 }, 2, FRI))
      .toEqual(['2026-10-01', '2026-11-01']);
  });
});

test.describe('monthly on the nth weekday', () => {
  test('second Wednesday of each month', () => {
    const s = { cadence: 'monthly_nth', day_of_week: WED, week_of_month: 2 };
    expect(generateOccurrences(s, 3, FRI)).toEqual(['2026-09-09', '2026-10-14', '2026-11-11']);
  });

  test('week_of_month 5 means last, not "the fifth if there is one"', () => {
    // Treating 5 as a literal fifth would drop the meeting entirely in months
    // that only have four.
    const s = { cadence: 'monthly_nth', day_of_week: WED, week_of_month: 5 };
    const got = generateOccurrences(s, 4, FRI);
    expect(got).toHaveLength(4);
    for (const iso of got) {
      const d = new Date(iso + 'T00:00:00');
      expect(d.getDay()).toBe(WED);
      // Last of its month: another seven days would leave the month.
      expect(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate()).toBeLessThan(7);
    }
  });

  test('skips a month that has no nth occurrence rather than emitting a wrong date', () => {
    const s = { cadence: 'monthly_nth', day_of_week: THU, week_of_month: 5 };
    const got = generateOccurrences(s, 6, FRI);
    for (const iso of got) {
      expect(new Date(iso + 'T00:00:00').getDay()).toBe(THU);
    }
  });
});

test.describe('idempotence — the property that matters', () => {
  test('the same inputs give the same dates every time', () => {
    const s = { cadence: 'fortnightly', day_of_week: WED, anchor_date: '2026-09-09' };
    expect(generateOccurrences(s, 6, FRI)).toEqual(generateOccurrences(s, 6, FRI));
  });

  test('missingOccurrences returns nothing once everything exists', () => {
    const s = { cadence: 'weekly', day_of_week: WED };
    const all = generateOccurrences(s, 5, FRI);
    expect(missingOccurrences(s, all, 5, FRI)).toEqual([]);
  });

  test('missingOccurrences returns only the gaps', () => {
    const s = { cadence: 'weekly', day_of_week: WED };
    const all = generateOccurrences(s, 5, FRI);
    const have = [all[0], all[2], all[4]];
    expect(missingOccurrences(s, have, 5, FRI)).toEqual([all[1], all[3]]);
  });

  test('an empty or missing existing-list asks for everything', () => {
    const s = { cadence: 'weekly', day_of_week: WED };
    expect(missingOccurrences(s, [], 3, FRI)).toHaveLength(3);
    expect(missingOccurrences(s, null, 3, FRI)).toHaveLength(3);
  });
});

test.describe('bad input', () => {
  test('no schedule or no cadence gives no dates, not a throw', () => {
    expect(generateOccurrences(null, 5, FRI)).toEqual([]);
    expect(generateOccurrences({}, 5, FRI)).toEqual([]);
    expect(generateOccurrences({ cadence: 'yearly' }, 5, FRI)).toEqual([]);
  });
});

test.describe('describeSchedule', () => {
  test('produces a phrase for each cadence', () => {
    for (const cadence of Object.keys(CADENCE_LABELS)) {
      const s = { cadence, day_of_week: WED, day_of_month: 10, week_of_month: 2 };
      expect(typeof describeSchedule(s), cadence).toBe('string');
      expect(describeSchedule(s).length, cadence).toBeGreaterThan(0);
    }
  });

  test('the label tables are complete enough to index into', () => {
    expect(DOW_LABELS).toHaveLength(7);
    expect(DOW_LABELS[WED]).toBe('Wednesday');
    expect(NTH_LABELS[5]).toBe('last');
  });
});
