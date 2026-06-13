// /auth/callback — handles redirects from email verification and OAuth flows.
// Supabase sends users here with a `code` query param; we exchange it for a
// session, then redirect to the originally-intended destination (or home).

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  // Recovery links must land on the password form; everything else on the
  // dashboard (or an explicit ?next=).
  const next = searchParams.get('next') || (type === 'recovery' ? '/v4/reset-password/update' : '/v4/dashboard');

  if (code || tokenHash) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // PKCE links carry ?code=...; token_hash links carry ?token_hash=&type=
    let error;
    if (code) {
      ({ error } = await supabase.auth.exchangeCodeForSession(code));
    } else {
      ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || 'recovery' }));
    }
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send recovery failures back to the reset page so
  // the user can simply request another; everything else to login.
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/v4/reset-password?error=link_expired`);
  }
  return NextResponse.redirect(`${origin}/v4/login?error=callback_failed`);
}
