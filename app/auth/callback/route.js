// /auth/callback — handles redirects from email verification and OAuth flows.
// Supabase sends users here with a `code` query param; we exchange it for a
// session, then redirect to the originally-intended destination (or home).

import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/v4/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — back to login with an error param
  return NextResponse.redirect(`${origin}/v4/login?error=callback_failed`);
}
