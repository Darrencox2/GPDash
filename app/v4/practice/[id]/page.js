// /v4/practice/[id] — practice admin: members + pending invites + invite form.
// (Distinct from /dashboard which is the actual app shell.)

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { resolvePracticeIdentifier } from '@/lib/v4-data';
import DashboardShell from '@/components/DashboardShell';
import InviteForm from './InviteForm';
import ClinicianLinker from './ClinicianLinker';
import SlugEditor from './SlugEditor';
import EmisReportCard from '@/components/EmisReportCard';
import DeletePracticeButton from './DeletePracticeButton';
import DemandUpload from './DemandUpload';

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

  // Demand settings + history summary for the upload card
  const [{ data: settingsRow }, { data: historySummary }] = await Promise.all([
    supabase.from('practice_settings').select('demand_settings').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('demand_history_summary').select('source, row_count, earliest_date, latest_date, last_uploaded_at').eq('practice_id', practiceId),
  ]);
  const demandSettings = settingsRow?.demand_settings || null;

  const canManage = isAdminOrOwner || isPlatformAdmin;

  // Build minimal data shape for the shell (sidebar role gating + footer)
  const shellData = {
    _v4: {
      practiceSlug: practice.slug,
      practiceName: practice.name,
      myRole: isPlatformAdmin ? 'owner' : (myMembership?.role || null),
      isPlatformAdmin,
    },
  };

  return (
    <DashboardShell shellData={shellData} activeSection="practice-settings">
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{
          fontFamily: "'Outfit', sans-serif", fontSize: 24, fontWeight: 600,
          color: 'white', marginBottom: 6,
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

        <Card title="Practice setup">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1' }}>
              {practice.setup_completed_at ? (
                <>
                  <span style={{ color: '#34d399' }}>✓ Complete</span>
                  {' · '}Last updated{' '}
                  <span style={{ color: '#94a3b8' }}>
                    {new Date(practice.setup_completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </>
              ) : (
                <>
                  <span style={{ color: '#fcd34d' }}>Incomplete</span>
                  {' · '}Add postcode, list size and consultation tool to enable
                  practice-specific demand predictions.
                </>
              )}
            </div>
            <Link href={`/v4/practice/${practice.slug}/setup`} style={{
              fontSize: 12, fontWeight: 500,
              color: 'white', background: '#0891b2',
              padding: '6px 14px', borderRadius: 6,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}>
              {practice.setup_completed_at ? 'Re-run setup' : 'Open setup →'}
            </Link>
          </div>
          {practice.postcode && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#94a3b8', display: 'grid', gridTemplateColumns: '120px 1fr', gap: 4 }}>
              <span style={{ color: '#64748b' }}>Postcode</span><span>{practice.postcode}</span>
              {practice.list_size && (<><span style={{ color: '#64748b' }}>List size</span><span>{practice.list_size.toLocaleString()}</span></>)}
              {practice.online_consult_tool && (<><span style={{ color: '#64748b' }}>Tool</span><span>{practice.online_consult_tool}</span></>)}
            </div>
          )}
        </Card>

        <Card title="EMIS appointment report">
          <EmisReportCard variant="inline" />
        </Card>

        {canManage && (
          <Card title="Demand history">
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>
              Upload your historical demand data to calibrate the prediction model to your
              practice. We accept the AskMyGP <em>"Crosstab — Demand data"</em> CSV export.
              Re-upload anytime to recalibrate.
            </p>
            <DemandUpload
              practiceId={practiceId}
              onlineConsultTool={practice.online_consult_tool}
              demandSettings={demandSettings}
              history={historySummary || []}
            />
            {demandSettings?.lastCalibratedAt && (
              <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                Last calibrated{' '}
                {new Date(demandSettings.lastCalibratedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}
                {demandSettings.sampleSize} weekday data points
                {demandSettings.spanDays && <>, {demandSettings.spanDays} days span</>}
              </div>
            )}
          </Card>
        )}

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

        {/* Danger zone — platform admin only */}
        {isPlatformAdmin && (
          <div style={{
            background: 'rgba(127,29,29,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 12,
            padding: 20,
            marginTop: 8,
          }}>
            <h3 style={{ color: '#fca5a5', fontSize: 13, fontWeight: 600, marginBottom: 4, fontFamily: "'Outfit', sans-serif" }}>
              Danger zone
            </h3>
            <p style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
              Permanently delete this practice and all of its data. Only visible to
              platform admins. There is no undo.
            </p>
            <DeletePracticeButton practiceId={practiceId} practiceName={practice.name} />
          </div>
        )}
      </div>
    </DashboardShell>
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
