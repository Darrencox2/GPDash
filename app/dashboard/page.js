// /dashboard — server component shell that prefetches everything before
// the page is shipped to the browser. This means first paint shows a
// fully-populated dashboard, no loading spinner, no extra round-trip.
//
// The actual UI lives in DashboardClient.js (client component). This
// file's job is just to: auth, fetch data, redirect if needed, hand
// off to the client.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { adaptToV3Shape } from '@/lib/v4-data';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }) {
  const practiceId = searchParams?.practice;
  if (!practiceId) {
    redirect('/v4/dashboard');
  }

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) {
    return <div style={{ padding: 32, color: 'white', background: '#0f172a', minHeight: '100vh' }}>Configuration error.</div>;
  }

  // Allocation cutoff
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // Auth + all data queries in ONE Promise.all
  const [
    { data: { user } },
    { data: practice },
    { data: clinicians },
    { data: workingPatterns },
    { data: absences },
    { data: settings },
    { data: huddleCsv },
    { data: allocations },
    { data: notes },
    { data: memberships },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('practices').select('id, name, ods_code, region').eq('id', practiceId).maybeSingle(),
    supabase.from('clinicians').select('id, name, title, initials, role, group_id, status, sessions, buddy_cover, can_provide_cover, aliases, linked_user_id').eq('practice_id', practiceId).order('name'),
    supabase.from('working_patterns').select('id, clinician_id, effective_from, effective_to, pattern, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId).is('effective_to', null),
    supabase.from('absences').select('id, clinician_id, start_date, end_date, reason, notes, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId),
    supabase.from('practice_settings').select('huddle_settings, buddy_settings, room_allocation, closed_days, teamnet_url, extras').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('huddle_csv_data').select('data, updated_at').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('buddy_allocations').select('date, allocations').eq('practice_id', practiceId).gte('date', cutoffStr),
    supabase.from('rota_notes').select('clinician_id, date, note, clinicians!inner(practice_id)').eq('clinicians.practice_id', practiceId),
    supabase.from('practice_users').select('role, practices(id, name)'),
  ]);

  if (!user) redirect('/v4/login');
  if (!practice) {
    return <div style={{ padding: 32, color: 'white', background: '#0f172a', minHeight: '100vh' }}>Practice not found or access denied.</div>;
  }

  // Adapt v4 → v3 shape
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

  // Inline allocations + notes
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
  v3Shape._v4 = {
    practiceId,
    practiceName: practice.name,
    userId: user.id,
    userEmail: user.email,
    linkedClinicianId: myClinician?.id || null,
    linkedClinicianName: myClinician?.name || null,
    practices: (memberships || []).map(m => ({
      id: m.practices?.id,
      name: m.practices?.name,
      role: m.role,
    })).filter(p => p.id),
  };

  return <DashboardClient initialData={v3Shape} initialPracticeId={practiceId} />;
}
