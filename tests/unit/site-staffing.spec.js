// Unit tests for lib/site-staffing.js — the module behind the capacity page.
// These are pure functions over plain data, and they decide what a practice
// sees about whether a session is safely staffed. A silent wrong answer here
// is a clinical-operations problem, not a cosmetic one.
import { test, expect } from '@playwright/test';
import {
  rowSessionOf, staffingState, locationMatchesSite,
  classifyStaffRole, initialsFor, computeTotalEntry,
} from '../../lib/site-staffing.js';

test.describe('rowSessionOf — EMIS session buckets', () => {
  // CLAUDE.md domain fact: EMIS row times are session buckets
  // ("Before 12:59" / "After or At 13:00"), not clocks.
  test('maps the two EMIS bucket labels', () => {
    expect(rowSessionOf('Before 12:59')).toBe('am');
    expect(rowSessionOf('After or At 13:00')).toBe('pm');
  });

  test('"after" wins over the clock inside the label', () => {
    // "After or At 13:00" contains 13:00; the bucket must decide, not the digits.
    expect(rowSessionOf('After or At 13:00')).toBe('pm');
  });

  test('real clock times fall on the right side of 13:00', () => {
    expect(rowSessionOf('09:00 - 09:15')).toBe('am');
    expect(rowSessionOf('12:59')).toBe('am');
    expect(rowSessionOf('13:00')).toBe('pm');
    expect(rowSessionOf('17:00')).toBe('pm');
  });

  test('18:30 and later is evening', () => {
    expect(rowSessionOf('18:29')).toBe('pm');
    expect(rowSessionOf('18:30')).toBe('eve');
    expect(rowSessionOf('19:45')).toBe('eve');
  });

  test('unparseable input defaults to pm rather than throwing', () => {
    for (const v of [null, undefined, '', 'lunchtime', 42]) {
      expect(rowSessionOf(v)).toBe('pm');
    }
  });
});

test.describe('staffingState — the red/amber/green decision', () => {
  test('below minimum is short, exactly on minimum is tight', () => {
    expect(staffingState(1, 3)).toBe('short');
    expect(staffingState(2, 3)).toBe('short');
    expect(staffingState(3, 3)).toBe('tight');   // on the line is fragile, not fine
    expect(staffingState(4, 3)).toBe('ok');
  });

  test('no configured threshold means no judgement, never a false alarm', () => {
    expect(staffingState(0, null)).toBe('none');
    expect(staffingState(0, undefined)).toBe('none');
    // Guards the shortfall label, which does `threshold - offering`:
    // if a null threshold could ever return 'short' the UI would print NaN.
    expect(staffingState(0, null)).not.toBe('short');
  });

  test('zero staff against a real threshold is short', () => {
    expect(staffingState(0, 1)).toBe('short');
  });
});

test.describe('locationMatchesSite', () => {
  test('matches on either direction of containment, case-insensitively', () => {
    expect(locationMatchesSite('Winscombe Surgery', 'Winscombe')).toBe(true);
    expect(locationMatchesSite('BANWELL', 'Banwell Surgery')).toBe(true);
    expect(locationMatchesSite('  Locking  ', 'locking')).toBe(true);
  });

  test('does not match unrelated sites', () => {
    expect(locationMatchesSite('Winscombe', 'Banwell')).toBe(false);
  });

  test('empty or missing input never matches', () => {
    expect(locationMatchesSite('', 'Winscombe')).toBe(false);
    expect(locationMatchesSite('Winscombe', '')).toBe(false);
    expect(locationMatchesSite(null, null)).toBe(false);
    expect(locationMatchesSite('   ', 'Winscombe')).toBe(false);
  });
});

test.describe('classifyStaffRole', () => {
  test('recognises the role families the capacity count depends on', () => {
    expect(classifyStaffRole('GP Partner')).toBe('gp');
    expect(classifyStaffRole('Salaried Doctor')).toBe('gp');
    expect(classifyStaffRole('GP Registrar')).toBe('gp');
    expect(classifyStaffRole('Practice Nurse')).toBe('nursing');
    expect(classifyStaffRole('ANP')).toBe('nursing');
    expect(classifyStaffRole('Healthcare Assistant')).toBe('hca');
    expect(classifyStaffRole('Phlebotomist')).toBe('hca');
    expect(classifyStaffRole('Receptionist')).toBe('other');
    expect(classifyStaffRole(null)).toBe('other');
  });

  test('HCA is checked before nurse, so "Nursing Assistant (HCA)" is not a nurse', () => {
    expect(classifyStaffRole('Nursing Assistant (HCA)')).toBe('hca');
  });
});

test.describe('initialsFor', () => {
  const register = [{ name: 'Darren Cox', initials: 'DC', aliases: [] }];

  test('prefers the register name over the CSV form', () => {
    expect(initialsFor('COX, Darren (Dr)', register)).toBe('DC');
  });

  test('falls back to parsing the EMIS surname-first form', () => {
    expect(initialsFor('SMITH, Jane (Dr)', [])).toBe('JS');
  });

  test('degrades to the first two characters rather than throwing', () => {
    expect(initialsFor('Unknown', [])).toBe('UN');
    expect(initialsFor('', [])).toBe('?');
    expect(initialsFor(null, [])).toBe('?');
  });
});

test.describe('computeTotalEntry', () => {
  test('returns something usable for an empty practice day', () => {
    const total = computeTotalEntry([], {});
    expect(total).toBeTruthy();
  });
});
