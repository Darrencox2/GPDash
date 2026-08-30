// Unit tests for lib/roomAllocation.js.
// matchesRecurrence decides whether a recurring room booking applies on a
// given date. Get it wrong and a clinic either loses its room or double-books
// one — the kind of thing a practice notices on the day, not before.
import { test, expect } from '@playwright/test';
import { matchesRecurrence, getRoomTypes, getRoomTypesForClinician, DEFAULT_ROOM_TYPES } from '../../lib/roomAllocation.js';

// Reference dates, all 2026. 1 June is a Monday.
const MON_1_JUN = '2026-06-01';
const TUE_2_JUN = '2026-06-02';
const MON_8_JUN = '2026-06-08';
const MON_15_JUN = '2026-06-15';
const SAT_6_JUN = '2026-06-06';
const SUN_7_JUN = '2026-06-07';

test.describe('matchesRecurrence — daily', () => {
  test('weekdays only, never weekends', () => {
    expect(matchesRecurrence({ frequency: 'daily' }, MON_1_JUN)).toBe(true);
    expect(matchesRecurrence({ frequency: 'daily' }, TUE_2_JUN)).toBe(true);
    expect(matchesRecurrence({ frequency: 'daily' }, SAT_6_JUN)).toBe(false);
    expect(matchesRecurrence({ frequency: 'daily' }, SUN_7_JUN)).toBe(false);
  });
});

test.describe('matchesRecurrence — weekly', () => {
  test('matches only the configured weekday (1 = Monday)', () => {
    expect(matchesRecurrence({ frequency: 'weekly', day: 1 }, MON_1_JUN)).toBe(true);
    expect(matchesRecurrence({ frequency: 'weekly', day: 1 }, TUE_2_JUN)).toBe(false);
    expect(matchesRecurrence({ frequency: 'weekly', day: 2 }, TUE_2_JUN)).toBe(true);
  });
});

test.describe('matchesRecurrence — biweekly', () => {
  test('alternates weeks from the start date', () => {
    const r = { frequency: 'biweekly', day: 1, startDate: MON_1_JUN };
    expect(matchesRecurrence(r, MON_1_JUN)).toBe(true);    // week 0
    expect(matchesRecurrence(r, MON_8_JUN)).toBe(false);   // week 1
    expect(matchesRecurrence(r, MON_15_JUN)).toBe(true);   // week 2
  });

  test('without a start date every matching weekday counts', () => {
    const r = { frequency: 'biweekly', day: 1 };
    expect(matchesRecurrence(r, MON_1_JUN)).toBe(true);
    expect(matchesRecurrence(r, MON_8_JUN)).toBe(true);
  });
});

test.describe('matchesRecurrence — monthly', () => {
  test('monthly_day picks the nth weekday of the month', () => {
    // 1 June 2026 is the 1st Monday; 8 June the 2nd.
    expect(matchesRecurrence({ frequency: 'monthly_day', day: 1, nth: 1 }, MON_1_JUN)).toBe(true);
    expect(matchesRecurrence({ frequency: 'monthly_day', day: 1, nth: 2 }, MON_1_JUN)).toBe(false);
    expect(matchesRecurrence({ frequency: 'monthly_day', day: 1, nth: 2 }, MON_8_JUN)).toBe(true);
  });

  test('monthly_date picks a day number regardless of weekday', () => {
    expect(matchesRecurrence({ frequency: 'monthly_date', dateOfMonth: 1 }, MON_1_JUN)).toBe(true);
    expect(matchesRecurrence({ frequency: 'monthly_date', dateOfMonth: 2 }, MON_1_JUN)).toBe(false);
    // Deliberately a weekend: monthly_date does not skip them.
    expect(matchesRecurrence({ frequency: 'monthly_date', dateOfMonth: 6 }, SAT_6_JUN)).toBe(true);
  });
});

test.describe('matchesRecurrence — first/last working day', () => {
  test('first working day of June 2026 is Monday the 1st', () => {
    expect(matchesRecurrence({ frequency: 'first_working' }, MON_1_JUN)).toBe(true);
    expect(matchesRecurrence({ frequency: 'first_working' }, TUE_2_JUN)).toBe(false);
  });

  test('last working day of June 2026 is Tuesday the 30th', () => {
    expect(matchesRecurrence({ frequency: 'last_working' }, '2026-06-30')).toBe(true);
    expect(matchesRecurrence({ frequency: 'last_working' }, '2026-06-29')).toBe(false);
  });

  test('a month ending at a weekend falls back to the Friday', () => {
    // 31 May 2026 is a Sunday, so the last working day is Friday the 29th.
    expect(matchesRecurrence({ frequency: 'last_working' }, '2026-05-29')).toBe(true);
    expect(matchesRecurrence({ frequency: 'last_working' }, '2026-05-31')).toBe(false);
  });
});

test.describe('matchesRecurrence — windows and bad input', () => {
  test('respects startDate and endDate', () => {
    const r = { frequency: 'weekly', day: 1, startDate: MON_8_JUN, endDate: MON_8_JUN };
    expect(matchesRecurrence(r, MON_1_JUN)).toBe(false);   // before
    expect(matchesRecurrence(r, MON_8_JUN)).toBe(true);    // inside
    expect(matchesRecurrence(r, MON_15_JUN)).toBe(false);  // after
  });

  test('no recurrence or unknown frequency never matches', () => {
    expect(matchesRecurrence(null, MON_1_JUN)).toBe(false);
    expect(matchesRecurrence({}, MON_1_JUN)).toBe(false);
    expect(matchesRecurrence({ frequency: 'sometimes' }, MON_1_JUN)).toBe(false);
  });
});

test.describe('room types', () => {
  test('falls back to the defaults when a practice has none configured', () => {
    expect(getRoomTypes(null).length).toBe(DEFAULT_ROOM_TYPES.length);
    expect(getRoomTypes({}).length).toBe(DEFAULT_ROOM_TYPES.length);
  });

  test('a clinician with no preference still gets a usable list', () => {
    expect(Array.isArray(getRoomTypesForClinician({}))).toBe(true);
    expect(Array.isArray(getRoomTypesForClinician(null))).toBe(true);
  });
});
