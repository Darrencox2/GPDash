// /v4/onboarding/setup/[id] — guided practice setup wizard.
//
// Server component: gates access (must be signed in + admin/owner of
// this practice), loads everything the wizard needs to render its
// initial state (practice details, TeamNet URL, whether clinicians
// exist, whether demand data has been uploaded), and forwards to the
// client wizard component.
//
// If setup_completed_at is already set, redirect straight to the
// practice's Today page — there's nothing to do here.
//
// Non-admin practice members hitting this URL get bounced to /v4/dashboard
// (or /p/<slug> via the redirect logic on that page). The wizard is
// strictly an owner/admin experience.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import SetupWizard from './SetupWizard';
import { isMinimumSetupComplete } from '@/lib/setup-status';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Set up your practice',
};

export default async function OnboardingSetupPage({ params }) {
  const { id: practiceId } = await params;
  const supabase = createClient(cookies());

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/v4/login?next=${encodeURIComponent(`/v4/onboarding/setup/${practiceId}`)}`);
  }

  // Membership + role check. Anonymous, non-members, and regular users
  // are all sent to the dashboard — the wizard is owners/admins only.
  // (When the wizard finishes the user invites their team, so during
  // setup there are typically no other members anyway.)
  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership || !['owner', 'partner', 'practice_manager', 'admin'].includes(membership.role)) {
    redirect('/v4/dashboard');
  }

  // Load practice details. Slug is what /p/<slug> uses; we'll redirect
  // there once setup completes.
  const { data: practice } = await supabase
    .from('practices')
    .select('id, name, slug, postcode, list_size, region, ods_code, latitude, longitude, admin_district, setup_completed_at, buddy_cover_public')
    .eq('id', practiceId)
    .single();

  if (!practice) {
    redirect('/v4/dashboard');
  }

  // Wizard is replayable. Even after setup_completed_at is set, the user
  // can revisit this URL to update TeamNet URL, re-upload a CSV, send
  // more invites, etc. Each step shows its existing state populated
  // from current data, so nothing needs to be re-entered — they can
  // just review or change what they want. The "?replay=1" link in
  // practice management drops them here explicitly; direct visits
  // (typing the URL, browser history) also work.

  // TeamNet URL, huddle settings (for existing slot filters), room
  // allocation (for existing sites) all live on practice_settings.
  const { data: settings } = await supabase
    .from('practice_settings')
    .select('teamnet_url, huddle_settings, room_allocation')
    .eq('practice_id', practiceId)
    .maybeSingle();

  // Existing CSV upload — needed by the slot-types and sites steps so
  // they show real data after a page refresh. If the user hasn't
  // uploaded yet this is just null and those steps show their
  // upload-first prompt.
  const { data: csvRow } = await supabase
    .from('huddle_csv_data')
    .select('data')
    .eq('practice_id', practiceId)
    .maybeSingle();

  // Counts let the wizard tell which optional steps are already done.
  // We only need to know "any vs none" so head:true count is fastest.
  const { count: clinicianCount } = await supabase
    .from('clinicians')
    .select('id', { count: 'exact', head: true })
    .eq('practice_id', practiceId);

  const { count: demandHistoryCount } = await supabase
    .from('demand_history')
    .select('practice_id', { count: 'exact', head: true })
    .eq('practice_id', practiceId);

  // Pending invites count — if the user already invited their team,
  // we'll show that step as already done.
  const { count: pendingInvitesCount } = await supabase
    .from('practice_invites')
    .select('id', { count: 'exact', head: true })
    .eq('practice_id', practiceId)
    .is('accepted_at', null)
    .is('revoked_at', null);

  // ─── Auto-completion ────────────────────────────────────────────────
  // setup_completed_at used to require an explicit "Complete setup"
  // button click. With v4.8.0 it's derived from data: the moment the
  // minimum (postcode + list size + ≥1 clinician) is met, we set the
  // timestamp on the next load. The user is still in the wizard so
  // they can keep going through optional steps (TeamNet, demand,
  // invites) — but they can leave to the dashboard at any time without
  // anything blocking them.
  const minimumMet = isMinimumSetupComplete(practice, clinicianCount || 0);
  if (minimumMet && !practice.setup_completed_at) {
    await supabase
      .from('practices')
      .update({ setup_completed_at: new Date().toISOString() })
      .eq('id', practiceId);
    // Refresh the local object so the wizard knows it's auto-completed.
    practice.setup_completed_at = new Date().toISOString();
  }

  return (
    <SetupWizard
      practice={practice}
      teamnetUrl={settings?.teamnet_url || ''}
      hasClinicians={(clinicianCount || 0) > 0}
      hasDemandData={(demandHistoryCount || 0) > 0}
      hasInvites={(pendingInvitesCount || 0) > 0}
      buddyCoverPublic={!!practice.buddy_cover_public}
      userRole={membership.role}
      autoCompleted={minimumMet}
      initialHuddleSettings={settings?.huddle_settings || {}}
      initialSites={settings?.room_allocation?.sites || []}
      initialCsvData={csvRow?.data || null}
    />
  );
}
