// /buddy - landing for the multi-tenant buddy cover URL space.
//
// The per-practice public URL is /buddy/<slug>. But historic links (the
// EMIS appointment links embedded at practices before v4) point at the
// bare /buddy, so this page redirects when the destination is unambiguous:
// if exactly ONE practice has the public buddy board enabled, go there.
// With zero or several public practices a bare /buddy cannot identify a
// practice, so it stays a 404. Fully multi-tenant - no slug is hardcoded.

import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/utils/supabase/admin';

export const metadata = {
  title: 'Buddy cover - GPDash',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function BuddyLanding() {
  let slugs = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('practices')
      .select('slug')
      .eq('buddy_cover_public', true)
      .limit(2);
    slugs = (data || []).map((p) => p.slug).filter(Boolean);
  } catch {
    // fall through to 404
  }
  if (slugs.length === 1) redirect(`/buddy/${slugs[0]}`);
  notFound();
}
