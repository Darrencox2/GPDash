// /api/v4/admin/suspend-user
//
// Suspends or unsuspends a user. Two-layer operation:
//
//   1. Supabase auth.users.banned_until — the actual sign-in block.
//      Set via auth.admin.updateUserById with a long ban_duration.
//      Supabase's auth checks this on every sign-in, no middleware needed.
//
//   2. profiles.suspended_at + suspended_reason — our own metadata so
//      the admin UI can show "suspended" badges, the reason, and the date
//      without needing to join against auth.users (which has tighter RLS).
//
// We always write both layers together via this route. POST to suspend,
// DELETE to unsuspend.
//
// Refusal cases:
//   - Caller isn't a platform admin              → 403
//   - Caller is trying to suspend themselves      → 400
//   - Target is the last platform admin           → 400 (lockout protection)
//
// Why not a postgres RPC? Because suspending requires calling the
// Supabase auth admin API (which only the service-role client can do),
// and that lives outside Postgres. Doing it from a route lets us keep
// both the auth ban AND the metadata write in one transactional unit
// (well, two sequential operations with clear error handling).

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 100 years = effectively forever. ban_duration is in time units; '876000h'
// is 100 years in hours. Supabase accepts the format documented at
// https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid
const FOREVER = '876000h';

async function requireAdminCaller() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return { error: 'Supabase not configured', status: 500 };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated', status: 401 };

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    return { error: 'Forbidden: platform admin only', status: 403 };
  }
  return { caller: user, supabase };
}

// ─── POST: suspend ─────────────────────────────────────────────────────────
export async function POST(request) {
  const auth = await requireAdminCaller();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { caller, supabase } = auth;

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const targetUserId = body?.user_id;
  const reason = (body?.reason || '').trim() || null;

  if (!targetUserId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });
  if (targetUserId === caller.id) {
    return NextResponse.json({ error: 'Cannot suspend yourself' }, { status: 400 });
  }

  // Lockout protection: refuse if target is the last platform admin.
  const { data: target } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', targetUserId)
    .maybeSingle();
  if (target?.is_platform_admin) {
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_platform_admin', true);
    if ((count || 0) <= 1) {
      return NextResponse.json({
        error: 'Cannot suspend the last platform admin',
      }, { status: 400 });
    }
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({
      error: 'Service role key not configured',
    }, { status: 500 });
  }

  // 1. Set the auth ban — actual sign-in block.
  const { error: banErr } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { ban_duration: FOREVER }
  );
  if (banErr) {
    return NextResponse.json({ error: `Auth ban failed: ${banErr.message}` }, { status: 500 });
  }

  // 2. Write metadata. If this fails, attempt to roll back the auth ban
  // so we don't end up in an inconsistent state. Best-effort — if even
  // the rollback fails we still return an error so the admin knows.
  const { error: metaErr } = await adminClient
    .from('profiles')
    .update({ suspended_at: new Date().toISOString(), suspended_reason: reason })
    .eq('id', targetUserId);
  if (metaErr) {
    await adminClient.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' }).catch(() => {});
    return NextResponse.json({
      error: `Metadata write failed (auth ban rolled back): ${metaErr.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE: unsuspend ─────────────────────────────────────────────────────
// We use DELETE rather than a separate /unsuspend-user route because the
// operation is the negation of POST: same target, same auth, opposite
// effect. RFC 7231 says DELETE means "remove the resource" — here the
// "resource" is the suspension itself.
export async function DELETE(request) {
  const auth = await requireAdminCaller();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const targetUserId = body?.user_id;
  if (!targetUserId) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }

  // 1. Lift auth ban
  const { error: banErr } = await adminClient.auth.admin.updateUserById(
    targetUserId,
    { ban_duration: 'none' }
  );
  if (banErr) {
    return NextResponse.json({ error: `Lift ban failed: ${banErr.message}` }, { status: 500 });
  }

  // 2. Clear metadata
  const { error: metaErr } = await adminClient
    .from('profiles')
    .update({ suspended_at: null, suspended_reason: null })
    .eq('id', targetUserId);
  if (metaErr) {
    return NextResponse.json({
      error: `Metadata clear failed (auth ban already lifted): ${metaErr.message}`,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
