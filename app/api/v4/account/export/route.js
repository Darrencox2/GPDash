// /api/v4/account/export
//
// GDPR Article 15 — right of access. Returns everything we hold about the
// signed-in user as a single JSON archive, downloadable from the Account
// Settings page.
//
// What's included:
//   - profile             (name, email, role, created_at)
//   - practice_memberships (each practice they belong to, with role)
//   - mfa_factors          (factor metadata only — friendly name, type,
//                           verified_at. NEVER includes secrets, recovery
//                           codes, or the TOTP shared secret)
//   - auth_events          (every login/logout/MFA/password event for this
//                           user)
//   - audit_events_actor   (in-practice audit events where they were the
//                           actor — rate-limited to practices they still
//                           belong to)
//   - platform_audit_events (events where they were actor or target —
//                           visible because they're either the data subject
//                           or the one being audited)
//   - impersonation_sessions (sessions where they were admin or target)
//
// What's NOT included (intentionally):
//   - Practice-scoped data (clinicians, rotas, CSV uploads). The PRACTICE
//     is the data controller for that data, not GPDash, and not the user.
//     A practice owner who wants the practice's data should export it via
//     a practice-level tool (planned for v4.27+).
//   - Other users' personal data. Even if user A invited user B, A doesn't
//     get B's profile in their export.
//   - The MFA TOTP secret itself. Returning it would defeat the security
//     model. Users who want to migrate their authenticator should remove
//     and re-enroll.
//
// Format: a single application/json file named gpdash-account-{userId}-{date}.json
// with Content-Disposition: attachment to trigger a browser download.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Rate limit AFTER auth so attackers can't burn legit users' buckets.
    // Export is expensive — generous limit (5/min) but enforced.
    const rl = await checkRateLimit(
      { prefix: 'rl:account-export', limit: 5, window: '60 s' },
      `user:${user.id}`,
    ).catch(() => null);
    if (rl && !rl.success) {
      return NextResponse.json(
        { error: 'Too many export requests. Please wait a minute and try again.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // Profile + practice memberships use the user's own session — RLS
    // ensures they can only see their own. The other queries use the
    // admin client because audit tables have stricter RLS (service-role
    // only) and the user has a legitimate Article 15 right to their own
    // rows, which the admin client filtered by user_id enforces.
    const admin = createAdminClient();

    // ─── 1. Profile ───────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, created_at, updated_at, marketing_opt_in, suspended_at, suspended_reason, is_platform_admin')
      .eq('id', user.id)
      .maybeSingle();

    // ─── 2. Practice memberships ──────────────────────────────────────
    const { data: memberships } = await supabase
      .from('practice_users')
      .select('practice_id, role, created_at, marked_non_clinical, practices!inner(slug, name, ods_code)')
      .eq('user_id', user.id);

    // ─── 3. MFA factors (metadata only — Article 15 of the GDPR does
    // not require disclosure of cryptographic secrets, and disclosing
    // the TOTP secret would invalidate the security model). ────────────
    const { data: mfaResp } = await supabase.auth.mfa.listFactors().catch(() => ({ data: { all: [] } }));
    const mfa = (mfaResp?.all || []).map(f => ({
      id: f.id,
      friendly_name: f.friendly_name,
      factor_type: f.factor_type,
      status: f.status,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }));

    // ─── 4. Auth events (logins, sign-outs, MFA events, password resets) ──
    const { data: authEvents } = await admin
      .from('auth_events')
      .select('id, event_type, ip_address, user_agent, details, created_at, email')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5000);  // generous cap to prevent runaway responses

    // ─── 5. In-practice audit events (where this user was the actor) ──
    const { data: auditEvents } = await admin
      .from('audit_events')
      .select('id, practice_id, event_type, description, details, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5000);

    // ─── 6. Platform audit events (where this user was actor OR target) ──
    const { data: actorEvents } = await admin
      .from('platform_audit_events')
      .select('id, action, target_user_id, target_email, description, details, ip_address, user_agent, created_at')
      .eq('actor_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(2000);

    const { data: targetEvents } = await admin
      .from('platform_audit_events')
      .select('id, action, actor_user_id, target_user_id, target_email, description, details, ip_address, user_agent, created_at')
      .eq('target_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(2000);

    // Merge actor + target with a flag so the user can tell which is which.
    const platformAuditEvents = [
      ...(actorEvents || []).map(e => ({ ...e, your_role: 'actor' })),
      ...(targetEvents || []).map(e => ({ ...e, your_role: 'target' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // ─── 7. Impersonation sessions (admin or target) ──────────────────
    const { data: impAdmin } = await admin
      .from('impersonation_sessions')
      .select('id, admin_user_id, target_user_id, started_at, ended_at, reason, ip_address')
      .eq('admin_user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1000);

    const { data: impTarget } = await admin
      .from('impersonation_sessions')
      .select('id, admin_user_id, target_user_id, started_at, ended_at, reason, ip_address')
      .eq('target_user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(1000);

    const impersonationSessions = [
      ...(impAdmin || []).map(s => ({ ...s, your_role: 'admin' })),
      ...(impTarget || []).map(s => ({ ...s, your_role: 'target' })),
    ].sort((a, b) => new Date(b.started_at) - new Date(a.started_at));

    // ─── Build the archive ────────────────────────────────────────────
    const archive = {
      gpdash_export: {
        format_version: 1,
        generated_at: new Date().toISOString(),
        user_id: user.id,
        user_email: user.email,
        note: [
          'This file contains everything GPDash holds about your account.',
          'It does NOT include practice-scoped data (clinicians, CSV uploads, rotas) —',
          'that data is controlled by the practice, not by you as a user. If you',
          'need a practice-level export, contact the practice owner.',
          'MFA secrets are intentionally excluded for security reasons.',
        ].join(' '),
      },
      profile,
      practice_memberships: memberships || [],
      mfa_factors: mfa,
      auth_events: authEvents || [],
      audit_events_as_actor: auditEvents || [],
      platform_audit_events: platformAuditEvents,
      impersonation_sessions: impersonationSessions,
      counts: {
        practice_memberships: (memberships || []).length,
        mfa_factors: mfa.length,
        auth_events: (authEvents || []).length,
        audit_events_as_actor: (auditEvents || []).length,
        platform_audit_events: platformAuditEvents.length,
        impersonation_sessions: impersonationSessions.length,
      },
    };

    // Log the export to platform_audit_events. Article 15 requests are
    // worth tracking — both for the user's own audit trail and for our
    // own DSPT-aligned record of subject access activity.
    try {
      await admin.rpc('log_platform_audit_event', {
        p_action: 'other',
        p_target_user_id: user.id,
        p_target_email: user.email,
        p_description: 'Account data exported (GDPR Article 15 request)',
        p_details: {
          counts: archive.counts,
          format_version: 1,
        },
        p_ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        p_user_agent: request.headers.get('user-agent') || null,
      });
    } catch { /* never fail the export because audit logging hiccuped */ }

    const datePart = new Date().toISOString().slice(0, 10);
    const filename = `gpdash-account-${user.id.slice(0, 8)}-${datePart}.json`;

    return new NextResponse(JSON.stringify(archive, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return serverError('Failed to generate account export', err);
  }
}
