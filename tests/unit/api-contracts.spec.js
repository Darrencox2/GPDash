// Unit tests for the shared API input guards — lib/api-helpers.js and
// lib/parse-emails.js.
//
// The stakes: requireUuid is the only thing standing between a malformed
// practice id and Postgres, and every practice-scoped route calls it before
// touching the database. parseEmails feeds the bulk invite flow, where a
// dropped or mangled address means somebody never gets invited and nobody
// finds out.
import { test, expect } from '@playwright/test';
import { isUuid, requireUuid, serverError, isEmail } from '../../lib/api-helpers.js';
import { parseEmails } from '../../lib/parse-emails.js';

const A_UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

test.describe('isUuid', () => {
  test('accepts a well-formed uuid in either case', () => {
    expect(isUuid(A_UUID)).toBe(true);
    expect(isUuid(A_UUID.toUpperCase())).toBe(true);
  });

  test('rejects the shapes an attacker or a bug actually sends', () => {
    expect(isUuid('')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid('not-a-uuid')).toBe(false);
    // No leading/trailing slop — a padded value would sail through into a
    // query builder that trims differently.
    expect(isUuid(` ${A_UUID} `)).toBe(false);
    expect(isUuid(`${A_UUID}'; drop table practices; --`)).toBe(false);
    // Right length, wrong alphabet.
    expect(isUuid('zzzzzzzz-4f89-11d3-9a0c-0305e82c3301')).toBe(false);
  });
});

test.describe('requireUuid', () => {
  test('returns null for a valid value so the handler continues', () => {
    expect(requireUuid(A_UUID, 'practice')).toBe(null);
  });

  test('a missing value is 400 and names the field', async () => {
    const res = requireUuid(undefined, 'practice');
    expect(res).not.toBe(null);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('practice is required');
  });

  test('a malformed value is 400 and says so distinctly', async () => {
    const res = requireUuid('nonsense', 'practice');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('practice must be a valid UUID');
  });

  test('empty string is treated as missing, not as malformed', () => {
    // Both are 400, but the message the user quotes should match reality.
    expect(requireUuid('', 'practice').status).toBe(400);
  });
});

test.describe('serverError', () => {
  test('returns the safe message and a request id, never the raw error', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = serverError('Could not import data', new Error('connection string user=admin password=hunter2'));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe('Could not import data');
      expect(body.requestId).toBeTruthy();
      // The whole point: nothing from the underlying error reaches the client.
      expect(JSON.stringify(body)).not.toContain('hunter2');
      expect(JSON.stringify(body)).not.toContain('connection string');
    } finally {
      console.error = original;
    }
  });

  test('honours an explicit status', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(serverError('Nope', new Error('x'), { status: 502 }).status).toBe(502);
    } finally {
      console.error = original;
    }
  });
});

test.describe('isEmail', () => {
  test('accepts ordinary addresses', () => {
    expect(isEmail('darren@example.com')).toBe(true);
    expect(isEmail('first.last+tag@sub.domain.nhs.uk')).toBe(true);
  });

  test('rejects garbage and over-long values', () => {
    expect(isEmail('not an email')).toBe(false);
    expect(isEmail('@example.com')).toBe(false);
    expect(isEmail('user@')).toBe(false);
    expect(isEmail('user@example')).toBe(false);
    expect(isEmail(null)).toBe(false);
    expect(isEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
    // No embedded newline — this would otherwise be a header-injection shape
    // when the address reaches the mailer.
    expect(isEmail('user@example.com\nbcc: someone@else.com')).toBe(false);
  });
});

test.describe('parseEmails', () => {
  test('pulls bare addresses out of any separator', () => {
    const got = parseEmails('a@x.com, b@x.com; c@x.com\nd@x.com');
    expect(got.map(e => e.email)).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  });

  test('keeps the display name from a "Name <addr>" entry', () => {
    const got = parseEmails('John Smith <john@example.com>');
    expect(got).toEqual([{ email: 'john@example.com', displayName: 'John Smith' }]);
  });

  test('handles quoted names', () => {
    expect(parseEmails('"Smith, John" <john@example.com>')[0]).toEqual({
      email: 'john@example.com', displayName: 'Smith, John',
    });
  });

  test('lowercases and de-duplicates, keeping the first occurrence', () => {
    const got = parseEmails('John <John@Example.COM>, john@example.com');
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual({ email: 'john@example.com', displayName: 'John' });
  });

  test('mixed named and bare entries both survive the two passes', () => {
    // The named pass runs first specifically so the bare pass cannot strip a
    // name off an address it already claimed. This is the regression shape.
    const got = parseEmails('Jane Doe <jane@x.com>, bob@x.com');
    expect(got).toEqual([
      { email: 'jane@x.com', displayName: 'Jane Doe' },
      { email: 'bob@x.com' },
    ]);
  });

  test('empty and non-string input give an empty list, not a throw', () => {
    expect(parseEmails('')).toEqual([]);
    expect(parseEmails(null)).toEqual([]);
    expect(parseEmails(undefined)).toEqual([]);
    expect(parseEmails(42)).toEqual([]);
    expect(parseEmails('no addresses here')).toEqual([]);
  });

  test('is not left dirty by a previous call', () => {
    // Both regexes are module-level with the /g flag, so a leaked lastIndex
    // would make the second call silently skip the first address.
    const first = parseEmails('a@x.com, b@x.com');
    const second = parseEmails('a@x.com, b@x.com');
    expect(second).toEqual(first);
    expect(second).toHaveLength(2);
  });
});
