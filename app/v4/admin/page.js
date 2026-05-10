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
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <AdminNav active="practices" />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 14, borderRadius: 8, marginBottom: 18, fontSize: 14 }}>
            {error.message}
          </div>
        )}

        <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
          <Stat label="Practices" value={practices?.length || 0} />
          <Stat label="Total members" value={(practices || []).reduce((s, p) => s + Number(p.member_count || 0), 0)} />
          <Stat label="Total clinicians" value={(practices || []).reduce((s, p) => s + Number(p.clinician_count || 0), 0)} />
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
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
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>No practices yet.</td></tr>
              )}
              {(practices || []).map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...td, color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ ...td, color: '#cbd5e1', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{p.slug}</td>
                  <td style={{ ...td, color: '#cbd5e1', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{p.ods_code || '—'}</td>
                  <td style={{ ...td, color: '#cbd5e1' }}>{p.region || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#e2e8f0' }}>{p.member_count}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#e2e8f0' }}>{p.clinician_count}</td>
                  <td style={{ ...td, color: '#94a3b8', fontSize: 13 }}>
                    {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                      <Link href={`/p/${p.slug}`} style={btnPrimary} title="Open this practice's main app (Today, capacity, etc.)">Open →</Link>
                      <Link href={`/v4/admin/practices/${p.id}`} style={btnSubtle} title="Manage as platform admin">Manage</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AdminFooter />
      </div>
    </div>
  );
}

const th = { padding: '12px 16px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94a3b8' };
const td = { padding: '12px 16px', fontSize: 14 };

// Buttons used on row-action cells. Primary = the more frequent action
// ("Open the dashboard" — what platform admins do most often), Subtle =
// the secondary action ("Manage practice settings"). Both styled as
// proper buttons with padding, border, and weight rather than bare
// cyan links — easier to hit on touch and reads as a control rather
// than a hyperlink to a different document.
const btnPrimary = {
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: 'white',
  background: '#0891b2',
  border: '1px solid #0891b2',
  borderRadius: 6,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  display: 'inline-block',
};
const btnSubtle = {
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 500,
  color: '#cbd5e1',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  display: 'inline-block',
};

function Stat({ label, value }) {
  return (
    <div style={{
      flex: '1 1 200px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: '#e2e8f0', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// Tiny "you are here" footer common to admin pages — gives a sense of
// completeness ("the page has an end") that's missing when the table just
// stops abruptly.
function AdminFooter() {
  return (
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
  );
}
