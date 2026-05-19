// lib/setup-status.js
//
// Setup-completion logic for a practice. The wizard used to require an
// explicit "Complete setup" click to set setup_completed_at; this helper
// derives completion from data instead. setup_completed_at is now a
// cached marker that the server auto-sets when data warrants — never
// required to be set manually.
//
// "Minimum setup complete" = the bare minimum data needed to show a
// useful dashboard. Without these, the dashboard would render with
// empty list size, no team, no capacity calculation:
//
//   - postcode set (region detection, weather, holidays)
//   - list_size set (demand model scales by this)
//   - at least one clinician (otherwise capacity = 0)
//
// Everything else (TeamNet sync, demand history, invites) is OPTIONAL
// — improves the experience but doesn't gate access. Those are tracked
// as per-section completion, surfaced in the UI via amber/green
// indicators so the user can see at a glance what's left.

/**
 * Returns true if the practice has the minimum data needed to use the
 * dashboard meaningfully.
 *
 * @param {Object} practice — practices table row (snake_case)
 * @param {number} clinicianCount — count of clinicians for this practice
 */
export function isMinimumSetupComplete(practice, clinicianCount) {
  if (!practice) return false;
  if (!practice.postcode || !String(practice.postcode).trim()) return false;
  if (!practice.list_size || practice.list_size <= 0) return false;
  if (!clinicianCount || clinicianCount <= 0) return false;
  return true;
}

/**
 * Per-section completion: which areas of the practice have what they
 * need vs are still missing data. Used to drive the green/amber
 * indicators on the practice management tabs and the overall
 * "setup completeness" strip on the dashboard.
 *
 * Returns an object with one entry per section:
 *   { complete: bool, label: string, hint?: string, optional?: bool }
 *
 * `complete: false` → render amber (something to do)
 * `complete: true`  → render green (looks good)
 *
 * Optional sections (teamnet, demand, team) are considered COMPLETE
 * when empty — they're truly optional and the user shouldn't be
 * nagged about them forever. The hint text still nudges ("Optional —
 * set sync URL to auto-import absences") in case they want to
 * explore, but they don't block the dashboard strip from
 * auto-hiding once required sections are done.
 *
 * Required sections (details, clinicians) show amber when missing
 * data because the dashboard genuinely can't function without them.
 *
 * @param {Object} ctx
 * @param {Object} ctx.practice — practices table row
 * @param {number} ctx.clinicianCount
 * @param {number} [ctx.clinicianNeedsAttentionCount] — clinicians with missing initials/role
 * @param {string} [ctx.teamnetUrl]
 * @param {number} [ctx.demandHistoryCount]
 * @param {number} [ctx.memberCount] — practice_users entries
 */
export function getSectionStatuses({
  practice,
  clinicianCount = 0,
  clinicianNeedsAttentionCount = 0,
  teamnetUrl = null,
  demandHistoryCount = 0,
  memberCount = 1,
}) {
  const hasPostcode = !!(practice?.postcode && String(practice.postcode).trim());
  const hasListSize = !!(practice?.list_size && practice.list_size > 0);
  const detailsComplete = hasPostcode && hasListSize;

  const hasClinicians = clinicianCount > 0;
  const cliniciansComplete = hasClinicians && clinicianNeedsAttentionCount === 0;

  const hasTeamnet = !!(teamnetUrl && String(teamnetUrl).trim());
  const hasDemand = demandHistoryCount > 0;
  const hasTeam = memberCount > 1;

  return {
    details: {
      complete: detailsComplete,
      label: 'Practice details',
      hint: !hasPostcode ? 'Add a postcode' : !hasListSize ? 'Set the list size' : null,
    },
    clinicians: {
      complete: cliniciansComplete,
      label: 'Clinicians',
      hint: !hasClinicians
        ? 'Upload an EMIS CSV to populate your team'
        : clinicianNeedsAttentionCount > 0
          ? `${clinicianNeedsAttentionCount} clinician${clinicianNeedsAttentionCount === 1 ? '' : 's'} need attention (missing initials or role)`
          : null,
    },
    // ─── Optional sections ────────────────────────────────────────────
    // These default to complete=true even when empty. If the user
    // never sets a TeamNet URL or never invites teammates, that's a
    // legitimate end state — the dashboard shouldn't keep nagging
    // them. The hint still suggests the value, but it doesn't gate
    // the strip from auto-hiding.
    teamnet: {
      complete: true,
      optional: true,
      label: 'TeamNet calendar',
      hint: hasTeamnet
        ? 'Connected'
        : 'Optional — set sync URL to auto-import absences',
    },
    demand: {
      complete: true,
      optional: true,
      label: 'Demand history',
      hint: hasDemand
        ? 'Uploaded'
        : 'Optional — upload to calibrate the model to your real demand',
    },
    team: {
      complete: true,
      optional: true,
      label: 'Team',
      hint: hasTeam
        ? `${memberCount} members`
        : 'Optional — invite colleagues to share access',
    },
  };
}

/**
 * Helper: count how many clinicians need attention (missing initials
 * or placeholder role). Same rules as QuickSetupTable's needsAttention.
 * Used server-side when building section statuses.
 */
const TITLE_LIKE = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'doctor', 'prof', 'professor', 'rev', 'reverend', 'sir', 'dame', 'lord', 'lady']);
const PLACEHOLDER_ROLES = new Set(['', 'staff', 'unknown']);

export function countCliniciansNeedingAttention(clinicianRows) {
  if (!Array.isArray(clinicianRows)) return 0;
  let count = 0;
  for (const c of clinicianRows) {
    if (c.status && c.status !== 'active') continue; // ignore left/admin
    if (!c.initials || !String(c.initials).trim()) { count++; continue; }
    const r = (c.role || '').trim().toLowerCase();
    if (PLACEHOLDER_ROLES.has(r) || TITLE_LIKE.has(r)) { count++; continue; }
  }
  return count;
}
