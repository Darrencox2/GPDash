// Buddy cover: CPD is a day off, not leave.
//
// A clinician on CPD gets View-only cover, upgraded to File & Action only
// when the next day they are actually in (skipping further CPD days) is
// leave. Leave BEFORE a CPD day does not upgrade it, and CPD no longer
// upgrades a neighbouring ordinary day off.
import { test, expect } from '@playwright/test';
import { computeDayStatus, isCpdAbsence, isCpdOn } from '../../lib/data.js';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// 12 October 2026 is a Monday.
const D = { Monday: '2026-10-12', Tuesday: '2026-10-13', Wednesday: '2026-10-14' };
const clin = (id) => ({ id, initials: `C${id}`, name: `C${id}`, buddyCover: true, status: 'active' });
const cpd = (id, s, e = s) => ({ clinicianId: id, startDate: s, endDate: e, reason: 'Training/Cpd' });
const al = (id, s, e = s) => ({ clinicianId: id, startDate: s, endDate: e, reason: 'Holiday' });
const make = (abs, offMonday = false) => ({
  clinicians: [clin(1), clin(2), clin(3)],
  weeklyRota: Object.fromEntries(DAYS.map((d) => [d, offMonday && d === 'Monday' ? [2, 3] : [1, 2, 3]])),
  plannedAbsences: abs,
});
const on = (data, day) => computeDayStatus(data, D[day], day);

test.describe('CPD buddy cover', () => {
  test('CPD day with a normal day after is View only', () => {
    const s = on(make([cpd(1, D.Tuesday)]), 'Tuesday');
    expect(s.dayOff).toEqual([1]);
    expect(s.absent).toEqual([]);
    expect(s.cpd).toEqual([1]);
  });

  test('CPD day followed by leave is File & Action', () => {
    const s = on(make([cpd(1, D.Tuesday), al(1, D.Wednesday)]), 'Tuesday');
    expect(s.absent).toEqual([1]);
    expect(s.dayOff).toEqual([]);
  });

  test('leave before a CPD day does not upgrade it', () => {
    const s = on(make([al(1, D.Monday), cpd(1, D.Tuesday)]), 'Tuesday');
    expect(s.dayOff).toEqual([1]);
  });

  test('consecutive CPD days are skipped to find the next day in', () => {
    const s = on(make([cpd(1, D.Monday, D.Tuesday), al(1, D.Wednesday)]), 'Monday');
    expect(s.absent).toEqual([1]);
  });

  test('annual leave is unchanged', () => {
    const s = on(make([al(1, D.Tuesday)]), 'Tuesday');
    expect(s.absent).toEqual([1]);
    expect(s.cpd).toEqual([]);
  });

  test('an ordinary day off before CPD stays View only', () => {
    expect(on(make([cpd(1, D.Tuesday)], true), 'Monday').dayOff).toEqual([1]);
    expect(on(make([al(1, D.Tuesday)], true), 'Monday').absent).toEqual([1]);
  });

  test('half-day CPD leaves a full-day clinician in', () => {
    const s = on(make([{ ...cpd(1, D.Tuesday), session: 'am' }]), 'Tuesday');
    expect(s.present).toContain(1);
  });

  test('CPD is recognised from the TeamNet label and the public feed flag', () => {
    expect(isCpdAbsence({ reason: 'Training/Cpd' })).toBe(true);
    expect(isCpdAbsence({ cpd: true })).toBe(true);
    expect(isCpdAbsence({ reason: 'Holiday' })).toBe(false);
    expect(isCpdOn(make([cpd(1, D.Tuesday)]), 1, D.Tuesday)).toBe(true);
    expect(isCpdOn(make([cpd(1, D.Tuesday)]), 1, D.Monday)).toBe(false);
  });
});
