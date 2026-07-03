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

  // Mirror the practice slug into the fast-path cookie ON THE SERVER for
  // every dashboard visit. The client-side setter alone was not enough: iOS
  // home-screen apps can keep a cookie jar separate from Safari, so the
  // cookie must be planted by whichever context actually loads the dashboard.
  // Pure string ops — no auth, no network.
  if (path.startsWith('/p/')) {
    const m = path.match(/^\/p\/([a-zA-Z0-9-]{1,64})$/);
    const res = NextResponse.next();
    if (m) res.cookies.set('gpdash-last-practice', m[1], { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return res;
  }

  // Only do the work if we might actually need to redirect from '/'
  if (path === '/') {
    // FAST PATH: returning user launching the app (e.g. iOS home-screen icon
    // saved at '/'). If we know their last practice (cookie set client-side by
    // DashboardClient) and they carry a Supabase auth cookie, redirect straight
    // to /p/{slug} with ZERO network calls. This collapses the old launch chain
    // (/ -> network getUser -> /dashboard -> auth+membership query -> /p/slug:
    // three sequential server round-trips) into one hop. If the auth cookie is
    // stale the target page redirects to login exactly as it always did; if the
    // practice is stale the target page handles that too.
    const lastPractice = request.cookies.get('gpdash-last-practice')?.value || '';
    const hasAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'));
    if (hasAuthCookie && /^[a-zA-Z0-9-]{1,64}$/.test(lastPractice)) {
      const dest = request.nextUrl.clone();
      dest.pathname = `/p/${lastPractice}`;
      return NextResponse.redirect(dest);
    }

    const { supabase, supabaseResponse } = createClient(request);
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const dest = request.nextUrl.clone();
        dest.pathname = '/dashboard';
        return NextResponse.redirect(dest);
      }
    }
    // Anonymous visitor: should they see v3 (legacy single-tenant Winscombe
    // app) or v4 (multi-tenant SaaS with sign-up)?
    //
    // Production gpdash.net currently serves v3 to live Winscombe, so the
    // safe default is "show v3". But on the v4 preview deployment we want
    // / to land on the v4 sign-in/sign-up page so testers don't hit the
    // password-gated legacy app instead.
    //
    // Detection (in priority order):
    //  1. NEXT_PUBLIC_DEFAULT_TO_V4 env var — manual override, useful when
    //     we eventually flip production too without changing this code
    //  2. VERCEL_ENV === 'preview' — automatic for any non-production
    //     Vercel deployment (preview branches, PR previews, etc.)
    //
    // Production stays on v3 unless the env var is set explicitly.
    const forceV4 = process.env.NEXT_PUBLIC_DEFAULT_TO_V4 === 'true';
    const isVercelPreview = process.env.VERCEL_ENV === 'preview';
    if (forceV4 || isVercelPreview) {
      const dest = request.nextUrl.clone();
      dest.pathname = '/v4';
      return NextResponse.redirect(dest);
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
    '/p/:path*',
    '/v4/:path*',
    '/auth/callback',
  ],
};
