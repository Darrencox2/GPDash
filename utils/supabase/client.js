'use client';
import { createBrowserClient } from '@supabase/ssr';

// Browser Supabase client.
// Used in: client components ('use client') for direct Supabase calls from the browser.
//
// Note: only the public anon key is ever sent to the browser (NEVER service_role).
// Row-level security policies on the database enforce what each user can see/do.
//
// Returns null if env vars are missing (e.g. during build) — callers should handle.
export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (typeof window !== 'undefined') {
      console.error('Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel project settings.');
    }
    return null;
  }

  return createBrowserClient(url, key, {
    auth: {
      // PKCE flow: the email link carries only a `code` that is worthless
      // to anyone but the browser that requested it (it holds the matching
      // verifier). This defeats NHSmail/Outlook link scanners that were
      // pre-fetching the old implicit-flow links and burning the
      // single-use token before the user could click — the cause of
      // "reset link invalid immediately", confirmed in the auth logs
      // (scanner GET /verify -> 403 "One-time token not found").
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
};
