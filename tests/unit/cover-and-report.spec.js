// Unit tests for lib/cover-regen.js and lib/workload-report.js.
// Focused on the pure functions with real consequences: the fingerprint that
// decides whether buddy cover gets regenerated at all, and the report
// vocabulary a practice reads off the workload report.
import { test, expect } from '@playwright/test';
import { coverInputsFingerprint } from '../../lib/cover-regen.js';
import { isTimeDimension, describeMeasure, denomModeLabel } from '../../lib/workload-report.js';

const base = () => ({
  clinicians: [{ id: 'a', status: 'active', buddyCover: true }],
  weeklyRota: { Monday: ['a'] },
  sessionRota: { a: { Monday: ['M'] } },
  plannedAbsences: [],
  dailyOverrides: {},
  closedDays: {},
});

test.describe('coverInputsFingerprint', () => {
  test('is stable for identical input', () => {
    expect(coverInputsFingerprint(base())).toBe(coverInputsFingerprint(base()));
  });

  test('empty input does not throw', () => {
    expect(coverInputsFingerprint(null)).toBe('');
    expect(typeof coverInputsFingerprint({})).toBe('string');
  });

  // Each of these must invalidate cover, or the board silently goes stale.
  const changes = {
    'a rota change':        d => { d.weeklyRota.Monday = []; },
    'a session change':     d => { d.sessionRota.a.Monday = ['M', 'A']; },
    'a new absence':        d => { d.plannedAbsences.push({ clinicianId: 'a', startDate: '2026-06-01' }); },
    'a daily override':     d => { d.dailyOverrides['2026-06-01-Monday'] = { present: [], scheduled: ['a'] }; },
    'a closed day':         d => { d.closedDays['2026-06-01'] = 'Bank holiday'; },
    'someone leaving':      d => { d.clinicians[0].status = 'left'; },
    'buddy cover toggled':  d => { d.clinicians[0].buddyCover = false; },
    'a wind-down marker':   d => { d.clinicians[0].windDown = { type: 'retire', endDate: '2026-12-01' }; },
  };
  for (const [name, mutate] of Object.entries(changes)) {
    test(`changes when ${name} happens`, () => {
      const before = coverInputsFingerprint(base());
      const d = base(); mutate(d);
      expect(coverInputsFingerprint(d)).not.toBe(before);
    });
  }

  test('does NOT change for things cover does not depend on', () => {
    const before = coverInputsFingerprint(base());
    const d = base();
    d.huddleMessages = ['irrelevant'];
    d.clinicians[0].notes = 'internal note';
    expect(coverInputsFingerprint(d)).toBe(before);
  });
});

test.describe('workload report vocabulary', () => {
  test('week and dow are time dimensions; others are not', () => {
    expect(isTimeDimension('week')).toBe(true);
    expect(isTimeDimension('dow')).toBe(true);
    expect(isTimeDimension('clinician')).toBe(false);
    expect(isTimeDimension(null)).toBe(false);
  });

  test('describeMeasure returns a non-empty label for a plain count', () => {
    const s = describeMeasure({ num: {}, denom: null, groupBy: 'clinician' });
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  test('denomModeLabel is defined for the modes the UI offers', () => {
    for (const mode of ['session', 'day', 'clinician']) {
      expect(typeof denomModeLabel(mode, 'week')).toBe('string');
    }
  });
});
