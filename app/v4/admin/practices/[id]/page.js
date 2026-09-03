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

import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/lib/admin-guard';
import AdminNav from '../../AdminNav';
import PracticeMembers from './PracticeMembers';
import DeletePracticeButton from './DeletePracticeButton';

export const dynamic = 'force-dynamic';

export default async function AdminPracticeDetailPage({ params }) {
  const { id: practiceId } = await params;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div className="p-8 text-ink-max">Configuration error.</div>;

  await requireAdmin(supabase, { returnTo: `/v4/admin/practices/${practiceId}` });

  const { data: details, error } = await supabase.rpc('admin_get_practice_detail', {
    target_practice_id: practiceId,
  });
  if (error) {
    return (
      <div className="p-8">
        <AdminNav active="practices" />
        <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: 16, borderRadius: 'var(--r-md)', color: 'var(--c-red)' }}>
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
      color: 'var(--g-text-hi)',
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <AdminNav active="practices" />

        <Link href="/v4/admin" style={{ fontSize: 13, color: 'var(--g-text-soft)', textDecoration: 'none', display: 'inline-block', marginBottom: 18 }}>
          ← All practices
        </Link>

        {/* Identity */}
        <div style={card}>
          <div className="flex justify-between items-start mb-[18px] flex-wrap gap-3">
            <div className="min-w-0 flex-1">
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, fontWeight: 600, color: 'var(--g-text-max)', marginBottom: 6, letterSpacing: -0.3 }}>
                {details.name}
              </h2>
              <div style={{ fontSize: 13, color: 'var(--g-text-mid)', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {details.slug}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!details.setup_completed_at && (
                <span style={{ fontSize: 12, padding: '4px 12px', background: 'rgba(245,158,11,0.15)', color: 'var(--c-amber)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--r-pill)' }}>
                  Setup incomplete
                </span>
              )}
            </div>
          </div>

          <Row label="ODS code">
            {details.ods_code ? <span style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{details.ods_code}</span> : <em className="text-slate-400">not set</em>}
          </Row>
          <Row label="Postcode">{details.postcode || <em className="text-slate-400">not set</em>}</Row>
          <Row label="Region">{details.region || <em className="text-slate-400">not set</em>}</Row>
          <Row label="List size">{details.list_size ? details.list_size.toLocaleString('en-GB') : <em className="text-slate-400">not set</em>}</Row>
          <Row label="Created">{new Date(details.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Row>
          <Row label="Setup completed">{details.setup_completed_at ? new Date(details.setup_completed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : <em className="text-amber-400">not yet</em>}</Row>
        </div>

        {/* Stats */}
        <div className="flex gap-3.5 mb-[18px] flex-wrap">
          <Stat label="Members" value={details.members.length} />
          <Stat label="Clinicians" value={details.clinician_count} />
        </div>

        {/* Members */}
        <PracticeMembers practice={details} />

        {/* Deeper settings — link out to existing tabs */}
        <div style={card}>
          <h3 style={cardHeader}>Practice settings</h3>
          <p className="text-body text-slate-300 mb-4 leading-body">
            Detailed practice configuration lives on the practice's own settings page. You'll see
            the same controls a practice owner sees, plus admin-only sections.
          </p>
          <div className="flex gap-2 flex-wrap">
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
          <h3 style={{ ...cardHeader, color: 'var(--c-red)' }}>Danger zone</h3>
          <DeletePracticeButton
            practiceId={details.id}
            practiceName={details.name}
            practiceSlug={details.slug}
          />
        </div>

        <div style={{
          marginTop: 36,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: 12,
          color: 'var(--meta)',
          display: 'flex',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <span>GPDash · Platform admin</span>
          <Link href="/v4/admin" style={{ color: 'var(--meta)', textDecoration: 'none' }}>← All practices</Link>
        </div>
      </div>
    </div>
  );
}

const card = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--r-lg)', padding: 22, marginBottom: 18 };
const cardHeader = { fontSize: 15, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 14, fontFamily: "var(--font-heading)" };

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', gap: 12 }}>
      <span style={{ color: 'var(--g-text-mid)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>{label}</span>
      <span className="text-slate-200 text-body">{children}</span>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      flex: '1 1 200px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 'var(--r-md)',
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 12, color: 'var(--g-text-mid)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--g-text-hi)', fontFamily: "var(--font-heading)", lineHeight: 1 }}>{value}</div>
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
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 500,
        color: isPrimary ? 'var(--g-text-max)' : 'var(--c-cyan-3)',
        background: isPrimary ? '#0891b2' : 'rgba(255,255,255,0.04)',
        border: isPrimary ? 'none' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 'var(--r-sm)',
        textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </a>
  );
}
