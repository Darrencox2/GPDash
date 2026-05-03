import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Admin Supabase client — bypasses RLS using the service_role key.
//
// CRITICAL SECURITY:
// - This key has FULL database access. Never expose it to the browser.
// - Only ever import this from server code (API routes, server actions).
// - Never reference SUPABASE_SERVICE_ROLE_KEY in a 'use client' file.
//
// Use this only for:
// - Data import scripts (one-off operations)
// - System-level operations that legitimately need to bypass tenant isolation
// - Background jobs running as the system, not as a user
//
// For all normal app code, use utils/supabase/server.js (anon key + RLS).
export const createAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
