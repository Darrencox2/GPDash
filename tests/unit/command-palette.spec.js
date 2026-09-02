// The ⌘K palette's date and week parsing.
import { test, expect } from '@playwright/test';
import { parseDateQuery, parseWeekQuery } from '../../components/CommandPalette.js';

const WED = new Date(2026, 8, 2, 9, 0, 0); // Wednesday 2 September 2026
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test.describe('parseDateQuery', () => {
  test('today, tomorrow, yesterday', () => {
    expect(iso(parseDateQuery('today', WED).date)).toBe('2026-09-02');
    expect(iso(parseDateQuery('tomorrow', WED).date)).toBe('2026-09-03');
    expect(iso(parseDateQuery('yesterday', WED).date)).toBe('2026-09-01');
  });
  test('a weekday is the next one, including today', () => {
    expect(iso(parseDateQuery('wednesday', WED).date)).toBe('2026-09-02');
    expect(iso(parseDateQuery('fri', WED).date)).toBe('2026-09-04');
    expect(iso(parseDateQuery('monday', WED).date)).toBe('2026-09-07');
  });
  test('next and last skip a week', () => {
    expect(iso(parseDateQuery('next wednesday', WED).date)).toBe('2026-09-09');
    expect(iso(parseDateQuery('next tue', WED).date)).toBe('2026-09-15');
    expect(iso(parseDateQuery('last friday', WED).date)).toBe('2026-08-28');
  });
  test('day and month, this year or the next', () => {
    expect(iso(parseDateQuery('14 sep', WED).date)).toBe('2026-09-14');
    expect(iso(parseDateQuery('14/9', WED).date)).toBe('2026-09-14');
    expect(iso(parseDateQuery('3 jan', WED).date)).toBe('2027-01-03');   // already passed this year
    expect(iso(parseDateQuery('3 jan 26', WED).date)).toBe('2026-01-03');
  });
  test('not a date', () => {
    expect(parseDateQuery('capacity', WED)).toBeNull();
    expect(parseDateQuery('40 sep', WED)).toBeNull();
    expect(parseDateQuery('', WED)).toBeNull();
  });
});

test.describe('parseWeekQuery', () => {
  test('week 1 to 6', () => {
    expect(parseWeekQuery('week 3')).toBe(3);
    expect(parseWeekQuery('wk3')).toBe(3);
    expect(parseWeekQuery('w 6')).toBe(6);
    expect(parseWeekQuery('week 7')).toBeNull();
    expect(parseWeekQuery('weekly')).toBeNull();
  });
});
