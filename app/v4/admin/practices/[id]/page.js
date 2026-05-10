// /v4/admin/practices/[id] — platform-admin practice detail.
//
// Stays inside the admin shell (AdminNav at the top) rather than dropping
// into the practice's own DashboardShell — that mode-switch was confusing
// when the goal is "manage this practice as platform admin".
//
// Scope:
//   - Identity card (name, ODS, slug, postcode, list size, region, etc.)
//   - Stats (members, clinicians, setup status)
//   - Members management — add existing user, change role, remove
//   - Quick links to deeper settings (the practice's own /v4/practice/[slug]
//     pages still exist for the practice-admin self-service experience)
//   - Danger zone (typed-confirmation delete)
//
// We don't duplicate the deep settings forms (PracticeSetupForm,
// BuddyCoverSettings, DemandTab, etc.) here — they're 800+ lines and
// changing them in two places would invite drift. Linked instead.

import { redirect, notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import AdminNav from '../../AdminNav';
import PracticeMembers from './PracticeMembers';
import DeletePracticeButton from './DeletePracticeButton';

export const dynamic = 'force-dynamic';

export default async function AdminPracticeDetailPage({ params }) {
  const { id: practiceId } = params;

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

  const { data: details, error } = await supabase.rpc('admin_get_practice_detail', {
    target_practice_id: practiceId,
  });
  if (error) {
    return (
      <div style={{ padding: 32 }}>
        <AdminNav active="practices" />
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: 16, borderRadius: 8, color: '#fca5a5' }}>
          {error.message}
        </div>
      </div>
    );
  }
  if (!details) notFound();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
    }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <AdminNav active="practices" />

        <Link href="/v4/admin" style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'none', display: 'inline-block', marginBottom: 16 }}>
          ← All practices
        </Link>

        {/* Identity */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: 'white', marginBottom: 4 }}>
                {details.name}
              </h2>
              <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {details.slug}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {!details.setup_completed_at && (
                <span style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 999 }}>
                  Setup incomplete
                </span>
              )}
            </div>
          </div>

          <Row label="ODS code">
            {details.ods_code ? <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{details.ods_code}</span> : <em style={{ color: '#475569' }}>not set</em>}
          </Row>
          <Row label="Postcode">{details.postcode || <em style={{ color: '#475569' }}>not set</em>}</Row>
          <Row label="Region">{details.region || <em style={{ color: '#475569' }}>not set</em>}</Row>
          <Row label="List size">{details.list_size ? details.list_size.toLocaleString('en-GB') : <em style={{ color: '#475569' }}>not set</em>}</Row>
          <Row label="Online consult">{details.online_consult_tool || <em style={{ color: '#475569' }}>not set</em>}</Row>
          <Row label="Created">{new Date(details.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Row>
          <Row label="Setup completed">{details.setup_completed_at ? new Date(details.setup_completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <em style={{ color: '#fbbf24' }}>not yet</em>}</Row>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Stat label="Members" value={details.members.length} />
          <Stat label="Clinicians" value={details.clinician_count} />
        </div>

        {/* Members */}
        <PracticeMembers practice={details} />

        {/* Deeper settings — link out to existing tabs */}
        <div style={card}>
          <h3 style={cardHeader}>Practice settings</h3>
          <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14, lineHeight: 1.5 }}>
            Detailed practice configuration lives on the practice's own settings page. You'll see
            the same controls a practice owner sees, plus admin-only sections.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SettingsLink href={`/v4/practice/${details.slug}?tab=details`} label="Details" />
            <SettingsLink href={`/v4/practice/${details.slug}?tab=buddy-cover`} label="Buddy cover" />
            <SettingsLink href={`/v4/practice/${details.slug}?tab=demand`} label="Demand model" />
            <SettingsLink href={`/v4/practice/${details.slug}?tab=resources`} label="Resources" />
            <SettingsLink href={`/v4/practice/${details.slug}?tab=activity`} label="Activity" />
            <SettingsLink
              href={`/p/${details.slug}`}
              label="Open dashboard →"
              kind="primary"
              title="Jump into this practice's main app (Today, capacity, buddy cover, etc.)"
            />
          </div>
        </div>

        {/* Danger zone */}
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.2)' }}>
          <h3 style={{ ...cardHeader, color: '#fca5a5' }}>Danger zone</h3>
          <DeletePracticeButton
            practiceId={details.id}
            practiceName={details.name}
            practiceSlug={details.slug}
          />
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

function Stat({ label, value }) {
  return (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#e2e8f0', fontFamily: "'Outfit', sans-serif" }}>{value}</div>
    </div>
  );
}

function SettingsLink({ href, label, kind, title }) {
  const isPrimary = kind === 'primary';
  return (
    <a
      href={href}
      title={title}
      style={{
        padding: '7px 12px',
        fontSize: 12,
        fontWeight: 500,
        color: isPrimary ? 'white' : '#22d3ee',
        background: isPrimary ? '#0891b2' : 'rgba(255,255,255,0.04)',
        border: isPrimary ? 'none' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </a>
  );
}
