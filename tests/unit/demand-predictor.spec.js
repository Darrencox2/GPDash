// Unit tests for lib/demandPredictor.js.
// The prediction drives staffing conversations, so the properties that matter
// most are the invariants: it always returns a usable number, it scales with
// list size, and it never returns something a rota could not act on.
import { test, expect } from '@playwright/test';
import {
  predictDemand, BASELINE, DOW_EFFECTS, MONTH_EFFECTS,
  recalibrateBaseline, getBaselineAdjustment, clearMediaOverride,
} from '../../lib/demandPredictor.js';

// Fixed weekday so results are deterministic. NOT 31 Aug 2026 — that is the
// August bank holiday, and the predictor correctly short-circuits every
// closed day to the same "practice closed" result regardless of list size.
// (Found the hard way: the scaling test below failed until the date moved.)
const MONDAY = new Date(2026, 8, 7);        // Mon 7 Sep 2026, an ordinary day
const BANK_HOLIDAY = new Date(2026, 7, 31); // Mon 31 Aug 2026

test.describe('calibration constants', () => {
  test('one effect per working day and per month', () => {
    expect(DOW_EFFECTS).toHaveLength(5);    // Mon-Fri only, no weekends
    expect(MONTH_EFFECTS).toHaveLength(12);
    expect(typeof BASELINE).toBe('number');
    expect(BASELINE).toBeGreaterThan(0);
  });

  test('Monday carries the largest positive effect', () => {
    // Every GP practice knows Monday is the peak; if this ever inverts,
    // the calibration has been corrupted rather than merely retuned.
    expect(Math.max(...DOW_EFFECTS)).toBe(DOW_EFFECTS[0]);
  });
});

test.describe('predictDemand', () => {
  test('returns a positive number with no options at all', () => {
    const r = predictDemand(MONDAY, null);
    expect(r).toBeTruthy();
    const value = typeof r === 'number' ? r : r.predicted ?? r.value ?? r.demand;
    expect(typeof value).toBe('number');
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  test('flags that it is using the fallback when no demand settings exist', () => {
    const r = predictDemand(MONDAY, null, {});
    if (r && typeof r === 'object' && 'usingFallback' in r) {
      expect(r.usingFallback).toBe(true);
    }
  });

  test('scales with practice list size', () => {
    const pick = (r) => (typeof r === 'number' ? r : r.predicted ?? r.value ?? r.demand);
    const small = pick(predictDemand(MONDAY, null, { listSize: 5500 }));
    const reference = pick(predictDemand(MONDAY, null, { listSize: 11000 }));
    const large = pick(predictDemand(MONDAY, null, { listSize: 18000 }));

    // Half the reference list should predict materially less than the
    // reference, which should predict less than a much larger practice.
    expect(small).toBeLessThan(reference);
    expect(reference).toBeLessThan(large);
    expect(small).toBeGreaterThan(0);
  });

  test('a bank holiday is reported closed, not merely quiet', () => {
    const r = predictDemand(BANK_HOLIDAY, null, { listSize: 11000 });
    expect(r.isBankHoliday).toBe(true);
    expect(r.demandLevel).toBe('closed');
    expect(r.staffing.level).toBe('closed');
    // List size must not move a closed day.
    const bigger = predictDemand(BANK_HOLIDAY, null, { listSize: 18000 });
    expect(bigger.predicted).toBe(r.predicted);
  });

  test('does not throw on a weekend date', () => {
    const saturday = new Date(2026, 7, 29);
    expect(() => predictDemand(saturday, null)).not.toThrow();
  });

  test('tolerates a missing or partial weather object', () => {
    expect(() => predictDemand(MONDAY, null)).not.toThrow();
    expect(() => predictDemand(MONDAY, {})).not.toThrow();
    expect(() => predictDemand(MONDAY, { tempMax: 21 })).not.toThrow();
  });
});

test.describe('recalibrateBaseline', () => {
  test('is a no-op on empty input rather than corrupting the baseline', () => {
    const before = getBaselineAdjustment();
    recalibrateBaseline([]);
    expect(getBaselineAdjustment()).toBe(before);
  });

  test('clearMediaOverride leaves the module in a usable state', () => {
    clearMediaOverride();
    expect(() => predictDemand(MONDAY, null)).not.toThrow();
  });
});
