// /v4/admin — platform admin landing page. Lists every practice on the
// platform with member counts and quick links. Only accessible if the
// signed-in user has profiles.is_platform_admin = true.
//
// This is for support and oversight, not day-to-day practice work — for
// that, click into a practice and use the normal /p/[slug] dashboard,
// which RLS lets the platform admin into via the is_practice_admin()
// override.

import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { requireAdmin } from '@/lib/admin-guard';
import AdminNav from './AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminPracticesPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <div className="p-8 text-white">Configuration error.</div>;

  // Auth + platform-admin + MFA enforcement in one call. Redirects on
  // any failure; if we get past this line the user is fully cleared.
  await requireAdmin(supabase, { returnTo: '/v4/admin' });

  const { data: practices, error } = await supabase.rpc('admin_list_practices');

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: '32px 32px 64px',
    }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <AdminNav active="practices" />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 14, borderRadius: 'var(--r-md)', marginBottom: 18, fontSize: 14 }}>
            {error.message}
          </div>
        )}

        <div className="flex gap-3.5 mb-7 flex-wrap">
          <Stat label="Practices" value={practices?.length || 0} />
          <Stat label="Total members" value={(practices || []).reduce((s, p) => s + Number(p.member_count || 0), 0)} />
          <Stat label="Total clinicians" value={(practices || []).reduce((s, p) => s + Number(p.clinician_count || 0), 0)} />
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <table className="w-full border-collapse text-body">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', textAlign: 'left' }}>
                <th style={th}>Name</th>
                <th style={th}>Slug</th>
                <th style={th}>ODS</th>
                <th style={th}>Region</th>
                <th style={{ ...th, textAlign: 'right' }}>Members</th>
                <th style={{ ...th, textAlign: 'right' }}>Clinicians</th>
                <th style={th}>Created</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(practices || []).length === 0 && (
                <tr><td colSpan={8} style={{ ...td, textAlign: 'center', padding: 36, color: '#94a3b8' }}>No practices yet.</td></tr>
              )}
              {(practices || []).map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...td, color: '#e2e8f0', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ ...td, color: '#cbd5e1', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{p.slug}</td>
                  <td style={{ ...td, color: '#cbd5e1', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13 }}>{p.ods_code || '—'}</td>
                  <td style={{ ...td, color: '#cbd5e1' }}>{p.region || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#e2e8f0' }}>{p.member_count}</td>
                  <td style={{ ...td, textAlign: 'right', color: '#e2e8f0' }}>{p.clinician_count}</td>
                  <td style={{ ...td, color: '#94a3b8', fontSize: 13 }}>
                    {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 8 }}>
                      <Link href={`/p/${p.slug}`} style={btnPrimary} title="Open this practice's main app (Today, capacity, etc.)">Open →</Link>
                      <Link href={`/v4/admin/practices/${p.id}`} style={btnSubtle} title="Manage as platform admin">Manage</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <PublicLegalLinksCard />

        <AdminFooter />
      </div>
    </div>
  );
}

// Card surfacing the unlisted public /legal pages so platform admins
// can find and share them. These URLs are deliberately not linked
// anywhere else in the app — the legal landing page also carries
// noindex/nofollow — so this card is the canonical entry point.
//
// Intended use: paste a URL into an email to a practice's IG officer
// during due diligence. The pages render cleanly without auth so the
// recipient can read them straight away.
function PublicLegalLinksCard() {
  const links = [
    { href: '/legal', label: 'Legal landing', desc: 'Index of practice-facing legal docs (DPA, DSPT, privacy notice, sub-processors). Share this URL for the full set.' },
    { href: '/legal/dpa', label: 'DPA template', desc: 'Article 28 data processing agreement — direct link if a practice IG officer only wants this one.' },
    { href: '/legal/dspt', label: 'DSPT evidence pack', desc: 'GPDash controls mapped to all 10 NHS DSPT standards.' },
    { href: '/privacy', label: 'Public privacy notice', desc: 'Already linked from login + signup; included here for completeness.' },
    { href: '/privacy/processors', label: 'Sub-processors list', desc: 'Already linked from the privacy notice.' },
  ];

  return (
    <div style={{
      marginTop: 32,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 'var(--r-lg)',
      padding: 22,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Public legal pages</h2>
        <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Not linked from the public navigation</span>
      </div>
      <p className="text-meta text-slate-400 mt-1 mb-3.5 leading-body">
        For sharing with a practice&apos;s IG officer during due diligence. These pages render without auth — paste the URL into an email and the recipient can read straight away.
      </p>
      <div className="grid gap-2">
        {links.map(link => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 'var(--r-md)',
              textDecoration: 'none',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: '1 1 280px' }}>
              <div className="text-body-sm font-semibold text-cyan-300 mb-0.5">
                {link.href} <span className="font-normal text-slate-400">— {link.label}</span>
              </div>
              <div className="text-caption text-slate-400 leading-normal">{link.desc}</div>
            </div>
            <span className="text-caption text-cyan-300 font-medium whitespace-nowrap">Open ↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}

const th = { padding: '12px 16px', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94a3b8' };
const td = { padding: '12px 16px', fontSize: 14 };

// Buttons used on row-action cells. Primary = the more frequent action
// ("Open the dashboard" — what platform admins do most often), Subtle =
// the secondary action ("Manage practice settings"). Both styled as
// proper buttons with padding, border, and weight rather than bare
// cyan links — easier to hit on touch and reads as a control rather
// than a hyperlink to a different document.
const btnPrimary = {
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 600,
  color: 'white',
  background: '#0891b2',
  border: '1px solid #0891b2',
  borderRadius: 'var(--r-sm)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  display: 'inline-block',
};
const btnSubtle = {
  padding: '7px 14px',
  fontSize: 13,
  fontWeight: 500,
  color: '#cbd5e1',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--r-sm)',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  display: 'inline-block',
};

function Stat({ label, value }) {
  return (
    <div style={{
      flex: '1 1 200px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 'var(--r-md)',
      padding: '16px 18px',
    }}>
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: '#e2e8f0', fontFamily: "'Outfit', sans-serif", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// Tiny "you are here" footer common to admin pages — gives a sense of
// completeness ("the page has an end") that's missing when the table just
// stops abruptly.
function AdminFooter() {
  return (
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
      <span>Only platform admins see this section.</span>
    </div>
  );
}
