// /v4/dashboard — protected page, requires login.
// Shows the signed-in user's practices and gives them a way to sign out.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import SignOutButton from './SignOutButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const cookieStore = await cookies();
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

  // Fetch practices the user belongs to (RLS handles isolation)
  const { data: memberships } = await supabase
    .from('practice_users')
    .select('role, joined_at, practices ( id, name, ods_code )')
    .order('joined_at', { ascending: false });

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
        <SectionTitle>Your practices</SectionTitle>
        {!memberships || memberships.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12 }}>
              You're not a member of any practice yet.
            </p>
            <p style={{ fontSize: 12, color: '#64748b' }}>
              Practice creation flow coming next.
            </p>
          </div>
        ) : (
          memberships.map((m) => (
            <div key={m.practices.id} style={{
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 8,
              marginBottom: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
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
            </div>
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
