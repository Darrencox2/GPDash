// /api/v4/account/delete
//
// GDPR Article 17 — right to erasure. Permanently deletes the signed-in
// user's GPDash account. Cannot be undone.
//
// The user explicitly chose "option 1, anonymise audit logs" — so this
// flow keeps audit trail rows but nulls out the personal identifiers.
// The FK migration (043_fk_cascade_for_gdpr_erasure.sql) does the heavy
// lifting at the DB level by switching CASCADE/NO ACTION FKs to SET NULL
// on every reference to auth.users.
//
// ═══ Sequence ═══
//
//   1. Verify confirmation: body must include {confirm_email}. We check
//      it matches the current user's email (case-insensitive). This
//      protects against bookmarked CSRF-ish links + ensures the user
//      really meant to do this.
//
//   2. Re-run the delete-check blockers (sole owner, sole platform admin).
//      The pre-flight check is for UX; this is the safety check that
//      actually prevents the operation. If a blocker exists, refuse.
//
//   3. Null out denormalised personal columns. The DB-level cascade
//      will null user_id, but denormalised mirrors of the user's
//      identifiers (auth_events.email, platform_audit_events.target_email)
//      need explicit scrubbing or they persist in the audit trail.
//
//   4. End any active impersonation sessions involving this user.
//      The FK SET NULL would leave a dangling open session otherwise.
//
//   5. Log the deletion to platform_audit_events BEFORE deleting the
//      user. Once the auth.users row is gone, supabase.auth.uid() and
//      ip-address sourcing both become problematic, so we log first.
//      We deliberately preserve target_email in this final record (with
//      the deleted user's email) as a legitimate-interest retention
//      requirement — GPDash needs to be able to demonstrate, on request,
//      that a specific account-deletion request was honoured.
//
//   6. Delete the auth.users row via supabase.auth.admin.deleteUser.
//      DB cascades handle profiles + practice_users; SET NULL cascades
//      handle audit_events / auth_events / etc.
//
//   7. Sign the user out (their session is now invalid anyway, but
//      explicit is better).
//
//   8. Return success — the client redirects to /v4/goodbye.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { serverError } from '@/lib/api-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const confirmEmail = (body.confirm_email || '').trim().toLowerCase();
    const userEmail = (user.email || '').trim().toLowerCase();

    if (!confirmEmail || confirmEmail !== userEmail) {
      return NextResponse.json(
        { error: 'Confirmation email does not match your account email. Account NOT deleted.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // ─── 2. Re-run blocker checks (safety net) ────────────────────────
    // Mirrors delete-check; refuses if anything has changed since the
    // user opened the dialog.
    const { data: ownedPractices } = await admin
      .from('practice_users')
      .select('practice_id, practices!inner(slug, name)')
      .eq('user_id', user.id)
      .eq('role', 'owner');

    for (const ow of (ownedPractices || [])) {
      const { count } = await admin
        .from('practice_users')
        .select('user_id', { count: 'exact', head: true })
        .eq('practice_id', ow.practice_id)
        .eq('role', 'owner')
        .neq('user_id', user.id);
      if ((count || 0) === 0) {
        return NextResponse.json(
          { error: `You are the sole owner of "${ow.practices.name}". Promote another member to owner first.` },
          { status: 409 }
        );
      }
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.is_platform_admin) {
      const { count: otherAdmins } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_platform_admin', true)
        .neq('id', user.id);
      if ((otherAdmins || 0) === 0) {
        return NextResponse.json(
          { error: 'You are the only platform admin. Promote another admin first.' },
          { status: 409 }
        );
      }
    }

    // ─── 3. Scrub denormalised PII ────────────────────────────────────
    // Done with admin client (no RLS in the way) and BEFORE the cascade.
    // Failures here aren't fatal — they're logged but we proceed with
    // deletion, since the cascade itself will null out user_id anyway.
    // The worst-case is an email lingering in a denormalised column;
    // we can mop that up via a maintenance task later.
    // NB: a supabase-js query RESOLVES with { error } rather than throwing,
    // so the catch alone only ever saw a thrown TypeError - a genuine query
    // failure passed through unnoticed. Check the returned error too, and
    // carry the outcome to the caller: erasure that reports success while
    // an email survives in a denormalised column is the one failure mode
    // worth telling the user about.
    const scrubFailures = [];
    const scrub = async (label, run) => {
      try {
        const { error } = await run();
        if (error) throw error;
      } catch (e) {
        console.warn(`[account/delete] ${label} scrub failed:`, e?.message);
        scrubFailures.push(label);
      }
    };

    await scrub('auth_events.email', () =>
      admin.from('auth_events').update({ email: null }).eq('user_id', user.id));

    await scrub('platform_audit_events.target_email', () =>
      admin.from('platform_audit_events').update({ target_email: null }).eq('target_user_id', user.id));

    // ─── 4. End active impersonation sessions ─────────────────────────
    // Any session where this user is admin OR target gets ended now.
    try {
      const now = new Date().toISOString();
      await admin
        .from('impersonation_sessions')
        .update({ ended_at: now })
        .is('ended_at', null)
        .or(`admin_user_id.eq.${user.id},target_user_id.eq.${user.id}`);
    } catch (e) { console.warn('[account/delete] impersonation session close failed:', e?.message); }

    // ─── 5. Log to platform_audit_events ──────────────────────────────
    // Preserve email + user_id at log time so the record is intelligible
    // post-deletion. After this row is written, the cascade will set
    // actor_user_id to null (the actor is the deleted user themself);
    // target_email stays for traceability (legitimate interest).
    try {
      await admin.rpc('log_platform_audit_event', {
        p_action: 'other',
        p_target_user_id: user.id,
        p_target_email: user.email,
        p_description: 'Account deleted by user (GDPR Article 17 request)',
        p_details: {
          deletion_method: 'self_service',
          owned_practices_at_deletion: (ownedPractices || []).length,
          was_platform_admin: !!profile?.is_platform_admin,
        },
        p_ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        p_user_agent: request.headers.get('user-agent') || null,
      });
    } catch (e) { console.warn('[account/delete] audit log write failed:', e?.message); }

    // ─── 6. Delete the user ──────────────────────────────────────────
    // This is the destructive step. After it succeeds, the FK cascades
    // and SET NULLs from migration 043 take care of everything else.
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      // Most common cause: a leftover FK with NO ACTION on it that wasn't
      // covered by the migration. Surface the message rather than 500.
      return NextResponse.json(
        {
          error: 'Account deletion failed at the database level.',
          detail: delErr.message,
          hint: 'This is likely a leftover foreign-key constraint. Please contact security@gpdash.net so we can clear the blocker and complete the deletion.',
        },
        { status: 500 }
      );
    }

    // ─── 7. Sign out on this device ───────────────────────────────────
    // The session is invalid anyway, but explicit sign-out clears cookies.
    try { await supabase.auth.signOut(); } catch { /* ignore */ }

    // The account itself is gone either way - ok stays true. But name any
    // column that still holds an identifier so the caller can escalate
    // rather than assume erasure was complete.
    return NextResponse.json({
      ok: true,
      redirect: '/v4/goodbye',
      ...(scrubFailures.length ? {
        pii_scrub_incomplete: scrubFailures,
        warning: 'Your account was deleted, but an email address may remain in one or more audit tables. Contact security@gpdash.net to have it removed.',
      } : {}),
    });
  } catch (err) {
    return serverError('Account deletion failed', err);
  }
}
