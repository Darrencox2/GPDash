// /v4/practice/[id]/whos-in — server-renders the v3 WhosInOut component
// against live Postgres data via the v4 data layer.
//
// This is the first feature port. Pattern:
//   1. Server component fetches data from Postgres (RLS-aware)
//   2. adaptToV3Shape() reshapes it to look like v3's data object
//   3. Pass it into a client wrapper that hosts the existing v3 component
//
// Once this works, every other feature follows the same pattern.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { loadPracticeData, adaptToV3Shape } from '@/lib/v4-data';
import WhosInOutWrapper from './WhosInOutWrapper';

export const dynamic = 'force-dynamic';

export default async function WhosInPage({ params }) {
  const { id: practiceId } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const v4Data = await loadPracticeData(supabase, practiceId);
  if (!v4Data?.practice) notFound();

  // Reshape to v3-style data object so the existing v3 component can consume it
  const v3Data = adaptToV3Shape(v4Data);

  // Huddle CSV data passed separately (matches v3 component prop signature)
  const huddleData = v4Data.huddleCsvData || null;

  return (
    <div style={{ minHeight: '100vh', padding: 16 }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Link href={`/v4/practice/${practiceId}`} style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
          ← {v4Data.practice.name}
        </Link>
        <h1 style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 22,
          fontWeight: 600,
          color: 'white',
          marginTop: 8,
          marginBottom: 6,
        }}>
          Who's in / out
        </h1>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 24 }}>
          v4 preview — reading from Postgres via the v4 data layer
        </p>

        <WhosInOutWrapper data={v3Data} huddleData={huddleData} />
      </div>
    </div>
  );
}
