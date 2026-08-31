// /v4/dashboard — protected page, requires login.
// Shows the signed-in user's practices and gives them a way to sign out.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import SignOutButton from './SignOutButton';
import AcceptInviteButton from './AcceptInviteButton';
import BrandHeader from '../_lib/BrandHeader';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  if (!supabase) {
    return (
      <div style={{ padding: 32, maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, color: 'white', marginBottom: 12 }}>Configuration error</h1>
        <p className="text-body-sm text-slate-400">Supabase environment variables are not set.</p>
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
    .select('role, joined_at, practices ( id, name, slug, ods_code )')
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

  // Quality of life: if the user has exactly one practice and no pending
  // invites, skip the picker and go straight to the dashboard. They can
  // still get back here via the 'Switch practice' link in the dashboard footer.
  if (memberships?.length === 1 && (!pendingInvites || pendingInvites.length === 0)) {
    redirect(`/p/${memberships[0].practices.slug || memberships[0].practices.id}`);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>

      {/* Brand strip — same on every v4 page so users always know they're
          in GPDash and can click back to /v4 to switch context. */}
      <div className="mb-7">
        <BrandHeader />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 24, fontWeight: 600, color: 'white' }}>
            Your dashboard
          </h1>
          <p className="text-body-sm text-slate-400 mt-1">
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
              borderRadius: 'var(--r-md)',
              marginBottom: 8,
            }}>
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium text-slate-200">{inv.practice_name}</div>
                  <div className="text-meta text-slate-300 mt-1">
                    Invited by <strong>{inv.inviter_name}</strong> as <span className="text-amber-400 font-semibold">{inv.role}</span>
                  </div>
                  <div className="text-caption text-slate-400 mt-1">
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
        <Field label="User ID"><code className="text-caption text-slate-400">{user.id}</code></Field>
        <Field label="Joined">{profile?.created_at ? new Date(profile.created_at).toLocaleString('en-GB') : '—'}</Field>
      </Card>

      {/* Practices card */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Your practices</SectionTitle>
          {memberships && memberships.length > 0 && (
            <Link href="/v4/onboarding/create-practice" style={{ fontSize: 12, color: '#34d399', textDecoration: 'none' }}>
              + New practice
            </Link>
          )}
        </div>
        {!memberships || memberships.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-body-sm text-slate-400 mb-4">
              You're not a member of any practice yet.
            </p>
            <Link href="/v4/onboarding/create-practice" style={{
              display: 'inline-block',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: 'white',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: 'var(--r-md)',
              textDecoration: 'none',
            }}>Set up your practice</Link>
          </div>
        ) : (
          memberships.map((m) => (
            <Link
              key={m.practices.id}
              href={`/p/${m.practices.slug || m.practices.id}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 'var(--r-md)',
                marginBottom: 8,
                textDecoration: 'none',
              }}
            >
              <div>
                <div className="text-body font-medium text-slate-200">{m.practices.name}</div>
                {m.practices.ods_code && (
                  <div className="text-caption text-slate-400 mt-0.5">{m.practices.ods_code}</div>
                )}
              </div>
              <span style={{
                fontSize: 11,
                padding: '3px 10px',
                background: 'rgba(16,185,129,0.15)',
                color: '#34d399',
                borderRadius: 'var(--r-pill)',
                fontWeight: 600,
              }}>{m.role}</span>
            </Link>
          ))
        )}
      </Card>

      <p className="text-slate-400 text-caption mt-6 text-center">
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
      borderRadius: 'var(--r-lg)',
      padding: 24,
      marginBottom: 16,
    }}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontFamily: "var(--font-heading)",
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
      <span className="text-body-sm text-slate-400">{label}</span>
      <span className="text-body-sm text-slate-300">{children}</span>
    </div>
  );
}
