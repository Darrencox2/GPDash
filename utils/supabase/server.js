import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client.
// Used in: API routes, server components, server actions.
// Reads/writes auth cookies so logged-in users stay authenticated across requests.
//
// Env vars required (set in Vercel project settings, NEVER hardcoded):
//   NEXT_PUBLIC_SUPABASE_URL    — public, baked into client bundle
//   NEXT_PUBLIC_SUPABASE_ANON_KEY — public, baked into client bundle
//
// Returns null if env vars are missing (e.g. during build) — callers should handle.
export const createClient = (cookieStore) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — middleware will refresh sessions instead.
        }
      },
    },
  });
};
