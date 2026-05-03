// /v4/practice/[id] — single practice view: members, pending invites, invite form.
// Server component for the data fetch; client component for the invite form.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import InviteForm from './InviteForm';

export const dynamic = 'force-dynamic';

export default async function PracticeDetailPage({ params }) {
  const { id: practiceId } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Fetch the practice (RLS ensures we can only see practices we're a member of)
  const { data: practice } = await supabase
    .from('practices')
    .select('id, name, ods_code, region, created_at')
    .eq('id', practiceId)
    .maybeSingle();

  if (!practice) notFound();

  // Fetch caller's role in this practice
  const { data: myMembership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const myRole = myMembership?.role;
  const canInvite = myRole === 'owner' || myRole === 'admin';

  // Fetch members via the helper function (avoids needing wide policies on profiles)
  const { data: members, error: membersErr } = await supabase
    .rpc('list_practice_members', { target_practice_id: practiceId });

  // Fetch pending invites (only visible to admins/owners via RLS)
  const { data: pendingInvites } = canInvite ? await supabase
    .from('practice_invites')
    .select('id, email, role, invited_at, expires_at')
    .eq('practice_id', practiceId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('invited_at', { ascending: false }) : { data: null };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Link href="/v4/dashboard" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
          ← Dashboard
        </Link>
        <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600, color: 'white', marginTop: 8 }}>
          {practice.name}
        </h1>
        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: '#94a3b8' }}>
          {practice.ods_code && <span>{practice.ods_code}</span>}
          {practice.region && <span>{practice.region}</span>}
          <span style={{
            padding: '2px 8px',
            background: 'rgba(16,185,129,0.15)',
            color: '#34d399',
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 11,
          }}>You: {myRole}</span>
          <Link href={`/v4/practice/${practiceId}/data`} style={{
            marginLeft: 'auto',
            color: '#a78bfa',
            textDecoration: 'none',
            fontSize: 12,
            fontWeight: 500,
          }}>View data →</Link>
        </div>
      </div>

      {/* Members */}
      <Card>
        <SectionTitle>Members ({members?.length || 0})</SectionTitle>
        {membersErr && (
          <div style={{ fontSize: 12, color: '#fca5a5', padding: 8 }}>
            Error: {membersErr.message}
          </div>
        )}
        {members?.map((m) => (
          <div key={m.user_id} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            marginBottom: 6,
          }}>
            <div>
              <div style={{ fontSize: 14, color: '#e2e8f0' }}>{m.name || m.email}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.email}</div>
            </div>
            <span style={{
              fontSize: 11,
              padding: '3px 10px',
              background: m.user_id === user.id ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.06)',
              color: m.user_id === user.id ? '#34d399' : '#94a3b8',
              borderRadius: 999,
              fontWeight: 600,
            }}>{m.role}</span>
          </div>
        ))}
      </Card>

      {/* Invite form + pending invites (admins/owners only) */}
      {canInvite && (
        <>
          <Card>
            <SectionTitle>Invite a teammate</SectionTitle>
            <InviteForm practiceId={practiceId} canMakeOwner={myRole === 'owner'} />
          </Card>

          {pendingInvites && pendingInvites.length > 0 && (
            <Card>
              <SectionTitle>Pending invites ({pendingInvites.length})</SectionTitle>
              {pendingInvites.map((inv) => (
                <div key={inv.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  marginBottom: 6,
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#e2e8f0' }}>{inv.email}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Invited {new Date(inv.invited_at).toLocaleDateString('en-GB')} · expires {new Date(inv.expires_at).toLocaleDateString('en-GB')}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11,
                    padding: '3px 10px',
                    background: 'rgba(245,158,11,0.15)',
                    color: '#fbbf24',
                    borderRadius: 999,
                    fontWeight: 600,
                  }}>{inv.role}</span>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
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
      fontSize: 13,
      fontWeight: 500,
      color: '#94a3b8',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 14,
    }}>{children}</h2>
  );
}
