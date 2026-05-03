// /v4/practice/[id]/team-rota — fully ported TeamRota with real persistence.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { loadPracticeData, adaptToV3Shape } from '@/lib/v4-data';
import TeamRotaV4 from './TeamRotaV4';

export const dynamic = 'force-dynamic';

export default async function TeamRotaPage({ params }) {
  const { id: practiceId } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const v4Data = await loadPracticeData(supabase, practiceId);
  if (!v4Data?.practice) notFound();

  const v3Data = adaptToV3Shape(v4Data);

  // Check role — only admins/owners can edit (matches RLS)
  const { data: membership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const canEdit = membership?.role === 'owner' || membership?.role === 'admin';

  return (
    <div style={{ padding: 24 }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'Outfit', sans-serif",
          fontSize: 22, fontWeight: 600, color: 'white',
          marginBottom: 6,
        }}>Working patterns</h1>
        <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
          Click any cell to toggle. Changes persist immediately.
        </p>

        {!canEdit && (
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            color: '#fcd34d',
            marginBottom: 16,
          }}>
            ⚠ You're not an admin/owner of this practice — clicks won't persist.
          </div>
        )}

        <TeamRotaV4 data={v3Data} practiceId={practiceId} />
      </div>
    </div>
  );
}
