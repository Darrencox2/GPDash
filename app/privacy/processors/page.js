// /privacy/processors — public list of sub-processors GPDash uses.
//
// Dark glass theme matching /privacy and /legal/*.
//
// Kept separate from the main privacy notice so it can be updated more
// frequently without re-versioning the whole notice. Each entry follows
// the same shape: name, what they do for us, what data they handle,
// where they operate from, link to their privacy notice.

import Link from 'next/link';
import { LEGAL_META } from '@/lib/legal-meta';

export const metadata = {
  title: 'Sub-processors · GPDash',
  description: 'The third-party services GPDash uses to provide the platform.',
};

const PAGE_BG = 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)';

const PROCESSORS = [
  {
    name: 'Supabase',
    role: 'Authentication and primary database hosting',
    data: 'All account data, audit logs, MFA factor metadata, practice configuration',
    region: 'eu-west-2 (London, UK)',
    privacyUrl: 'https://supabase.com/privacy',
    dpa: 'Standard Supabase DPA',
    notes: 'TOTP secrets are stored by Supabase Auth and are not readable by GPDash application code.',
  },
  {
    name: 'Vercel',
    role: 'Application hosting (server functions and static assets)',
    data: 'Network traffic, request logs (30 days), CSP violation reports',
    region: 'Frankfurt (fra1) primary; edge functions may be served from the nearest available region',
    privacyUrl: 'https://vercel.com/legal/privacy-policy',
    dpa: 'Standard Vercel DPA',
    notes: null,
  },
  {
    name: 'Upstash',
    role: 'Redis service for API rate limiting',
    data: 'Hashed user ID or IP address + request counters (sliding window, max 1 hour)',
    region: 'EU region (verified in account settings)',
    privacyUrl: 'https://upstash.com/trust/privacy.pdf',
    dpa: 'Standard Upstash DPA',
    notes: 'No request content is stored — only counters.',
  },
  {
    name: 'Bunny Fonts',
    role: 'Web font delivery (drop-in privacy-respecting replacement for Google Fonts)',
    data: 'HTTP request from your browser to load the font file. Bunny Fonts publicly commits to not logging IP addresses.',
    region: 'EU/EEA hosted',
    privacyUrl: 'https://bunny.net/gdpr/',
    dpa: 'Bunny Fonts terms (no DPA needed — no personal data processed by them)',
    notes: 'We migrated from Google Fonts in v4.24.1 specifically to avoid sending visitor IPs to a US-hosted CDN.',
  },
  {
    name: 'Open-Meteo',
    role: 'Weather forecast data feed for the demand prediction model',
    data: 'Practice location coordinates (already publicly known, e.g. NHS ODS) and date. No personal data sent.',
    region: 'EU',
    privacyUrl: 'https://open-meteo.com/en/terms',
    dpa: 'Not required (anonymous query)',
    notes: 'Weather is used as one of many features in the demand predictor model.',
  },
];

const inlineLink = { color: 'var(--link)', textDecoration: 'underline', textUnderlineOffset: 2 };

export default function ProcessorsPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px 64px', background: PAGE_BG, color: '#e2e8f0' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', lineHeight: 1.65 }}>
        <header className="mb-8">
          <p className="text-body-sm text-slate-400 mb-2.5">
            <Link href="/privacy" style={inlineLink}>← Privacy Notice</Link>
          </p>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 600, marginBottom: 8, color: '#f1f5f9' }}>Sub-processors</h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Last updated: <time dateTime={LEGAL_META.processorsLastUpdated}>{LEGAL_META.processorsLastUpdated}</time>
          </p>
        </header>

        <section style={{ marginBottom: 28, fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>
          <p>These are the third-party services we use to provide GPDash. Each one is a <em>sub-processor</em> — they process personal data on our behalf under a data processing agreement, only on our instructions, and only for the purposes listed below.</p>
          <p>We&apos;ll update this page whenever the list changes and notify existing customers by email before adding a new sub-processor that materially changes data flows.</p>
        </section>

        <div className="grid gap-4">
          {PROCESSORS.map(p => (
            <article key={p.name} style={{
              borderRadius: 'var(--r-lg)',
              padding: 20,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>{p.name}</h2>
                <a href={p.privacyUrl} target="_blank" rel="noopener noreferrer" style={{ ...inlineLink, fontSize: 12 }}>
                  Privacy notice ↗
                </a>
              </div>
              <Row label="Role">{p.role}</Row>
              <Row label="Data handled">{p.data}</Row>
              <Row label="Region">{p.region}</Row>
              <Row label="Agreement">{p.dpa}</Row>
              {p.notes && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 12, paddingTop: 12, lineHeight: 1.6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  {p.notes}
                </div>
              )}
            </article>
          ))}
        </div>

        <section style={{ marginTop: 32, fontSize: 14, color: '#cbd5e1', lineHeight: 1.7 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 600, marginBottom: 10, color: '#f1f5f9' }}>What about other tools?</h2>
          <p>Some tools are used by our development team (e.g. GitHub for source code, Claude for engineering assistance) but are <em>not</em> connected to the production data flow. They never see GPDash user data and are therefore not sub-processors. If that ever changes, this page will be updated and you&apos;ll be notified.</p>
        </section>

        <footer style={{ marginTop: 40, paddingTop: 24, fontSize: 12, color: 'var(--meta)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          Questions? <a href={`mailto:${LEGAL_META.privacyContactEmail}`} style={inlineLink}>{LEGAL_META.privacyContactEmail}</a>
        </footer>
      </article>
    </main>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '4px 0', alignItems: 'baseline' }}>
      <span style={{ fontSize: 11, color: 'var(--meta)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600, flex: '0 0 110px' }}>{label}</span>
      <span style={{ fontSize: 13, color: '#cbd5e1', flex: '1 1 300px' }}>{children}</span>
    </div>
  );
}
