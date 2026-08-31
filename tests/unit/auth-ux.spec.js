// Unit tests for the sign-up guard rails.
//
// Every case here was a real way a new user could be left waiting for a
// verification code that was never going to arrive. Proven against the
// live Supabase API on 31 Aug 2026 before being fixed.
import { test, expect } from '@playwright/test';
import { mapAuthError } from '../../lib/friendly-errors.js';
import { validatePassword, isPasswordValid } from '../../app/v4/_lib/auth-ui.js';

test.describe('password rules mirror the Supabase project policy', () => {
  // The server's verdicts, recorded from the live API.
  const SERVER = [
    ['Winscombe1', false],    // no symbol
    ['winscombe1!', false],   // no upper case
    ['Winscombe!', false],    // no digit
    ['Ab1!', false],          // too short
    ['Winscombe1!', true],
    ['Str0ng-Pass', true],
    ['Practice2026?', true],
  ];
  for (const [pw, serverAccepts] of SERVER) {
    test(`"${pw}" — client agrees with the server (${serverAccepts ? 'accept' : 'reject'})`, () => {
      expect(isPasswordValid(pw)).toBe(serverAccepts);
    });
  }

  test('the checklist reports each rule separately so the user can see what is missing', () => {
    const v = validatePassword('Winscombe1');
    expect(v.longEnough).toBe(true);
    expect(v.hasLower).toBe(true);
    expect(v.hasUpper).toBe(true);
    expect(v.hasDigit).toBe(true);
    expect(v.hasSymbol).toBe(false);   // the one that used to be invisible
  });

  test('a range of symbols all count', () => {
    for (const sym of ['!', '?', '#', '-', '_', '.', '@', '£'.replace('£', '$')]) {
      expect(validatePassword(`Winscombe1${sym}`).hasSymbol).toBe(true);
    }
  });
});

test.describe('auth errors say what to do next', () => {
  const cases = [
    ['Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()', /8 characters.*upper-case.*number.*symbol/i],
    ['Password should be at least 6 characters.', /8 characters/i],
    ['User already registered', /already exists.*Sign in/i],
    ['Error sending confirmation email', /could not send an email.*not created/i],
    ['Email not confirmed', /has not been confirmed/i],
    ['Invalid login credentials', /does not match/i],
  ];
  for (const [raw, expected] of cases) {
    test(`"${raw.slice(0, 40)}…" is translated`, () => {
      const out = mapAuthError(raw);
      expect(out).toMatch(expected);
      expect(out).not.toBe(raw);          // never show the raw text
      expect(out).not.toMatch(/abcdefghij/);  // never show a character-set dump
    });
  }

  test('unrecognised messages pass through rather than being mistranslated', () => {
    expect(mapAuthError('Some brand new failure')).toBe('Some brand new failure');
  });
});
