// /privacy/processors — public list of sub-processors GPDash uses.
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

export default function ProcessorsPage() {
  return (
    <main className="min-h-screen px-6 py-10" style={{ background: '#f8fafc', color: '#0f172a' }}>
      <article className="max-w-3xl mx-auto" style={{ lineHeight: 1.65 }}>
        <header className="mb-8">
          <p className="text-sm text-slate-500 mb-2">
            <Link href="/privacy" className="text-cyan-700 hover:underline">← Privacy Notice</Link>
          </p>
          <h1 className="text-3xl font-semibold mb-2" style={{ color: '#0f172a' }}>Sub-processors</h1>
          <p className="text-sm text-slate-500">
            Last updated: <time dateTime={LEGAL_META.processorsLastUpdated}>{LEGAL_META.processorsLastUpdated}</time>
          </p>
        </header>

        <section className="mb-8 text-sm text-slate-700 space-y-3">
          <p>
            These are the third-party services we use to provide GPDash. Each
            one is a <em>sub-processor</em> — they process personal data on
            our behalf under a data processing agreement, only on our
            instructions, and only for the purposes listed below.
          </p>
          <p>
            We&apos;ll update this page whenever the list changes and notify
            existing customers by email before adding a new sub-processor
            that materially changes data flows.
          </p>
        </section>

        <div className="space-y-5">
          {PROCESSORS.map(p => (
            <article
              key={p.name}
              className="rounded-xl p-5"
              style={{ background: 'white', border: '1px solid #e2e8f0' }}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                <h2 className="text-lg font-semibold" style={{ color: '#0f172a' }}>{p.name}</h2>
                <a
                  href={p.privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-cyan-700 hover:underline"
                >
                  Privacy notice ↗
                </a>
              </div>
              <Row label="Role">{p.role}</Row>
              <Row label="Data handled">{p.data}</Row>
              <Row label="Region">{p.region}</Row>
              <Row label="Agreement">{p.dpa}</Row>
              {p.notes && (
                <div className="text-xs text-slate-500 mt-3 pt-3 leading-relaxed" style={{ borderTop: '1px solid #f1f5f9' }}>
                  {p.notes}
                </div>
              )}
            </article>
          ))}
        </div>

        <section className="mt-8 text-sm text-slate-700">
          <h2 className="text-lg font-semibold mb-2" style={{ color: '#0f172a' }}>What about other tools?</h2>
          <p>
            Some tools are used by our development team (e.g. GitHub for
            source code, Claude for engineering assistance) but are <em>not</em>{' '}
            connected to the production data flow. They never see GPDash
            user data and are therefore not sub-processors. If that ever
            changes, this page will be updated and you&apos;ll be notified.
          </p>
        </section>

        <footer className="mt-10 pt-6 text-xs text-slate-500" style={{ borderTop: '1px solid #e2e8f0' }}>
          <p>
            Questions?{' '}
            <a href={`mailto:${LEGAL_META.privacyContactEmail}`} className="text-cyan-700 hover:underline">
              {LEGAL_META.privacyContactEmail}
            </a>
          </p>
        </footer>
      </article>
    </main>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-1">
      <span className="text-xs text-slate-500 uppercase tracking-wide sm:w-28 flex-shrink-0">{label}</span>
      <span className="text-sm text-slate-800">{children}</span>
    </div>
  );
}
