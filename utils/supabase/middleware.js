import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Middleware Supabase helper.
// Refreshes auth sessions on every request so users stay logged in.
// Called from /middleware.js at the project root.
export const createClient = (request) => {
  let supabaseResponse = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Don't block the request if env vars missing — just skip session refresh.
    // This means in production with proper env, sessions refresh; locally without env, app still loads.
    return { supabase: null, supabaseResponse };
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  return { supabase, supabaseResponse };
};
