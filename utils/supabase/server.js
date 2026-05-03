import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client.
// Used in: API routes, server components, server actions.
// Reads/writes auth cookies so logged-in users stay authenticated across requests.
//
// Env vars required (set in Vercel project settings, NEVER hardcoded):
//   NEXT_PUBLIC_SUPABASE_URL    — public, baked into client bundle
//   NEXT_PUBLIC_SUPABASE_ANON_KEY — public, baked into client bundle
export const createClient = (cookieStore) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel project settings.');
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
