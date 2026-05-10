// /api/v4/admin/impersonate
//
// Platform-admin endpoint to start an impersonation session. The flow:
//
//   1. Admin clicks "Impersonate" on a user's detail page.
//   2. Browser POSTs here with { target_user_id, reason }.
//   3. We:
//      - verify caller is platform admin
//      - refuse self-impersonation, suspended targets, or impersonating
//        another platform admin (lateral privilege escalation guard)
//      - create an impersonation_sessions row (1-hour expiry by default)
//      - generate a signup/magiclink for the target via service-role API
//      - set an HTTP-only cookie 'gpdash_imp' = <session_id> so the
//        banner can verify the impersonation server-side later
//      - sign the admin out of their current session
//      - return the magic link URL
//   4. Browser navigates to the magic link, signs in as the target.
//      The 'gpdash_imp' cookie persists across the sign-in.
//   5. Layout reads the cookie, validates via admin_check_impersonation
//      RPC, renders a red banner during the impersonated session.
//
// End-impersonation is its own route (./end-impersonation/route.js).
//
// SECURITY POSTURE
//   - The cookie value is the impersonation_session UUID. We validate
//     it server-side against the DB on every render that needs the
//     banner. UUIDs are unguessable; an attacker can't forge a session.
//   - The RPC admin_check_impersonation enforces "caller IS the target"
//     so even with a stolen cookie value, only the actual signed-in
//     user can use it to verify a banner.
//   - Time-limited: 1 hour. After expiry, the banner stops showing
//     even if the cookie is still set (the RPC returns null).
//   - Auth ban check: we refuse to impersonate suspended users
//     because doing so would effectively bypass the suspension.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // ─── 1. Verify caller is a platform admin ────────────────────────────
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', caller.id)
    .maybeSingle();
  if (!callerProfile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden: platform admin only' }, { status: 403 });
  }

  // ─── 2. Read body ────────────────────────────────────────────────────
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const targetUserId = body?.target_user_id;
  const reason = (body?.reason || '').trim() || null;
  if (!targetUserId) {
    return NextResponse.json({ error: 'target_user_id required' }, { status: 400 });
  }
  if (targetUserId === caller.id) {
    return NextResponse.json({ error: 'Cannot impersonate yourself' }, { status: 400 });
  }

  // ─── 3. Refuse target if suspended OR another platform admin ─────────
  // - Suspended: impersonating would bypass the suspension's sign-in block.
  // - Platform admin: we don't allow lateral privilege flows. If you
  //   need to act as another platform admin, ask them directly.
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('is_platform_admin, suspended_at')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!targetProfile) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
  }
  if (targetProfile.suspended_at) {
    return NextResponse.json({ error: 'Cannot impersonate a suspended user' }, { status: 400 });
  }
  if (targetProfile.is_platform_admin) {
    return NextResponse.json({
      error: 'Cannot impersonate another platform admin. Ask them directly.'
    }, { status: 400 });
  }

  // ─── 4. Look up target email — needed for the magic link ─────────────
  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const { data: targetUserRow, error: targetErr } = await adminClient.auth.admin.getUserById(targetUserId);
  if (targetErr || !targetUserRow?.user) {
    return NextResponse.json({ error: 'Could not look up target user' }, { status: 500 });
  }
  const targetEmail = targetUserRow.user.email;

  // ─── 5. Record the session FIRST so we have the ID for the cookie ────
  // If anything below fails, we'll still have the audit trail.
  const ipHeader = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
  const ip = ipHeader.split(',')[0].trim() || null;
  const userAgent = request.headers.get('user-agent') || null;

  const { data: sessionRow, error: insertErr } = await adminClient
    .from('impersonation_sessions')
    .insert({
      admin_user_id: caller.id,
      target_user_id: targetUserId,
      reason,
      admin_ip: ip,
      admin_user_agent: userAgent,
    })
    .select('id, expires_at')
    .single();
  if (insertErr || !sessionRow) {
    return NextResponse.json({
      error: `Could not record impersonation: ${insertErr?.message || 'unknown'}`,
    }, { status: 500 });
  }

  // ─── 6. Generate the magic link for the target ───────────────────────
  const origin = request.headers.get('origin')
    || `https://${request.headers.get('host')}`
    || '';
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
    options: {
      redirectTo: `${origin}/auth/callback?next=/v4/dashboard`,
    },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    // Roll back the session row — no usable link means no impersonation.
    await adminClient
      .from('impersonation_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionRow.id);
    return NextResponse.json({
      error: `Could not generate sign-in link: ${linkErr?.message || 'unknown'}`,
    }, { status: 500 });
  }

  // ─── 7. Set the impersonation cookie + sign caller out ───────────────
  // The cookie is HttpOnly so client JS can't read or modify it.
  // Path is broad so it survives navigation; expires when the session
  // expires (or sooner if the admin signs out).
  const response = NextResponse.json({
    ok: true,
    action_link: linkData.properties.action_link,
    session_id: sessionRow.id,
  });
  response.cookies.set('gpdash_imp', sessionRow.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(sessionRow.expires_at),
  });

  // Sign the caller out of their current admin session — the next
  // request comes back as anonymous, and the magic link will sign them
  // in as the target. Without this step they'd briefly have BOTH
  // sessions, which is confusing.
  await supabase.auth.signOut();

  return response;
}
