// /v4/admin/users — search and list every user on the platform.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import AdminNav from '../AdminNav';
import UserSearch from './UserSearch';
import UserListTable from './UserListTable';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({ searchParams }) {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) redirect('/v4/dashboard');

  const search = searchParams?.q || '';
  const { data: users, error } = await supabase.rpc('admin_list_users', {
    search_query: search || null,
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <AdminNav active="users" />

        <div style={{ marginBottom: 4 }}>
          <UserSearch initialSearch={search} />
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 14, borderRadius: 8, marginTop: 18, fontSize: 14 }}>
            {error.message}
          </div>
        )}

        {/* UserListTable handles stats, filter chips, sort, orphan flag.
            Server still runs the search query (preserves ?q= URL flow) and
            passes the rows down for client-side enrichment. */}
        <UserListTable users={users || []} />

        <div style={{
          marginTop: 36,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12,
          color: '#64748b',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <span>GPDash · Platform admin</span>
          <span>Only platform admins see this section.</span>
        </div>
      </div>
    </div>
  );
}
