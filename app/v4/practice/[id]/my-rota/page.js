import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { loadPracticeData, adaptToV3Shape } from '@/lib/v4-data';
import MyRotaWrapper from './MyRotaWrapper';

export const dynamic = 'force-dynamic';

export default async function MyRotaPage({ params }) {
  const { id: practiceId } = params;
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const v4Data = await loadPracticeData(supabase, practiceId);
  if (!v4Data?.practice) notFound();
  const v3Data = adaptToV3Shape(v4Data);

  // Load all rota notes for clinicians of this practice
  const clinicianIds = v4Data.clinicians.map(c => c.id);
  const { data: allNotes } = clinicianIds.length > 0
    ? await supabase.from('rota_notes')
        .select('clinician_id, date, note')
        .in('clinician_id', clinicianIds)
    : { data: [] };

  // Re-shape to v3: data.rotaNotes[clinicianId][isoDate] = noteText
  const rotaNotes = {};
  for (const n of allNotes || []) {
    if (!rotaNotes[n.clinician_id]) rotaNotes[n.clinician_id] = {};
    rotaNotes[n.clinician_id][n.date] = n.note;
  }
  v3Data.rotaNotes = rotaNotes;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600, color: 'white', marginBottom: 16 }}>My Rota</h1>
        <MyRotaWrapper data={v3Data} huddleData={v4Data.huddleCsvData} />
      </div>
    </div>
  );
}
