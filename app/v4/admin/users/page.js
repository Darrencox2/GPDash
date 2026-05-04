// /v4/admin/users — search and list every user on the platform.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import AdminNav from '../AdminNav';
import UserSearch from './UserSearch';

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
      padding: 32,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminNav active="users" />

        <UserSearch initialSearch={search} />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, marginTop: 16 }}>
            {error.message}
          </div>
        )}

        <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left' }}>
                <th style={th}>Email</th>
                <th style={th}>Name</th>
                <th style={th}>Role</th>
                <th style={{ ...th, textAlign: 'right' }}>Practices</th>
                <th style={th}>Created</th>
                <th style={th}>Last sign-in</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(users || []).length === 0 && (
                <tr><td colSpan={7} style={{ ...td, textAlign: 'center', padding: 32, color: '#64748b' }}>
                  {search ? `No users match "${search}".` : 'No users yet.'}
                </td></tr>
              )}
              {(users || []).map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...td, color: '#e2e8f0' }}>{u.email}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{u.name || '—'}</td>
                  <td style={td}>
                    {u.is_platform_admin ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(34,211,238,0.15)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 999 }}>Platform admin</span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>{u.membership_count}</td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>
                    {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>
                    {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never'}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/v4/admin/users/${u.id}`} style={{ color: '#22d3ee', textDecoration: 'none', fontSize: 12 }}>Open →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th = { padding: '10px 14px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b' };
const td = { padding: '10px 14px', fontSize: 13 };
