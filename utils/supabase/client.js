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

  return createBrowserClient(url, key);
};
