// /p/[id] — canonical practice dashboard route.
//
// [id] can be: slug (preferred), ods_code, or full UUID. The resolver
// figures out which it is and looks up the practice. Old-style
// /dashboard?practice=UUID URLs redirect here for backwards compat.
//
// Mirrors the old /dashboard page exactly otherwise — server component,
// auth + 9 queries in one Promise.all, hands off to DashboardClient.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { adaptToV3Shape, resolvePracticeIdentifier } from '@/lib/v4-data';
import { isMinimumSetupComplete, getSectionStatuses, countCliniciansNeedingAttention } from '@/lib/setup-status';
import DashboardClient from '@/app/dashboard/DashboardClient';

export const dynamic = 'force-dynamic';

let __warmAt = null;

export default async function PracticePage({ params }) {
  const t0 = Date.now();
  const isCold = __warmAt === null;
  if (isCold) __warmAt = Date.now();

  const identifier = params?.id;
  if (!identifier) redirect('/v4/dashboard');

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return <div style={{ padding: 32, color: 'white', background: '#0f172a', minHeight: '100vh' }}>Configuration error.</div>;
  }

  // Resolve the identifier first — fast, single indexed query.
  const practice = await resolvePracticeIdentifier(supabase, identifier);
  if (!practice) {
    return (
      <div style={{ padding: 32, color: 'white', background: '#0f172a', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>Practice not found</h1>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>No practice matches "{identifier}". Check the URL or <a href="/v4/dashboard" style={{ color: '#22d3ee' }}>pick a practice</a>.</p>
      </div>
    );
  }

  // Canonicalise the URL: if the user came in via UUID or ods_code, redirect
  // to the slug form. This keeps shared/bookmarked URLs pretty.
  if (identifier !== practice.slug) {
    redirect(`/p/${practice.slug}`);
  }

  const practiceId = practice.id;

  // Allocation cutoff
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Auth first (one round-trip) so we have user.id for the parallel queries below.
  // supabase.auth.getUser() is fast (JWT verification from cookie, no DB hit).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const tSetup = Date.now();
  const [
    { data: clinicians },
    { data: workingPatterns },
    { data: absences },
    { data: settings },
    { data: huddleCsv },
    { data: allocations },
    { data: notes },
    { data: memberships },
    { data: myProfile },
    { data: myMembership },
  ] = await Promise.all([
    supabase.from('clinicians').select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, aliases, linked_user_id').eq('practice_id', practiceId).order('name'),
    supabase.from('working_patterns').select('id, clinician_id, effective_from, effective_to, pattern, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId).is('effective_to', null),
    supabase.from('absences').select('id, clinician_id, start_date, end_date, reason, notes, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId),
    supabase.from('practice_settings').select('huddle_settings, buddy_settings, room_allocation, closed_days, teamnet_url, extras, demand_settings').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('huddle_csv_data').select('data, updated_at').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('buddy_allocations').select('date, allocations').eq('practice_id', practiceId).gte('date', cutoffStr),
    supabase.from('rota_notes').select('clinician_id, date, note, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId),
    supabase.from('practice_users').select('role, practices(id, name, slug)').eq('user_id', user.id),
    // Platform admin flag — filter by id because owners/admins see other
    // members' profiles too via RLS.
    supabase.from('profiles').select('is_platform_admin, name, first_name, last_name').eq('id', user.id).maybeSingle(),
    // Role for THIS practice specifically — filter by user_id because
    // owners/admins can see every membership row in the practice via RLS.
    supabase.from('practice_users').select('role, marked_non_clinical').eq('practice_id', practiceId).eq('user_id', user.id).maybeSingle(),
  ]);
  const tQueries = Date.now();

  const v4Data = {
    practice,
    clinicians: clinicians || [],
    workingPatterns: workingPatterns || [],
    absences: absences || [],
    settings: settings || null,
    huddleCsvData: huddleCsv?.data || null,
    huddleCsvUpdatedAt: huddleCsv?.updated_at || null,
    members: [],
  };
  const v3Shape = adaptToV3Shape(v4Data);

  const allocationHistory = {};
  for (const a of (allocations || [])) allocationHistory[a.date] = a.allocations;
  v3Shape.allocationHistory = allocationHistory;

  const rotaNotesMap = {};
  for (const n of (notes || [])) {
    if (!rotaNotesMap[n.clinician_id]) rotaNotesMap[n.clinician_id] = {};
    rotaNotesMap[n.clinician_id][n.date] = n.note;
  }
  v3Shape.rotaNotes = rotaNotesMap;

  const myClinician = (clinicians || []).find(c => c.linked_user_id === user.id);
  const isPlatformAdmin = !!myProfile?.is_platform_admin;
  // Platform admin acts as 'owner' on every practice for UI gating purposes.
  // Otherwise their actual membership role (or null if they have none).
  const myRole = isPlatformAdmin ? 'owner' : (myMembership?.role || null);

  // ─── Auto-complete: derive setup_completed_at from data ────────────
  // setup_completed_at used to need an explicit click to set. Now the
  // server marks it whenever the minimum data is present (postcode +
  // list size + at least one clinician). Self-healing — if anyone
  // creates a practice through SQL or imports v3 data, the dashboard
  // will mark it complete on next visit. Setup never gets stuck in a
  // "I have everything but the flag isn't set" state.
  const minimumMet = isMinimumSetupComplete(practice, (clinicians || []).length);
  if (minimumMet && !practice.setup_completed_at && (myRole === 'owner' || myRole === 'admin')) {
    // Best-effort — don't block the render if this fails.
    try {
      const ts = new Date().toISOString();
      await supabase.from('practices').update({ setup_completed_at: ts }).eq('id', practiceId);
      practice.setup_completed_at = ts;
    } catch (e) {
      // Surface in server logs but proceed
      console.warn('auto-mark setup_completed_at failed:', e?.message);
    }
  }

  // ─── Setup-incomplete gate ─────────────────────────────────────────
  // If the practice owner hasn't finished the setup wizard yet, the
  // dashboard would render an empty/broken-looking experience —
  // missing list size, no clinicians, blank capacity calculations.
  // For owners/admins, bounce them back into the wizard so they
  // finish what they started. For regular team members, show a holding
  // page rather than the broken dashboard. Platform admins skip this
  // and see the dashboard as-is — useful for support / debugging.
  if (!practice.setup_completed_at && !isPlatformAdmin) {
    if (myRole === 'owner' || myRole === 'admin') {
      redirect(`/v4/onboarding/setup/${practiceId}`);
    } else if (myRole) {
      // Regular team member arriving before the owner has finished
      // setup — show them a friendly holding screen via the
      // dedicated route below. (We can't render arbitrary JSX here
      // because this function returns to the dashboard's expected
      // shape; redirect is cleanest.)
      redirect(`/p/${practice.slug}/setup-in-progress`);
    }
    // No role at all — falls through to existing not-found behaviour
    // in the dashboard render below.
  }

  // ─── Section statuses for the dashboard's completeness strip ──────
  // Cheap to compute server-side from data we already loaded. Two
  // extra counts to fetch (demand_history, members) — both head-only.
  const [{ count: demandHistoryCount }, { count: memberCount }] = await Promise.all([
    supabase.from('demand_history').select('practice_id', { count: 'exact', head: true }).eq('practice_id', practiceId),
    supabase.from('practice_users').select('user_id', { count: 'exact', head: true }).eq('practice_id', practiceId),
  ]);
  const sectionStatuses = getSectionStatuses({
    practice,
    clinicianCount: (clinicians || []).length,
    clinicianNeedsAttentionCount: countCliniciansNeedingAttention(clinicians || []),
    teamnetUrl: settings?.teamnet_url || null,
    demandHistoryCount: demandHistoryCount || 0,
    memberCount: memberCount || 1,
  });

  v3Shape._v4 = {
    practiceId,
    practiceSlug: practice.slug,
    practiceName: practice.name,
    practicePostcode: practice.postcode,
    practiceListSize: practice.list_size,
    practiceOds: practice.ods_code,
    practiceLatitude: practice.latitude,
    practiceLongitude: practice.longitude,
    practiceAdminDistrict: practice.admin_district,
    practiceOnlineConsultTool: practice.online_consult_tool,
    setupCompletedAt: practice.setup_completed_at,
    demandSettings: settings?.demand_settings || null,
    userId: user.id,
    userEmail: user.email,
    // Forename + surname split out — used by the auto-link suggestion to
    // match the user's surname against clinician records on this practice.
    userFirstName: myProfile?.first_name || null,
    userLastName: myProfile?.last_name || null,
    // Display name for noticeboard posts, audit log, etc. Priority:
    //   1. Linked clinician's name (most accurate — that's their identity in
    //      the practice context)
    //   2. Account profile name (if set during sign-up)
    //   3. Email local part with dots/underscores tidied up
    userName: myClinician?.name
      || myProfile?.name
      || (user.email ? user.email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'User'),
    myRole,
    isPlatformAdmin,
    linkedClinicianId: myClinician?.id || null,
    linkedClinicianName: myClinician?.name || null,
    // Did the user (or an admin) mark them as non-clinical at this practice?
    // Used to suppress the "Is this you?" banner and the "Not linked"
    // warning on the Users tab. Distinct from "doesn't have a clinician
    // record yet" — non-clinical staff legitimately won't ever have one.
    markedNonClinical: !!myMembership?.marked_non_clinical,
    practices: (memberships || []).map(m => ({
      id: m.practices?.id,
      slug: m.practices?.slug,
      name: m.practices?.name,
      role: m.role,
    })).filter(p => p.id),
  };

  const tEnd = Date.now();
  const serverTimings = {
    setup: tSetup - t0,
    queries: tQueries - tSetup,
    shape: tEnd - tQueries,
    total: tEnd - t0,
    coldStart: isCold,
    region: process.env.VERCEL_REGION || 'local',
  };

  return <DashboardClient
    initialData={v3Shape}
    initialPracticeId={practiceId}
    serverTimings={serverTimings}
    sectionStatuses={sectionStatuses}
    practiceManagementPath={`/v4/practice/${practice.slug}`}
  />;
}
