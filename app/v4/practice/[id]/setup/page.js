// /v4/practice/[id]/setup — Practice setup wizard.
//
// Captures postcode, list size, and online consultation tool. Skippable but
// recommended (a banner appears on the Today page until setup_completed_at
// is set). Owner/admin only.
//
// Postcode triggers a client-side lookup against postcodes.io which returns
// the LEA (admin_district). We use that to pick the right school holiday
// calendar from lib/school-holidays-by-lea.js.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { resolvePracticeIdentifier } from '@/lib/v4-data';
import PracticeSetupForm from './PracticeSetupForm';

export const dynamic = 'force-dynamic';

export default async function PracticeSetupPage({ params }) {
  const { id: identifier } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const practice = await resolvePracticeIdentifier(supabase, identifier);
  if (!practice) notFound();
  const practiceId = practice.id;

  // Canonicalise to slug
  if (identifier !== practice.slug) {
    redirect(`/v4/practice/${practice.slug}/setup`);
  }

  // Fetch full practice row + check role
  const [
    { data: fullPractice },
    { data: myMembership },
    { data: myProfile },
  ] = await Promise.all([
    supabase.from('practices').select('id, name, slug, postcode, list_size, online_consult_tool, region, setup_completed_at').eq('id', practiceId).maybeSingle(),
    supabase.from('practice_users').select('role').eq('practice_id', practiceId).eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle(),
  ]);

  const isPlatformAdmin = !!myProfile?.is_platform_admin;
  const isAdminOrOwner = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  if (!isAdminOrOwner && !isPlatformAdmin) {
    redirect(`/p/${practice.slug}`);
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href={`/v4/practice/${practice.slug}`} style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
          ← Back to practice management
        </Link>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#22d3ee', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 500, marginBottom: 4 }}>
            Practice setup
          </div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'white', marginBottom: 6 }}>
            {fullPractice?.name}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6 }}>
            Tell us a bit about your practice so we can calibrate demand predictions and
            holidays accurately. You can come back and edit any of this later.
          </p>
        </div>

        <PracticeSetupForm
          practiceId={practiceId}
          practiceSlug={practice.slug}
          initial={{
            postcode: fullPractice?.postcode || '',
            listSize: fullPractice?.list_size || '',
            onlineConsultTool: fullPractice?.online_consult_tool || '',
            region: fullPractice?.region || '',
            setupCompletedAt: fullPractice?.setup_completed_at,
          }}
        />
      </div>
    </div>
  );
}
