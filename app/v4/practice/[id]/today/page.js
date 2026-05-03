import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { loadPracticeData, adaptToV3Shape } from '@/lib/v4-data';
import TodayWrapper from './TodayWrapper';

export const dynamic = 'force-dynamic';

export default async function TodayPage({ params }) {
  const { id: practiceId } = params;
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const v4Data = await loadPracticeData(supabase, practiceId);
  if (!v4Data?.practice) notFound();
  const v3Data = adaptToV3Shape(v4Data);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600, color: 'white', marginBottom: 16 }}>Today</h1>
        <TodayWrapper data={v3Data} huddleData={v4Data.huddleCsvData} />
      </div>
    </div>
  );
}
