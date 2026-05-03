import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request) {
  const { supabase, supabaseResponse } = createClient(request);

  // If Supabase is configured, refresh the session.
  // This call updates the auth cookie if the access token expired.
  if (supabase) {
    await supabase.auth.getUser();
  }

  return supabaseResponse;
}

// Run middleware on all paths except static assets and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
