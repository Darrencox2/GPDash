// /v4/admin/users/[id] — user detail. Shows email + identity, all
// practice memberships, and admin actions: edit profile, manage
// memberships, delete user, send password reset.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import AdminNav from '../../AdminNav';
import PasswordResetButton from './PasswordResetButton';
import UserActions from './UserActions';
import GenerateLinkButton from './GenerateLinkButton';
import SuspensionCard from './SuspensionCard';
import UserActivityTimeline from './UserActivityTimeline';
import ImpersonateButton from './ImpersonateButton';
import CopyableValue from '@/components/CopyableValue';

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

  // Pull every practice for the membership picker.
  const { data: practiceRows } = await supabase.rpc('admin_list_practices');
  const allPractices = (practiceRows || []).map(p => ({ id: p.id, name: p.name, slug: p.slug }));

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <AdminNav active="users" />

        <Link href="/v4/admin/users" style={{ fontSize: 13, color: '#cbd5e1', textDecoration: 'none', display: 'inline-block', marginBottom: 18 }}>
          ← All users
        </Link>

        {/* Identity (read-only — name editing now handled by UserActions) */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600, color: 'white', marginBottom: 6, letterSpacing: -0.3 }}>
                <CopyableValue value={details.email} title="Copy email">{details.email}</CopyableValue>
              </h2>
              {details.name && <div style={{ color: '#cbd5e1', fontSize: 14 }}>{details.name}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {details.suspended_at && (
                <span style={{ fontSize: 12, padding: '4px 12px', background: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 999, fontWeight: 600 }}>
                  Suspended
                </span>
              )}
              {details.is_platform_admin && (
                <span style={{ fontSize: 12, padding: '4px 12px', background: 'rgba(34,211,238,0.15)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.3)', borderRadius: 999, fontWeight: 600 }}>
                  Platform admin
                </span>
              )}
              {!details.email_confirmed_at && (
                <span style={{ fontSize: 12, padding: '4px 12px', background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 999 }}>
                  Email unconfirmed
                </span>
              )}
            </div>
          </div>

          <Row label="User ID">
            <CopyableValue value={details.id} title="Copy user ID">
              <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{details.id}</span>
            </CopyableValue>
          </Row>
          <Row label="Created">{new Date(details.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Row>
          <Row label="Last sign-in">{details.last_sign_in_at ? new Date(details.last_sign_in_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never'}</Row>
        </div>

        {/* All admin actions: profile editing, membership management, delete user */}
        <UserActions user={details} allPractices={allPractices} />

        {/* Activity timeline — recent audit + auth events for this user
            across every practice they touch. Cross-practice support
            view: "what has this person actually been doing?" */}
        <div style={card}>
          <h3 style={cardHeader}>Recent activity</h3>
          <UserActivityTimeline userId={details.id} />
        </div>

        {/* Suspend / unsuspend — less drastic than delete. Reversible. */}
        <div style={card}>
          <h3 style={cardHeader}>Suspension</h3>
          <SuspensionCard user={details} />
        </div>

        {/* Impersonation — sign in as this user for support / debugging.
            Powerful capability; every session is logged with reason +
            time-limited to 1 hour. See ImpersonateButton for the
            list of refusal cases (self / suspended / other admin). */}
        <div style={card}>
          <h3 style={cardHeader}>Impersonate</h3>
          <ImpersonateButton user={details} currentUserIsTarget={user.id === details.id} />
        </div>

        {/* Sign-in / confirmation link generation. Useful for users
            stuck on email_unconfirmed, or anyone who can't access their
            email but the admin can verify identity by other means. */}
        <div style={card}>
          <h3 style={cardHeader}>Sign-in & email links</h3>
          <GenerateLinkButton email={details.email} emailUnconfirmed={!details.email_confirmed_at} />
        </div>

        {/* Password reset stays separate — it's a one-shot transactional action */}
        <div style={card}>
          <h3 style={cardHeader}>Password reset</h3>
          <PasswordResetButton email={details.email} />
        </div>

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
          <Link href="/v4/admin/users" style={{ color: '#64748b', textDecoration: 'none' }}>← All users</Link>
        </div>
      </div>
    </div>
  );
}

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 22, marginBottom: 18 };
const cardHeader = { fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 14, fontFamily: "'Outfit', sans-serif" };

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', gap: 12 }}>
      <span style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</span>
      <span style={{ color: '#e2e8f0', fontSize: 14 }}>{children}</span>
    </div>
  );
}
