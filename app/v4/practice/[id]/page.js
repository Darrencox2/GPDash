// /v4/practice/[id] — Practice management. Single page with tabs:
//   - Details      (practice setup form + practice URL/slug editor)
//   - Users        (members, pending invites, invite form)
//   - Buddy cover  (workload weights + algorithm explanation)
//   - Demand model (CSV upload + recalibration)
//   - Resources    (TeamNet calendar sync + EMIS report)
//   - Danger zone  (data cleanup + delete practice)
//
// Tab state held in URL ?tab=X for refresh + bookmark safety.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { resolvePracticeIdentifier } from '@/lib/v4-data';
import DashboardShell from '@/components/DashboardShell';
import PracticeTabs from './PracticeTabs';
import CliniciansTab from './CliniciansTab';
import BrandHeader from '../../_lib/BrandHeader';
import PracticeSetupForm from './setup/PracticeSetupForm';
import InviteForm from './InviteForm';
import UsersTab from './UsersTab';
import PendingInvitesCard from './PendingInvitesCard';
import BulkInviteButton from './BulkInviteButton';
import TransferOwnershipButton from './TransferOwnershipButton';
import MembershipChangesCard from './MembershipChangesCard';
import EmisReportCard from '@/components/EmisReportCard';
import DeletePracticeButton from './DeletePracticeButton';
import DemandUpload from './DemandUpload';
import IngestTokens from './IngestTokens';
import RecentAccuracyCard from './RecentAccuracyCard';
import BuddyCoverSettings from './BuddyCoverSettings';
import TeamNetUrlEditor from './TeamNetUrlEditor';
import DataCleanupActions from './DataCleanupActions';
import CapacityTargetsEditor from './CapacityTargetsEditor';
import AuditLogView from './AuditLogView';
import { getSectionStatuses, countCliniciansNeedingAttention } from '@/lib/setup-status';
import { SectionStatusStripe } from '../../_lib/SectionStatus';

export const dynamic = 'force-dynamic';

export default async function PracticeAdminPage({ params }) {
  const { id: identifier } = await params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div className="p-8 text-hi">Configuration error.</div>;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/v4/login');

  const practice = await resolvePracticeIdentifier(supabase, identifier);
  if (!practice) notFound();
  const practiceId = practice.id;

  if (identifier !== practice.slug) {
    redirect(`/v4/practice/${practice.slug}`);
  }

  // ─── All practice-page queries in one parallel batch ────────────────
  // Previously this page did 5+ sequential queries (myMembership,
  // myProfile, fullPractice, members, invites, then a Promise.all for
  // settings/history, then another for clinicians/counts). Each round
  // trip to Supabase from Vercel is ~50-150ms; compounding them serially
  // added 400-700ms to every navigation to /v4/practice.
  //
  // Now everything that doesn't depend on user.id+practiceId (which we
  // have above) goes into a single Promise.all. The auth/role gate that
  // used to sit between query rounds is moved to AFTER all queries
  // resolve — we just gate the rendered content rather than the queries.
  const [
    { data: myMembership },
    { data: myProfile },
    { data: fullPractice },
    { data: members },
    { data: invites },
    { data: settingsRow },
    { data: historySummary },
    { data: clinicianRows },
    { count: demandHistoryCount },
    { count: memberCount },
  ] = await Promise.all([
    supabase.from('practice_users').select('role').eq('practice_id', practiceId).eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('is_platform_admin').eq('id', user.id).maybeSingle(),
    supabase.from('practices').select('id, name, slug, ods_code, postcode, list_size, online_consult_tool, region, setup_completed_at, buddy_cover_public').eq('id', practiceId).maybeSingle(),
    supabase.rpc('list_practice_members', { target_practice_id: practiceId }),
    supabase.from('practice_invites').select('id, email, role, invited_at, expires_at').eq('practice_id', practiceId).is('accepted_at', null).order('invited_at', { ascending: false }),
    supabase.from('practice_settings').select('demand_settings, buddy_settings, huddle_settings, teamnet_url, extras').eq('practice_id', practiceId).maybeSingle(),
    supabase.from('demand_history_summary').select('source, row_count, earliest_date, latest_date, last_uploaded_at').eq('practice_id', practiceId),
    supabase.from('clinicians').select('initials, role, status').eq('practice_id', practiceId),
    supabase.from('demand_history').select('practice_id', { count: 'exact', head: true }).eq('practice_id', practiceId),
    supabase.from('practice_users').select('user_id', { count: 'exact', head: true }).eq('practice_id', practiceId),
  ]);

  const isPlatformAdmin = !!myProfile?.is_platform_admin;
  const isAdminOrOwner = ['owner', 'partner', 'practice_manager', 'admin'].includes(myMembership?.role);
  if (!isAdminOrOwner && !isPlatformAdmin) {
    if (myMembership) {
      redirect(`/p/${practice.slug || practiceId}`);
    } else {
      notFound();
    }
  }

  const demandSettings = settingsRow?.demand_settings || null;
  const buddySettings = settingsRow?.buddy_settings || {};
  const huddleSettings = settingsRow?.huddle_settings || {};
  const teamnetUrl = settingsRow?.teamnet_url || '';
  const lastSyncTime = settingsRow?.extras?.lastTeamnetSync || null;

  const canManage = isAdminOrOwner || isPlatformAdmin;

  const sectionStatuses = getSectionStatuses({
    practice: fullPractice,
    clinicianCount: (clinicianRows || []).length,
    clinicianNeedsAttentionCount: countCliniciansNeedingAttention(clinicianRows || []),
    teamnetUrl,
    demandHistoryCount: demandHistoryCount || 0,
    memberCount: memberCount || 1,
  });

  const shellData = {
    _v4: {
      practiceSlug: practice.slug,
      practiceName: practice.name,
      myRole: isPlatformAdmin ? 'owner' : (myMembership?.role || null),
      isPlatformAdmin,
    },
  };

  // Build tab content as a map; PracticeTabs picks the active one.
  // Each section gets a small status stripe at the top (green when
  // complete, amber when there's something to do). Mapping below
  // matches the dashboard's completeness strip so the two stay in sync.
  //
  // Width: most tabs are forms that read best at ~800px (long lines
  // are hard to scan). The Clinicians tab is a data table that
  // needs more horizontal room — wrap it in a wider container so
  // all the columns (Name, Initials, Role, Status, Buddy, Who's In)
  // are visible without horizontal scroll.
  const stripeFor = (key) => sectionStatuses[key]
    ? <SectionStatusStripe complete={sectionStatuses[key].complete} hint={sectionStatuses[key].hint} label={sectionStatuses[key].label} />
    : null;
  // All tabs now use the same width as the page wrapper (1200px). The
  // narrow() helper used to wrap forms in a 800px column for readability,
  // but that left the clinicians tab visually inconsistent with everything
  // else. Identity wrapper for now so callers don't need to change.
  const narrow = (children) => <>{children}</>;

  const tabContent = {
    details: narrow(
      <>
        {stripeFor('details')}
        <DetailsTab
          practiceId={practiceId}
          practiceSlug={practice.slug}
          fullPractice={fullPractice}
          canManage={canManage}
        />
      </>
    ),
    users: narrow(
      <>
        {stripeFor('team')}
        <UsersTab
          members={members || []}
          invites={invites || []}
          practiceId={practiceId}
          practiceName={practice?.name || 'this practice'}
          canManage={canManage}
          myMembership={myMembership}
          myUserId={user.id}
          isPlatformAdmin={isPlatformAdmin}
          InviteForm={
            <InviteForm
              practiceId={practiceId}
              canMakeOwner={myMembership?.role === 'owner' || isPlatformAdmin}
              canAssignLeadership={['owner','partner','practice_manager'].includes(myMembership?.role) || isPlatformAdmin}
            />
          }
          bulkInviteButton={
            canManage ? (
              <BulkInviteButton
                practiceId={practiceId}
                canMakeOwner={myMembership?.role === 'owner' || isPlatformAdmin}
                canAssignLeadership={['owner','partner','practice_manager'].includes(myMembership?.role) || isPlatformAdmin}
              />
            ) : null
          }
          pendingInviteList={
            <PendingInvitesCard invites={invites || []} canManage={canManage} />
          }
          transferOwnershipButton={
            /* Owner-only (or platform admin acting on owner's behalf). The
               RPC enforces this regardless. */
            (myMembership?.role === 'owner' || isPlatformAdmin) ? (
              <TransferOwnershipButton
                practiceId={practiceId}
                practiceName={practice?.name || 'this practice'}
                members={members || []}
                myUserId={user.id}
              />
            ) : null
          }
          membershipChangesCard={
            <MembershipChangesCard practiceId={practiceId} />
          }
          helpfulFooter={
            <div style={{
              padding: 12,
              background: 'rgba(34, 211, 238, 0.05)',
              border: '1px solid rgba(34, 211, 238, 0.15)',
              borderRadius: 'var(--r-md)',
              fontSize: 13,
              color: 'var(--g-text-mid)',
              lineHeight: 1.5,
            }}>
              Looking to link your account to a clinician record? That lives in
              Sidebar → My account.
            </div>
          }
        />
      </>
    ),
    // Clinicians is the only tab that uses the full 1200px width — the
    // Quick Setup data table needs all of it to render its columns
    // without horizontal scroll on a typical laptop.
    clinicians: canManage ? (
      <>
        {stripeFor('clinicians')}
        <CliniciansTab practiceId={practiceId} />
      </>
    ) : null,
    'buddy-cover': narrow(
      <BuddyCoverSettings
        practiceId={practiceId}
        practiceSlug={practice.slug}
        initialSettings={buddySettings}
        initialPublic={!!practice.buddy_cover_public}
      />
    ),
    demand: narrow(
      <>
        {stripeFor('demand')}
        <DemandTab
          practiceId={practiceId}
          demandSettings={demandSettings}
          huddleSettings={huddleSettings}
          history={historySummary || []}
          canManage={canManage}
          listSize={practice?.list_size || null}
        />
      </>
    ),
    resources: narrow(
      <>
        {stripeFor('teamnet')}
        <ResourcesTab
          practiceId={practiceId}
          teamnetUrl={teamnetUrl}
          lastSyncTime={lastSyncTime}
        />
      </>
    ),
    activity: canManage ? narrow(
      <Card title="Audit log">
        <p className="text-body text-mid leading-body mb-3.5">
          Recent activity in this practice — clinician edits, CSV uploads,
          settings changes, user invites, and so on. Filter by category, click
          "show details" on any row for the full payload.
        </p>
        <AuditLogView practiceId={practiceId} />
      </Card>
    ) : null,
    danger: isPlatformAdmin ? narrow(
      <DangerTab
        practiceId={practiceId}
        practiceName={practice.name}
      />
    ) : null,
  };

  return (
    <DashboardShell shellData={shellData} activeSection="practice-settings">
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Page header — kept narrower so the practice name + meta read well */}
        <div style={{ maxWidth: 800 }}>
          <div className="mb-[18px]">
            <BrandHeader subtitle="Practice management" />
          </div>
          <div className="mb-5">
            <h1 style={{
              fontFamily: "'Outfit', sans-serif", fontSize: 26, fontWeight: 600,
              color: 'var(--g-text-hi)', marginBottom: 6,
            }}>{practice.name}</h1>
            <div className="flex gap-3 text-body-sm text-mid flex-wrap">
              {practice.ods_code && <span>ODS: <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{practice.ods_code}</span></span>}
              {practice.region && <span>{practice.region}</span>}
              <span style={{
                padding: '2px 10px', background: 'rgba(16,185,129,0.15)',
                color: '#34d399', borderRadius: 'var(--r-pill)', fontWeight: 600, fontSize: 11,
              }}>You: {myMembership?.role || (isPlatformAdmin ? 'platform admin' : 'guest')}</span>
            </div>
          </div>
        </div>

        <PracticeTabs canManage={canManage} isPlatformAdmin={isPlatformAdmin} sectionStatuses={sectionStatuses}>
          {tabContent}
        </PracticeTabs>
      </div>
    </DashboardShell>
  );
}

// ─── Tab content components ───────────────────────────────────────

function DetailsTab({ practiceId, practiceSlug, fullPractice, canManage }) {
  return (
    <div className="flex flex-col gap-4">
      <PracticeSetupForm
        practiceId={practiceId}
        practiceSlug={practiceSlug}
        initial={{
          name: fullPractice?.name || '',
          odsCode: fullPractice?.ods_code || '',
          postcode: fullPractice?.postcode || '',
          listSize: fullPractice?.list_size || '',
          region: fullPractice?.region || '',
          setupCompletedAt: fullPractice?.setup_completed_at,
        }}
      />
      {canManage && (
        <div style={{
          padding: 14,
          background: 'rgba(34,211,238,0.05)',
          border: '1px solid rgba(34,211,238,0.15)',
          borderRadius: 'var(--r-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
        }}>
          <div className="text-body-sm text-hi leading-normal">
            <strong className="text-cyan-300">Replay the setup wizard</strong>
            <div className="text-meta text-mid mt-1">
              Step through the original onboarding flow again — useful for adding TeamNet sync,
              re-uploading demand data, or just reviewing what's configured. Nothing gets reset.
            </div>
          </div>
          <a
            href={`/v4/onboarding/setup/${practiceId}`}
            style={{
              fontSize: 12, fontWeight: 500, color: 'white',
              background: '#0891b2', padding: '8px 14px', borderRadius: 'var(--r-sm)',
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >Open wizard →</a>
        </div>
      )}
    </div>
  );
}

function DemandTab({ practiceId, demandSettings, huddleSettings, history, canManage, listSize }) {
  if (!canManage) {
    return <Card title="Demand model"><p className="text-body text-mid">Admin-only.</p></Card>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Card title="Demand history upload">
        <p className="text-body text-hi leading-body mb-3.5">
          Upload your historical demand data to calibrate the prediction model to your
          practice. We accept the AskMyGP <em>"Crosstab — Demand data"</em> CSV export.
          Re-upload anytime to recalibrate.
        </p>
        <DemandUpload
          practiceId={practiceId}
          demandSettings={demandSettings}
          history={history}
          listSize={listSize}
        />
        {demandSettings?.lastCalibratedAt && (
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--g-text-mid)', borderTop: '1px solid var(--g-border)', paddingTop: 12 }}>
            Last calibrated{' '}
            {new Date(demandSettings.lastCalibratedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {' · '}
            {demandSettings.sampleSize} weekday data points
            {demandSettings.spanDays && <>, {demandSettings.spanDays} days span</>}
          </div>
        )}
        {demandSettings?.source === 'nhs_oc_baseline' && (
          <div style={{ marginTop: 14, padding: 12, background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 'var(--r-md)', fontSize: 13, color: '#a5f3fc', lineHeight: 1.5 }}>
            ✨ Currently seeded from NHS England data ({demandSettings.sourceMonth?.slice(0,7)}).
            Upload your own AskMyGP history above to refine the model with your real numbers.
          </div>
        )}
      </Card>

      <Card title="Recent accuracy">
        <RecentAccuracyCard
          practiceId={practiceId}
          demandSettings={demandSettings}
          schoolHolidayRanges={demandSettings?.schoolHolidayRanges}
          listSize={listSize}
          days={60}
        />
        <IngestTokens practiceId={practiceId} />
      </Card>

      <CapacityTargetsEditor
        practiceId={practiceId}
        initialHuddleSettings={huddleSettings}
      />
    </div>
  );
}

function ResourcesTab({ practiceId, teamnetUrl, lastSyncTime }) {
  return (
    <div className="flex flex-col gap-4">
      <Card title="TeamNet calendar sync">
        <TeamNetUrlEditor
          practiceId={practiceId}
          initialUrl={teamnetUrl}
          lastSyncTime={lastSyncTime}
        />
      </Card>
      <Card title="EMIS appointment report">
        <EmisReportCard variant="inline" />
      </Card>
    </div>
  );
}

function DangerTab({ practiceId, practiceName }) {
  return (
    <div className="flex flex-col gap-4">
      <Card title="Data cleanup">
        <DataCleanupActions practiceId={practiceId} />
      </Card>
      <div style={{
        background: 'rgba(127,29,29,0.15)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 'var(--r-lg)',
        padding: 24,
      }}>
        <h3 style={{ color: '#fca5a5', fontSize: 16, fontWeight: 600, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
          Delete this practice
        </h3>
        <p className="text-hi text-body leading-body mb-4">
          Permanently delete this practice and all of its data — clinicians, rota notes,
          absences, buddy assignments, demand history, settings, members, and invites.
          Only visible to platform admins. <strong>There is no undo.</strong>
        </p>
        <DeletePracticeButton practiceId={practiceId} practiceName={practiceName} />
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{
      background: 'var(--g-tile-2)',
      border: '1px solid var(--g-border-2)',
      borderRadius: 'var(--r-lg)',
      padding: 18,
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 12 }}>{title}</h3>
      {children}
    </div>
  );
}
