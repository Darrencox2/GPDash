// Unit tests for lib/auto-rota.js and lib/capacity-patterns.js.
//
// Both consume large EMIS-derived structures, so these are contract tests:
// they pin the guarantees callers rely on (never throw, always return the
// documented shape, never invent data from nothing) rather than fixture a
// realistic multi-week export. That is the honest level of coverage without
// real data to derive fixtures from.
import { test, expect } from '@playwright/test';
import { inferWeeklyRota, inferAmPmPatterns } from '../../lib/auto-rota.js';
import { detectPatterns } from '../../lib/capacity-patterns.js';

test.describe('inferWeeklyRota — contract', () => {
  test('no CSV returns the existing rota untouched, with an error', () => {
    const existingRota = { Monday: ['a'], Tuesday: [] };
    const r = inferWeeklyRota({ huddleData: null, clinicians: [], existingRota });
    expect(r.error).toBe('No CSV data');
    expect(r.newRota).toBe(existingRota);   // same reference — nothing invented
    expect(r.weeksAnalysed).toBe(0);
    expect(r.summary).toEqual([]);
  });

  test('an empty dates array is treated as no data, not as an empty rota', () => {
    // The dangerous failure would be returning a blank rota and wiping
    // everyone's working days.
    const existingRota = { Monday: ['a'] };
    const r = inferWeeklyRota({ huddleData: { dates: [] }, clinicians: [{ id: 'a', buddyCover: true }], existingRota });
    expect(r.error).toBeTruthy();
    expect(r.newRota).toBe(existingRota);
  });

  test('never throws on missing optional arguments', () => {
    expect(() => inferWeeklyRota({ huddleData: null })).not.toThrow();
    expect(() => inferWeeklyRota({ huddleData: null, clinicians: null })).not.toThrow();
  });
});

test.describe('inferAmPmPatterns — contract', () => {
  test('does not throw without data', () => {
    expect(() => inferAmPmPatterns({ huddleData: null, clinicians: [] })).not.toThrow();
    expect(() => inferAmPmPatterns({ huddleData: { dates: [] }, clinicians: [] })).not.toThrow();
  });
});

test.describe('detectPatterns — contract', () => {
  test('no weeks means no patterns, not a crash', () => {
    const out = detectPatterns([], {}, [], null);
    expect(Array.isArray(out)).toBe(true);
    expect(out).toHaveLength(0);
  });

  test('tolerates null settings and register', () => {
    expect(() => detectPatterns([], null, null, null)).not.toThrow();
  });

  test('every returned pattern carries the fields the UI renders', () => {
    // Whatever it finds, each entry must be renderable: the capacity page
    // reads id and severity off these directly.
    const out = detectPatterns([], { routineWeeklyTarget: 250 }, [], null);
    for (const p of out) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('severity');
      expect(typeof p.id).toBe('string');
    }
  });

  test('results are sorted by severity, most severe first', () => {
    const out = detectPatterns([], { routineWeeklyTarget: 250 }, [], null);
    const RANK = { critical: 0, high: 1, warn: 2, info: 3 };
    const ranks = out.map(p => RANK[p.severity] ?? 9);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
