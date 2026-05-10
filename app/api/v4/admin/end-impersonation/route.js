// /api/v4/admin/end-impersonation
//
// Called when the user (currently signed in as the impersonation target)
// clicks "End impersonation" in the banner. Three steps:
//
//   1. Mark the impersonation_sessions row as ended
//      (RPC enforces caller IS the target — only the impersonated user
//      can end their own session).
//   2. Clear the gpdash_imp cookie.
//   3. Sign out the target session — kicks the user back to /v4/login
//      where the original admin can sign back into their own account.
//
// We deliberately don't auto-sign-the-admin-back-in. Doing that would
// require persisting the admin's session token somewhere, and that's
// a security risk (any cookie/storage we use becomes a way to assume
// the admin's identity). Asking them to re-authenticate is a small
// friction for a strong safety property.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });

  const sessionCookie = cookieStore.get('gpdash_imp');
  if (!sessionCookie?.value) {
    return NextResponse.json({ error: 'No impersonation in progress' }, { status: 400 });
  }

  // Try to mark the session ended. The RPC enforces caller = target.
  // If the user isn't actually being impersonated this will silently
  // do nothing — that's fine, the cookie clear below still happens.
  await supabase.rpc('admin_end_impersonation', {
    session_id: sessionCookie.value,
  });

  // Sign out the target session — sends them back to /v4/login.
  await supabase.auth.signOut();

  // Build the response with the cookie cleared. We set max-age=0 to
  // delete the cookie regardless of its original expiry.
  const response = NextResponse.json({ ok: true });
  response.cookies.set('gpdash_imp', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
