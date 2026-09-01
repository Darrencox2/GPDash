// ═══════════════════════════════════════════════════════════════════════════
// lib/admin-guard.js — server-side platform admin page guard
// ═══════════════════════════════════════════════════════════════════════════
//
// Every /v4/admin/* page needs the same gate:
//   1. User is signed in
//   2. User is a platform admin (profiles.is_platform_admin = true)
//   3. User has MFA enrolled
//   4. Current session is at AAL2 (proved MFA this session)
//
// Each step short-circuits to a redirect rather than throwing. This is
// a single point of enforcement so we can't accidentally protect
// admin/page.js but forget admin/users/page.js.
//
// MFA rationale: platform admin accounts can read every practice's
// data via the is_platform_admin() RLS override + impersonate any
// user. A compromised admin password without MFA is total platform
// compromise. NHS data context makes 2FA table stakes — DSPT/IG
// would flag the absence of it.
//
// Sequence visualised:
//
//   user opens /v4/admin
//        │
//        ▼
//   ┌──────────────┐  no   ┌──────────────────┐
//   │ signed in?   │──────▶│ /v4/login?next=  │
//   └──────┬───────┘       └──────────────────┘
//          │ yes
//          ▼
//   ┌──────────────┐  no   ┌──────────────────┐
//   │ admin?       │──────▶│ /v4/dashboard    │
//   └──────┬───────┘       └──────────────────┘
//          │ yes
//          ▼
//   ┌──────────────┐  no   ┌──────────────────────────────────┐
//   │ MFA enrolled?│──────▶│ /v4/security?required=mfa        │
//   └──────┬───────┘       └──────────────────────────────────┘
//          │ yes
//          ▼
//   ┌──────────────┐  no   ┌──────────────────────────────────┐
//   │ AAL2 this    │──────▶│ /v4/mfa-verify?next=/v4/admin    │
//   │ session?     │       └──────────────────────────────────┘
//   └──────┬───────┘
//          │ yes
//          ▼
//   page renders normally

import { redirect } from 'next/navigation';

// The path the user came from, encoded for round-trip via ?next=.
// We accept Request as an optional argument so server actions can pass
// it through; in plain page handlers we have access to nothing better
// than a hardcoded fallback.
export async function requireAdmin(supabase, options = {}) {
  const returnTo = options.returnTo || '/v4/admin';

  // 1. Signed in?
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/v4/login?next=${encodeURIComponent(returnTo)}`);
  }

  // 2. Platform admin?
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin, suspended_at')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    redirect('/v4/dashboard');
  }
  if (profile.suspended_at) {
    // Belt-and-braces — Supabase auth ban should already block sign-in,
    // but if somehow they got through, send them away.
    redirect('/v4/login?reason=suspended');
  }

  // 3 + 4. MFA enrolled + at AAL2?
  // getAuthenticatorAssuranceLevel returns:
  //   { currentLevel: 'aal1' | 'aal2', nextLevel: 'aal1' | 'aal2' }
  //
  //   currentLevel = the level they're currently at
  //   nextLevel    = the level they SHOULD be at
  //
  // Combinations:
  //   current=aal1, next=aal1 — no MFA factor enrolled (and not required)
  //   current=aal1, next=aal2 — MFA factor enrolled but not used this session
  //   current=aal2, next=aal2 — MFA factor used this session — all good
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal) {
    // Shouldn't happen — Supabase returns at minimum aal1 for signed-in users
    redirect('/v4/login');
  }

  if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal1') {
    // No MFA factor enrolled — push to enrolment flow
    redirect(`/v4/security?required=mfa&next=${encodeURIComponent(returnTo)}`);
  }

  if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
    // Factor enrolled but not challenged this session
    redirect(`/v4/mfa-verify?next=${encodeURIComponent(returnTo)}`);
  }

  // aal2 — all checks passed
  return { user, profile };
}

// ── API-route variant ──────────────────────────────────────────────────────
// Same MFA gate as requireAdmin, returned rather than redirected: a fetch()
// caller cannot follow a redirect to the MFA page, so the route answers 403
// with the reason. Without this the admin API endpoints (impersonate,
// generate-link, ...) accepted a password-only session - the exact
// "compromised admin password without MFA is total platform compromise"
// scenario the page gate above exists to close.
// Callers run this AFTER their is_platform_admin check; it returns null
// when the session is at AAL2, else the message to send back.
export async function adminApiAalProblem(supabase) {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === 'aal2') return null;
  return aal?.nextLevel === 'aal2'
    ? 'Admin actions require MFA verification for this session - verify at /v4/mfa-verify and retry'
    : 'Admin actions require MFA to be enrolled - set it up at /v4/security';
}
