// /buddy/[slug] — public per-practice buddy cover page.
//
// Server-side check: practice exists AND buddy_cover_public is true.
// If either is false, 404 (don't leak which). On success, render the
// PublicBuddyView client component which polls the public API every
// 2 minutes for live updates.
//
// Why admin client for the existence check (instead of anon + RLS):
// the practices RLS policy currently restricts SELECT to platform
// admins + members. Loosening that to allow anon reads when
// buddy_cover_public=true would expose the whole row (ods_code,
// list_size, postcode, etc.) to anyone hitting the API. Keeping
// the check application-side keeps the access control in one place
// (our code) and only surfaces the fields we explicitly return.

import { createAdminClient } from '@/utils/supabase/admin';
import { notFound } from 'next/navigation';
import PublicBuddyView from './PublicBuddyView';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const slug = (await params)?.slug;
  return {
    title: 'Buddy Cover · GPDash',
    description: 'Live buddy cover allocations for the practice.',
    robots: { index: false, follow: false },
    other: { 'x-practice-slug': slug || '' },
  };
}

export default async function PublicBuddyPage({ params }) {
  const slug = (await params)?.slug;
  if (!slug || typeof slug !== 'string' || slug.length > 64) notFound();

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: practice } = await admin
    .from('practices')
    .select('slug, name, buddy_cover_public')
    .eq('slug', slug)
    .maybeSingle();

  if (!practice || !practice.buddy_cover_public) notFound();

  return <PublicBuddyView slug={practice.slug} practiceName={practice.name} />;
}
