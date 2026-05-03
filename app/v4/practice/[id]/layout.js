// Layout for /v4/practice/[id]/* — wraps everything in a sidebar so all
// pages within a practice get the nav for free.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import V4Sidebar from '../../_lib/V4Sidebar';

export const dynamic = 'force-dynamic';

export default async function PracticeLayout({ children, params }) {
  const { id: practiceId } = params;
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return children;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Verify membership and get practice name for sidebar
  const { data: practice } = await supabase
    .from('practices')
    .select('id, name')
    .eq('id', practiceId)
    .maybeSingle();
  if (!practice) notFound();

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
    }}>
      <V4Sidebar practiceId={practiceId} practiceName={practice.name} />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
