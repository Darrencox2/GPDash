// /v4/practice/[id] — practice admin: members + pending invites + invite form.
// (Distinct from /dashboard which is the actual app shell.)

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { resolvePracticeIdentifier } from '@/lib/v4-data';
import InviteForm from './InviteForm';
import ClinicianLinker from './ClinicianLinker';
import SlugEditor from './SlugEditor';

export const dynamic = 'force-dynamic';

export default async function PracticeAdminPage({ params }) {
  const { id: identifier } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div style={{ padding: 32, color: 'white' }}>Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  // Resolve identifier (slug | ods_code | uuid) to a practice row
  const practice = await resolvePracticeIdentifier(supabase, identifier);
  if (!practice) notFound();
  const practiceId = practice.id;

  // Canonicalise URL to slug form for shareable/bookmark consistency
  if (identifier !== practice.slug) {
    redirect(`/v4/practice/${practice.slug}`);
  }

  // Caller's role in THIS practice (may be null if platform admin isn't a member)
  const { data: myMembership } = await supabase
    .from('practice_users')
    .select('role')
    .eq('practice_id', practiceId)
    .eq('user_id', user.id)
    .maybeSingle();

  // Platform admin override — site owner can manage any practice
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle();
  const isPlatformAdmin = !!myProfile?.is_platform_admin;

  // Permission gate: must be admin/owner of this practice OR platform admin
  const isAdminOrOwner = myMembership?.role === 'owner' || myMembership?.role === 'admin';
  if (!isAdminOrOwner && !isPlatformAdmin) {
    // If they're a member but not admin → bounce to dashboard. If they're
    // not a member at all → 404 (don't leak that the practice exists).
    if (myMembership) {
      redirect(`/p/${practice.slug || practiceId}`);
    } else {
      notFound();
    }
  }

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

  // All active clinicians (used for both the self-link form and finding current self-link)
  const { data: clinicians } = await supabase
    .from('clinicians')
    .select('id, name, initials, role, status, linked_user_id')
    .eq('practice_id', practiceId)
    .eq('status', 'active')
    .order('name');

  const myClinician = (clinicians || []).find(c => c.linked_user_id === user.id);

  const canManage = isAdminOrOwner || isPlatformAdmin;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link href={`/p/${practice.slug || practiceId}`} style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none' }}>
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
          }}>You: {myMembership?.role || (isPlatformAdmin ? 'platform admin' : 'guest')}</span>
        </div>

        <Card title="Practice URL">
          <SlugEditor
            practiceId={practiceId}
            currentSlug={practice.slug}
            canEdit={canManage}
          />
        </Card>

        <Card title="Your clinician record">
          <ClinicianLinker
            practiceId={practiceId}
            currentLinkedClinicianId={myClinician?.id || null}
            allClinicians={clinicians || []}
            currentUserId={user.id}
          />
        </Card>

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

        {canManage && (
          <Card title="Invite a member">
            <InviteForm practiceId={practiceId} canMakeOwner={myMembership?.role === 'owner' || isPlatformAdmin} />
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
