// /dashboard?practice=UUID — legacy URL, kept for one release as a redirect
// to the new canonical /p/[slug] route. Existing bookmarks keep working.
//
// New code should always link to /p/[slug] directly.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { resolvePracticeIdentifier } from '@/lib/v4-data';

export const dynamic = 'force-dynamic';

export default async function LegacyDashboardRedirect({ searchParams }) {
  const practiceId = searchParams?.practice;
  if (!practiceId) redirect('/v4/dashboard');

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) redirect('/v4/dashboard');

  const practice = await resolvePracticeIdentifier(supabase, practiceId);
  if (!practice) redirect('/v4/dashboard');

  redirect(`/p/${practice.slug}`);
}
