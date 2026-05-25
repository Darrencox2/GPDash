// lib/retention-policy.js
//
// Single source of truth for how long GPDash keeps each category of
// personal data. Used by the scheduled cleanup job at
// /api/cron/retention-cleanup, and surfaced verbatim in the privacy
// notice + RoPA so the user-facing documentation can't drift from the
// actual enforced behaviour.
//
// When updating retention windows here, ALSO update:
//   - /app/privacy/page.js — "How long we keep your data" section
//   - /docs/legal/ropa.md  — per-activity retention rows
//   - LEGAL_META.privacyLastUpdated in /lib/legal-meta.js (so the
//     "Last updated" stamp on the privacy notice reflects the change)
//
// Retention scheme:
//   - Audit + security event tables: NHS records-management standard
//     7 years (2555 days). Practices subject to DSPT need this minimum
//     for operational audit records; we err on that side platform-wide
//     for consistency.
//   - Auth events: 1 year (365 days) for routine sign-in / sign-out /
//     OTP events. Long enough to investigate plausible recent
//     compromise, short enough to bound the volume.
//   - Rate-limit counters: TTL'd by Upstash automatically (minutes).
//     Not in this module — handled by the rate-limit library.
//   - CSV operational data (huddle_csv_data): 4 months rolling, pruned
//     on every upload by mergeHuddleData. Not in this module — handled
//     in-band rather than by cron.
//   - Revoked + expired invites: 90 days. Not personal data on its own
//     (just an email + role), but the entries pile up over time. Keep
//     long enough that someone investigating "why did Joe never get my
//     invite" has visibility, then prune.

export const RETENTION_POLICY = {
  // Routine authentication telemetry. user_id may already be NULL on rows
  // belonging to deleted users (FK SET NULL from migration 043); those
  // rows still age out via this rule on their original timestamp.
  auth_events: {
    table: 'auth_events',
    timestampColumn: 'created_at',
    keepDays: 365,
    description: 'Routine sign-in, sign-out, OTP, and password events',
    rationale: 'Account security — long enough to investigate plausible recent compromise; short enough to bound volume.',
  },

  // In-practice audit log. NHS records-management standard for
  // operational audit records.
  audit_events: {
    table: 'audit_events',
    timestampColumn: 'created_at',
    keepDays: 2555, // ~7 years
    description: 'In-practice audit log (settings changes, member adds, CSV uploads, etc.)',
    rationale: 'NHS records-management standard for operational audit records (7 years).',
  },

  // Platform-level audit log. Same retention basis as audit_events,
  // also retains records of GDPR rights requests (export, deletion)
  // as required by GDPR Art 30 + ICO accountability guidance.
  platform_audit_events: {
    table: 'platform_audit_events',
    timestampColumn: 'created_at',
    keepDays: 2555,
    description: 'Platform admin actions, subject access + erasure requests',
    rationale: 'NHS records-management standard + Art 30 accountability records.',
  },

  // Impersonation sessions. user_id columns may already be NULL on
  // sessions belonging to deleted users (FK SET NULL); the row still
  // ages out via this rule.
  impersonation_sessions: {
    table: 'impersonation_sessions',
    timestampColumn: 'started_at',
    keepDays: 2555,
    description: 'Platform-admin impersonation sessions',
    rationale: 'Audit trail — same retention basis as the rest of the audit log.',
  },

  // Practice_invites that were either revoked or are well past their
  // expiry date. Active and recently-accepted invites are kept (the
  // accepted_at and revoked_at status doesn't itself trigger pruning;
  // we only prune rows where the invite is terminally finished).
  practice_invites: {
    table: 'practice_invites',
    timestampColumn: 'created_at',
    keepDays: 90,
    description: 'Revoked or expired invitation records',
    rationale: 'Pile up over time; not active product data once finished.',
    // Additional filter: only delete invites that are revoked OR past their
    // expiry. The standard cleanup query gets an AND of this filter.
    extraFilter: { column: 'expires_at', op: 'lt', valueFn: () => new Date().toISOString() },
    // Default behaviour: only delete rows where revoked_at is set OR expires_at is in the past
    customWhere: 'revoked_at is not null or expires_at < now()',
  },
};

// Hard upper bound on rows deleted PER TABLE PER RUN. Belt-and-braces
// safety: even if a bug causes the cutoff to evaluate wrongly, no
// single run can vaporise more than this many rows before someone
// notices the audit entry.
export const PER_TABLE_MAX_DELETIONS_PER_RUN = 5000;

// Compute the ISO cutoff timestamp for a policy entry.
export function cutoffFor(policy, now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - policy.keepDays);
  return cutoff.toISOString();
}

// Human-readable summary for the public privacy notice + admin UI.
// Each entry: { name, description, retentionLabel }
// Example: "Authentication events" / "Routine sign-in..." / "1 year".
export function retentionSummary() {
  return Object.values(RETENTION_POLICY).map(p => ({
    name: p.table,
    description: p.description,
    retentionLabel: humanDuration(p.keepDays),
    keepDays: p.keepDays,
  }));
}

function humanDuration(days) {
  if (days < 31) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  const years = days / 365;
  // Use 1 decimal for non-whole-year values
  return years === Math.floor(years)
    ? `${Math.floor(years)} year${years === 1 ? '' : 's'}`
    : `${years.toFixed(1)} years`;
}
