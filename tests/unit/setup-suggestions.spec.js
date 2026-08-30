// Unit tests for lib/setup-suggestions.js — the slot classification a
// practice inherits at onboarding. If "Urgent OTD" is not read as urgent, or
// "Telephone Triage" is wrongly read as urgent, the capacity model is skewed
// for that practice from day one and nobody notices for months.
//
// These functions lived inside a 3,751-line client component until now.
import { test, expect } from '@playwright/test';
import {
  suggestSlotCategory, suggestSlotCategoryWithConfidence, suggestDuty,
  computeExpectedUrgentFromCsv, isCliniciansReviewed,
} from '../../lib/setup-suggestions.js';

test.describe('urgent detection', () => {
  const urgent = ['Same Day', 'same-day GP', 'URGENT', 'Urgent on the day',
                  'OTD', 'On The Day', 'on-the-day', 'Acute', 'Emergency appt'];
  for (const n of urgent) {
    test(`"${n}" is urgent, high confidence`, () => {
      expect(suggestSlotCategoryWithConfidence(n)).toEqual({ category: 'urgent', confidence: 'high' });
    });
  }
});

test.describe('routine detection', () => {
  test('explicit routine wording is high confidence', () => {
    expect(suggestSlotCategoryWithConfidence('Routine GP')).toEqual({ category: 'routine', confidence: 'high' });
    expect(suggestSlotCategoryWithConfidence('Pre-book')).toEqual({ category: 'routine', confidence: 'high' });
    expect(suggestSlotCategoryWithConfidence('pre book')).toEqual({ category: 'routine', confidence: 'high' });
  });

  test('ambiguous booking wording is only medium confidence', () => {
    for (const n of ['Book on day', 'Appt', 'Appointment', 'F2F', 'Face to face']) {
      expect(suggestSlotCategoryWithConfidence(n)?.confidence).toBe('medium');
    }
  });
});

test.describe('deliberate non-matches', () => {
  // Documented intent: triage and call-back are administrative contacts, not
  // bookable urgent appointments, so they must fall through to "other".
  test('triage and call back are NOT urgent', () => {
    expect(suggestSlotCategory('Telephone Triage')).toBe(null);
    expect(suggestSlotCategory('TRIAGE, TELEPHONE (Dr)')).toBe(null);
    expect(suggestSlotCategory('Call back')).toBe(null);
  });

  test('unrecognised names stay uncategorised rather than guessing', () => {
    expect(suggestSlotCategory('Smear')).toBe(null);
    expect(suggestSlotCategory('Blood test')).toBe(null);
    expect(suggestSlotCategory('')).toBe(null);
    expect(suggestSlotCategory(null)).toBe(null);
  });

  test('urgent wins over routine when a name contains both', () => {
    expect(suggestSlotCategory('Urgent pre-book')).toBe('urgent');
  });

  test('matches on word boundaries, not substrings', () => {
    // "surgent" must not trip the \burgent\b rule.
    expect(suggestSlotCategory('Resurgent clinic')).toBe(null);
  });
});

test.describe('suggestDuty', () => {
  test('finds duty as a whole word only', () => {
    expect(suggestDuty('Duty Doctor')).toBe(true);
    expect(suggestDuty('GP DUTY')).toBe(true);
    expect(suggestDuty('Routine GP')).toBe(false);
    expect(suggestDuty(null)).toBe(false);
  });

  test('is independent of category — a slot can be both', () => {
    expect(suggestDuty('Urgent Duty')).toBe(true);
    expect(suggestSlotCategory('Urgent Duty')).toBe('urgent');
  });
});

test.describe('computeExpectedUrgentFromCsv', () => {
  test('no CSV yields no expectations rather than zeroes', () => {
    expect(computeExpectedUrgentFromCsv(null, {})).toEqual({});
    expect(computeExpectedUrgentFromCsv(undefined, null)).toEqual({});
  });

  test('malformed CSV is swallowed, not thrown', () => {
    expect(() => computeExpectedUrgentFromCsv({ nonsense: true }, {})).not.toThrow();
    expect(computeExpectedUrgentFromCsv({ nonsense: true }, {})).toEqual({});
  });
});

test.describe('isCliniciansReviewed', () => {
  test('needs at least one active clinician, all with a role', () => {
    expect(isCliniciansReviewed([{ status: 'active', role: 'GP' }])).toBe(true);
    expect(isCliniciansReviewed([{ status: 'active', role: '' }])).toBe(false);
    expect(isCliniciansReviewed([{ status: 'active' }])).toBe(false);
    expect(isCliniciansReviewed([{ status: 'active', role: '   ' }])).toBe(false);
  });

  test('an empty or all-inactive register is not reviewed', () => {
    expect(isCliniciansReviewed([])).toBe(false);
    expect(isCliniciansReviewed(null)).toBe(false);
    expect(isCliniciansReviewed([{ status: 'left', role: 'GP' }])).toBe(false);
  });

  test('inactive members do not block review', () => {
    expect(isCliniciansReviewed([{ status: 'active', role: 'GP' }, { status: 'left' }])).toBe(true);
  });
});
