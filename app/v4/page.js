// /v4 — root entry point. There's no landing page here yet, so we just
// route to the most useful destination depending on auth state:
//   - signed in → /v4/dashboard (their user dashboard, with practice list)
//   - signed out → /v4/login
//
// Without this page, visiting /v4 directly returns Next.js's 404 because
// the folder only has child routes (login/dashboard/admin/etc.) and no
// index page of its own.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export default async function V4RootPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  // If Supabase isn't configured we still want a useful destination —
  // the login page will surface that error in a friendly way.
  if (!supabase) redirect('/v4/login');

  const { data: { user } } = await supabase.auth.getUser();
  redirect(user ? '/v4/dashboard' : '/v4/login');
}
