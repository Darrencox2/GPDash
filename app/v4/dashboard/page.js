// /v4/dashboard — protected page, requires login.
// Shows the signed-in user's practices and gives them a way to sign out.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import SignOutButton from './SignOutButton';
import AcceptInviteButton from './AcceptInviteButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = createClient(cookieStore);

  if (!supabase) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, color: 'white', marginBottom: 12 }}>Configuration error</h1>
        <p style={{ fontSize: 13, color: '#94a3b8' }}>Supabase environment variables are not set.</p>
      </div>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Fetch the user's profile (auto-created by the trigger)
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email, created_at')
    .eq('id', user.id)
    .single();

  // Fetch practices the user belongs to (RLS allows seeing other members of
  // the same practice, so we explicitly filter to only the current user's rows)
  const { data: memberships } = await supabase
    .from('practice_users')
    .select('role, joined_at, practices ( id, name, ods_code )')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: false });

  // Fetch any pending invites addressed to this user's email.
  // Wrapped to be tolerant of missing migration 003/004 — if the function or
  // table doesn't exist we just show no pending invites rather than crashing.
  let pendingInvites = null;
  try {
    const { data, error: invErr } = await supabase.rpc('get_my_pending_invites');
    if (!invErr) pendingInvites = data;
  } catch {
    // Silent fallback — get_my_pending_invites function not yet migrated
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'white' }}>
            GPDash v4
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
            Signed in as {profile?.name || profile?.email || user.email}
          </p>
        </div>
        <SignOutButton />
      </div>

      {/* Pending invites */}
      {pendingInvites && pendingInvites.length > 0 && (
        <Card>
          <SectionTitle>Pending invites</SectionTitle>
          {pendingInvites.map((inv) => (
            <div key={inv.invite_id} style={{
              padding: '14px 16px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 8,
              marginBottom: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>{inv.practice_name}</div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                    Invited by <strong>{inv.inviter_name}</strong> as <span style={{ color: '#fbbf24', fontWeight: 600 }}>{inv.role}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    Sent to: {inv.invitee_email}
                  </div>
                </div>
                <AcceptInviteButton inviteId={inv.invite_id} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Profile card */}
      <Card>
        <SectionTitle>Your account</SectionTitle>
        <Field label="Name">{profile?.name || '—'}</Field>
        <Field label="Email">{profile?.email || user.email}</Field>
        <Field label="User ID"><code style={{ fontSize: 11, color: '#94a3b8' }}>{user.id}</code></Field>
        <Field label="Joined">{profile?.created_at ? new Date(profile.created_at).toLocaleString('en-GB') : '—'}</Field>
      </Card>

      {/* Practices card */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <SectionTitle>Your practices</SectionTitle>
          {memberships && memberships.length > 0 && (
            <Link href="/v4/onboarding/create-practice" style={{ fontSize: 12, color: '#34d399', textDecoration: 'none' }}>
              + New practice
            </Link>
          )}
        </div>
        {!memberships || memberships.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              You're not a member of any practice yet.
            </p>
            <Link href="/v4/onboarding/create-practice" style={{
              display: 'inline-block',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'white',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: 8,
              textDecoration: 'none',
            }}>Set up your practice</Link>
          </div>
        ) : (
          memberships.map((m) => (
            <Link
              key={m.practices.id}
              href={`/v4/practice/${m.practices.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 8,
                marginBottom: 8,
                textDecoration: 'none',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f0' }}>{m.practices.name}</div>
                {m.practices.ods_code && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.practices.ods_code}</div>
                )}
              </div>
              <span style={{
                fontSize: 11,
                padding: '3px 10px',
                background: 'rgba(16,185,129,0.15)',
                color: '#34d399',
                borderRadius: 999,
                fontWeight: 600,
              }}>{m.role}</span>
            </Link>
          ))
        )}
      </Card>

      <p style={{ color: '#64748b', fontSize: 11, marginTop: 24, textAlign: 'center' }}>
        v4-rebuild branch · this is a preview environment
      </p>
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: 24,
      marginBottom: 16,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontFamily: "'Outfit', sans-serif",
      fontSize: 14,
      fontWeight: 500,
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 16,
    }}>{children}</h2>
  );
}

function Field({ label, children }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: 13, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#cbd5e1' }}>{children}</span>
    </div>
  );
}
