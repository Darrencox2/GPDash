// Unit tests for lib/retention-policy.js — the table of what gets deleted
// and when, used by the retention-cleanup cron.
//
// The stakes are asymmetric and worth stating. A retention rule that is too
// long is a GDPR problem on a slide. A retention rule that is too short
// deletes an NHS audit trail that is supposed to survive seven years, on a
// schedule, with nobody watching. These tests pin the durations that the
// published privacy notice quotes, and pin the cutoff arithmetic that decides
// which side of the line a row falls on.
import { test, expect } from '@playwright/test';
import {
  RETENTION_POLICY, PER_TABLE_MAX_DELETIONS_PER_RUN, cutoffFor, retentionSummary,
} from '../../lib/retention-policy.js';

test.describe('the policy table itself', () => {
  test('every entry is complete enough for the cleanup query to run', () => {
    for (const [key, p] of Object.entries(RETENTION_POLICY)) {
      expect(p.table, `${key}.table`).toBeTruthy();
      expect(p.timestampColumn, `${key}.timestampColumn`).toBeTruthy();
      expect(typeof p.keepDays, `${key}.keepDays`).toBe('number');
      expect(p.keepDays, `${key}.keepDays`).toBeGreaterThan(0);
      // Both of these are surfaced verbatim on the public privacy page.
      expect(p.description, `${key}.description`).toBeTruthy();
      expect(p.rationale, `${key}.rationale`).toBeTruthy();
    }
  });

  test('the key matches the table it deletes from', () => {
    // A mismatch here would point the cleanup at the wrong table while the
    // admin UI reported the right one.
    for (const [key, p] of Object.entries(RETENTION_POLICY)) {
      expect(p.table, `key ${key}`).toBe(key);
    }
  });

  test('the audit trail keeps its seven years', () => {
    // NHS records-management standard. Shortening any of these is a
    // compliance change, not a tidy-up — it should have to fail a test first.
    expect(RETENTION_POLICY.audit_events.keepDays).toBe(2555);
    expect(RETENTION_POLICY.platform_audit_events.keepDays).toBe(2555);
    expect(RETENTION_POLICY.impersonation_sessions.keepDays).toBe(2555);
  });

  test('short-lived diagnostic data stays short-lived', () => {
    expect(RETENTION_POLICY.auth_events.keepDays).toBe(365);
    expect(RETENTION_POLICY.app_errors.keepDays).toBe(90);
    expect(RETENTION_POLICY.practice_invites.keepDays).toBe(90);
  });

  test('finished invites are additionally gated on being finished', () => {
    // Without customWhere, a 90-day rule would delete invitations that are
    // still live and unaccepted.
    expect(RETENTION_POLICY.practice_invites.customWhere).toContain('revoked_at is not null');
    expect(RETENTION_POLICY.practice_invites.customWhere).toContain('expires_at < now()');
  });

  test('the per-run deletion ceiling is present and sane', () => {
    expect(PER_TABLE_MAX_DELETIONS_PER_RUN).toBe(5000);
  });
});

test.describe('cutoffFor', () => {
  test('subtracts exactly keepDays and returns an ISO timestamp', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    expect(cutoffFor({ keepDays: 90 }, now)).toBe('2026-06-06T12:00:00.000Z');
    expect(cutoffFor({ keepDays: 365 }, now)).toBe('2025-09-04T12:00:00.000Z');
  });

  test('does not mutate the date it was handed', () => {
    // cutoffFor is called once per policy inside a loop over a shared `now`.
    // If it mutated, each successive table would be cut from the previous
    // table's cutoff and the last one would delete almost everything.
    const now = new Date('2026-09-04T12:00:00.000Z');
    cutoffFor({ keepDays: 2555 }, now);
    cutoffFor({ keepDays: 2555 }, now);
    expect(now.toISOString()).toBe('2026-09-04T12:00:00.000Z');
  });

  test('successive calls with the same now are identical', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    expect(cutoffFor({ keepDays: 90 }, now)).toBe(cutoffFor({ keepDays: 90 }, now));
  });

  test('crosses a leap day correctly', () => {
    // 2028 is a leap year; a naive 365-day subtraction lands a day out.
    const now = new Date('2028-03-01T00:00:00.000Z');
    expect(cutoffFor({ keepDays: 1 }, now)).toBe('2028-02-29T00:00:00.000Z');
  });

  test('is UTC-based, so a BST server does not shift the boundary', () => {
    const now = new Date('2026-07-01T00:30:00.000Z');
    expect(cutoffFor({ keepDays: 1 }, now)).toBe('2026-06-30T00:30:00.000Z');
  });
});

test.describe('retentionSummary', () => {
  test('covers every policy entry', () => {
    const summary = retentionSummary();
    expect(summary).toHaveLength(Object.keys(RETENTION_POLICY).length);
    for (const row of summary) {
      expect(row.name).toBeTruthy();
      expect(row.description).toBeTruthy();
      expect(row.retentionLabel).toBeTruthy();
      expect(typeof row.keepDays).toBe('number');
    }
  });

  test('renders durations the way the privacy notice reads them', () => {
    const byName = Object.fromEntries(retentionSummary().map(r => [r.name, r.retentionLabel]));
    expect(byName.app_errors).toBe('3 months');
    expect(byName.auth_events).toBe('1 year');
    expect(byName.audit_events).toBe('7 years');
  });
});
