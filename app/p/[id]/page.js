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
    supabase.from('practice_settings').select('huddle_settings, buddy_settings, room_allocation, closed_days, teamnet_url, extras').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('huddle_csv_data').select('data, updated_at').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('buddy_allocations').select('date, allocations').eq('practice_id', practiceId).gte('date', cutoffStr),
    supabase.from('rota_notes').select('clinician_id, date, note, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId),
    supabase.from('practice_users').select('role, practices(id, name, slug)').eq('user_id', user.id),
    // Platform admin flag — filter by id because owners/admins see other
    // members' profiles too via RLS.
    supabase.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle(),
    // Role for THIS practice specifically — filter by user_id because
    // owners/admins can see every membership row in the practice via RLS.
    supabase.from('practice_users').select('role').eq('practice_id', practiceId).eq('user_id', user.id).maybeSingle(),
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

  v3Shape._v4 = {
    practiceId,
    practiceSlug: practice.slug,
    practiceName: practice.name,
    userId: user.id,
    userEmail: user.email,
    myRole,
    isPlatformAdmin,
    linkedClinicianId: myClinician?.id || null,
    linkedClinicianName: myClinician?.name || null,
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

  return <DashboardClient initialData={v3Shape} initialPracticeId={practiceId} serverTimings={serverTimings} />;
}
