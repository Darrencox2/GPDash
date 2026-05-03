// /v4/practice/[id] — practice admin: members + pending invites + invite form.
// (Distinct from /dashboard which is the actual app shell.)

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import InviteForm from './InviteForm';
import ClinicianLinker from './ClinicianLinker';

export const dynamic = 'force-dynamic';

export default async function PracticeAdminPage({ params }) {
  const { id: practiceId } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const { data: practice } = await supabase
    .from('practices')
    .select('id, name, ods_code, region, created_at')
    .eq('id', practiceId)
    .maybeSingle();
  if (!practice) notFound();

  // Caller's role
  const { data: myMembership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!myMembership) notFound();

  // Members (via RPC that joins to auth.users to get emails)
  const { data: members } = await supabase
    .rpc('list_practice_members', { target_practice_id: practiceId });

  // Pending invites
  const { data: invites } = await supabase
    .from('practice_invites')
    .select('id, email, role, created_at, expires_at')
    .eq('practice_id', practiceId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  // Find the clinician (if any) currently linked to me
  const { data: myClinician } = await supabase
    .from('clinicians')
    .select('id, name, initials, role')
    .eq('practice_id', practiceId)
    .eq('linked_user_id', user.id)
    .maybeSingle();

  // All active clinicians for the linker dropdown
  const { data: allClinicians } = await supabase
    .from('clinicians')
    .select('id, name, initials, role, linked_user_id')
    .eq('practice_id', practiceId)
    .eq('status', 'active')
    .order('name');

  const canManage = myMembership.role === 'owner' || myMembership.role === 'admin';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href={`/dashboard?practice=${practiceId}`} style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
          ← Back to dashboard
        </Link>
        <h1 style={{
          fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600,
          color: 'white', marginTop: 8, marginBottom: 6,
        }}>{practice.name}</h1>
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, fontSize: 12, color: '#94a3b8' }}>
          {practice.ods_code && <span>ODS: {practice.ods_code}</span>}
          {practice.region && <span>{practice.region}</span>}
          <span style={{
            padding: '2px 8px', background: 'rgba(16,185,129,0.15)',
            color: '#34d399', borderRadius: 999, fontWeight: 600, fontSize: 11,
          }}>You: {myMembership.role}</span>
        </div>

        <Card title="Team members">
          {!members || members.length === 0 ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>No members yet.</p>
          ) : (
            members.map(m => (
              <div key={m.user_id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>{m.email || '—'}</div>
                  {m.name && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.name}</div>}
                </div>
                <span style={{
                  fontSize: 11, padding: '3px 10px',
                  background: 'rgba(99,102,241,0.15)',
                  color: '#a5b4fc',
                  borderRadius: 999, fontWeight: 600,
                }}>{m.role}</span>
              </div>
            ))
          )}
        </Card>

        {invites && invites.length > 0 && (
          <Card title="Pending invites">
            {invites.map(inv => (
              <div key={inv.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div>
                  <div style={{ fontSize: 13, color: '#e2e8f0' }}>{inv.email}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    Invited as {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}

        <Card title="Your clinician record">
          {myClinician ? (
            <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 12 }}>
              You're linked to <strong style={{ color: 'white' }}>{myClinician.name}</strong>
              {myClinician.initials && <span style={{ color: '#64748b' }}> ({myClinician.initials})</span>}
              {myClinician.role && <span style={{ color: '#64748b' }}> · {myClinician.role}</span>}.
            </p>
          ) : null}
          <ClinicianLinker
            practiceId={practiceId}
            currentLinkedClinicianId={myClinician?.id || null}
            allClinicians={allClinicians || []}
            currentUserId={user.id}
          />
        </Card>

        {canManage && (
          <Card title="Invite a member">
            <InviteForm practiceId={practiceId} canMakeOwner={myMembership.role === 'owner'} />
          </Card>
        )}
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      background: 'rgba(15,23,42,0.7)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    }}>
      <h2 style={{
        fontFamily: "'Outfit', sans-serif", fontSize: 13, fontWeight: 500,
        color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1,
        marginBottom: 12,
      }}>{title}</h2>
      {children}
    </div>
  );
}
