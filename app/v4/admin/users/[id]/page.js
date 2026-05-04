// /v4/admin/users/[id] — user detail. Shows email, memberships, and a
// button to send a password reset link.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import AdminNav from '../../AdminNav';
import PasswordResetButton from './PasswordResetButton';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailPage({ params }) {
  const { id: userId } = params;

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

  const { data: details, error } = await supabase.rpc('admin_get_user', {
    target_user_id: userId,
  });
  if (error) {
    return (
      <div style={{ padding: 32, color: '#fca5a5' }}>
        <AdminNav active="users" />
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: 16, borderRadius: 8 }}>
          {error.message}
        </div>
      </div>
    );
  }
  if (!details) notFound();

  const memberships = details.memberships || [];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <AdminNav active="users" />

        <Link href="/v4/admin/users" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
          ← All users
        </Link>

        {/* Identity */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: 'white', marginBottom: 4 }}>
                {details.email}
              </h2>
              {details.name && <div style={{ color: '#94a3b8', fontSize: 13 }}>{details.name}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {details.is_platform_admin && (
                <span style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(34,211,238,0.15)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 999 }}>
                  Platform admin
                </span>
              )}
              {!details.email_confirmed_at && (
                <span style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 999 }}>
                  Email unconfirmed
                </span>
              )}
            </div>
          </div>

          <Row label="User ID"><span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>{details.id}</span></Row>
          <Row label="Created">{new Date(details.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Row>
          <Row label="Last sign-in">{details.last_sign_in_at ? new Date(details.last_sign_in_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never'}</Row>
        </div>

        {/* Memberships */}
        <div style={card}>
          <h3 style={cardHeader}>Practice memberships ({memberships.length})</h3>
          {memberships.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>No practice memberships.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memberships.map(m => (
                <div key={m.practice_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                  <div>
                    <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 500 }}>{m.practice_name}</div>
                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                      <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{m.practice_slug}</span>
                      {' · '}joined {new Date(m.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={roleBadge(m.role)}>{m.role}</span>
                    <Link href={`/v4/practice/${m.practice_slug}`} style={{ color: '#22d3ee', fontSize: 12, textDecoration: 'none' }}>Manage →</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={card}>
          <h3 style={cardHeader}>Actions</h3>
          <PasswordResetButton email={details.email} />
        </div>
      </div>
    </div>
  );
}

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20, marginBottom: 16 };
const cardHeader = { fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 12 };

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '4px 0', gap: 12 }}>
      <span style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      <span style={{ color: '#cbd5e1', fontSize: 13 }}>{children}</span>
    </div>
  );
}

function roleBadge(role) {
  const palette = role === 'owner'
    ? { bg: 'rgba(16,185,129,0.15)', fg: '#34d399', border: 'rgba(16,185,129,0.3)' }
    : role === 'admin'
    ? { bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d', border: 'rgba(245,158,11,0.3)' }
    : { bg: 'rgba(148,163,184,0.1)', fg: '#94a3b8', border: 'rgba(148,163,184,0.2)' };
  return { fontSize: 11, padding: '3px 10px', background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}`, borderRadius: 999, fontWeight: 500 };
}
