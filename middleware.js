import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

// Middleware runs on EVERY matched request. We previously matched almost
// everything and did a Supabase auth round-trip per request — adding ~150-400ms
// to each API call. Now we restrict it to:
//   1. Auth callback handling (/auth/callback)
//   2. The root path '/' (so we can redirect logged-in users to /dashboard)
//   3. /v4/* pages that need session refresh
//
// API routes do their own auth check and don't need the middleware overhead.
// The dashboard page itself doesn't need it either — its useEffect calls
// /api/v4/data which auths server-side.
export async function middleware(request) {
  const path = request.nextUrl.pathname;

  // Only do the work if we might actually need to redirect from '/'
  if (path === '/') {
    const { supabase, supabaseResponse } = createClient(request);
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const dest = request.nextUrl.clone();
        dest.pathname = '/dashboard';
        return NextResponse.redirect(dest);
      }
    }
    return supabaseResponse;
  }

  // For /v4/* and /auth/callback, refresh the session (sets the cookie if
  // the token rotated). Skip the user-fetch optimisation since these are
  // typically navigation, not high-frequency.
  if (path.startsWith('/v4/') || path.startsWith('/auth/callback')) {
    const { supabase, supabaseResponse } = createClient(request);
    if (supabase) {
      await supabase.auth.getUser();
    }
    return supabaseResponse;
  }

  // Everything else: pass through with no middleware overhead.
  return NextResponse.next();
}

// Match only the paths above. /api routes and /dashboard skip middleware
// entirely — major perf win for API call latency.
export const config = {
  matcher: [
    '/',
    '/v4/:path*',
    '/auth/callback',
  ],
};
