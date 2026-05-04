// /v4/practice/[id]/setup — Practice setup wizard.
//
// Practice search drives the entire flow now: pick the practice from
// OpenPrescribing → name, ODS code, list size auto-fill. Postcode is
// entered separately (after practice selection) for school holiday LEA
// lookup. Will be auto-filled in a future round once we ingest EPRACCUR.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { resolvePracticeIdentifier } from '@/lib/v4-data';
import DashboardShell from '@/components/DashboardShell';
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
    supabase.from('practices').select('id, name, slug, ods_code, postcode, list_size, online_consult_tool, region, setup_completed_at').eq('id', practiceId).maybeSingle(),
    supabase.from('practice_users').select('role').eq('practice_id', practiceId).eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle(),
  ]);

  const isPlatformAdmin = !!myProfile?.is_platform_admin;
  const isAdminOrOwner = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  if (!isAdminOrOwner && !isPlatformAdmin) {
    redirect(`/p/${practice.slug}`);
  }

  const shellData = {
    _v4: {
      practiceSlug: practice.slug,
      practiceName: practice.name,
      myRole: isPlatformAdmin ? 'owner' : (myMembership?.role || null),
      isPlatformAdmin,
    },
  };

  return (
    <DashboardShell shellData={shellData} activeSection="practice-settings">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
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
            name: fullPractice?.name || '',
            odsCode: fullPractice?.ods_code || '',
            postcode: fullPractice?.postcode || '',
            listSize: fullPractice?.list_size || '',
            onlineConsultTool: fullPractice?.online_consult_tool || '',
            region: fullPractice?.region || '',
            setupCompletedAt: fullPractice?.setup_completed_at,
          }}
        />
      </div>
    </DashboardShell>
  );
}
