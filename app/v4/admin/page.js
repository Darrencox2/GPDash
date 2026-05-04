// /v4/admin — platform admin landing page. Lists every practice on the
// platform with member counts and quick links. Only accessible if the
// signed-in user has profiles.is_platform_admin = true.
//
// This is for support and oversight, not day-to-day practice work — for
// that, click into a practice and use the normal /p/[slug] dashboard,
// which RLS lets the platform admin into via the is_practice_admin()
// override.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import AdminNav from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminPracticesPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Gate: must be platform admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) redirect('/v4/dashboard');

  const { data: practices, error } = await supabase.rpc('admin_list_practices');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <AdminNav active="practices" />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            {error.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <Stat label="Practices" value={practices?.length || 0} />
          <Stat label="Total members" value={(practices || []).reduce((s, p) => s + Number(p.member_count || 0), 0)} />
          <Stat label="Total clinicians" value={(practices || []).reduce((s, p) => s + Number(p.clinician_count || 0), 0)} />
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left' }}>
                <th style={th}>Name</th>
                <th style={th}>Slug</th>
                <th style={th}>ODS</th>
                <th style={th}>Region</th>
                <th style={{ ...th, textAlign: 'right' }}>Members</th>
                <th style={{ ...th, textAlign: 'right' }}>Clinicians</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(practices || []).length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', padding: 32, color: '#64748b' }}>No practices yet.</td></tr>
              )}
              {(practices || []).map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...td, color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ ...td, color: '#94a3b8', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{p.slug}</td>
                  <td style={{ ...td, color: '#94a3b8', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{p.ods_code || '—'}</td>
                  <td style={{ ...td, color: '#94a3b8' }}>{p.region || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>{p.member_count}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#cbd5e1' }}>{p.clinician_count}</td>
                  <td style={{ ...td, color: '#64748b', fontSize: 12 }}>
                    {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <Link href={`/p/${p.slug}`} style={linkStyle}>Open →</Link>
                    <Link href={`/v4/practice/${p.slug}`} style={{ ...linkStyle, marginLeft: 12 }}>Manage</Link>
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
const linkStyle = { color: '#22d3ee', textDecoration: 'none', fontSize: 12 };

function Stat({ label, value }) {
  return (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#e2e8f0', fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </div>
  );
}
