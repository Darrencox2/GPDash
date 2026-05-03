import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request) {
  const { supabase, supabaseResponse } = createClient(request);

  // If Supabase is configured, refresh the session.
  // This call updates the auth cookie if the access token expired.
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();

    // If a Supabase-authenticated user lands on the root '/', they're
    // probably here to use v4. Bounce them to /dashboard. The dashboard
    // will then redirect to /v4/dashboard if no practice is selected.
    //
    // This means production users (no Supabase session) still see the
    // v3 password screen on '/' — preserving legacy behaviour.
    if (user && request.nextUrl.pathname === '/') {
      const dest = request.nextUrl.clone();
      dest.pathname = '/dashboard';
      return NextResponse.redirect(dest);
    }
  }

  return supabaseResponse;
}

// Run middleware on all paths except static assets and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
