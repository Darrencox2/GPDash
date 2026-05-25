// /legal — public landing page for practice-facing legal docs.
//
// NOT linked from the main navigation. Discoverable only via the
// platform admin section (so we can hand the URL to a prospective
// practice's IG officer during due diligence without surfacing it to
// every visitor).
//
// Carries the DPA template and DSPT evidence pack — the two things a
// practice's information governance officer will ask for. Internal
// docs (breach procedure, SAR procedure, security policy, RoPA,
// DPIA template) stay in the repo only.

import Link from 'next/link';
import { LEGAL_META } from '@/lib/legal-meta';

export const metadata = {
  title: 'Legal & compliance · GPDash',
  description: 'GPDash data processing agreement, DSPT evidence pack, and related compliance materials.',
  // Discourage search engines from indexing — this page is for direct
  // sharing with practices, not for organic discovery.
  robots: { index: false, follow: false },
};

const docs = [
  {
    title: 'Privacy Notice',
    description: 'How GPDash collects, uses, and protects personal data. Covers our role as a controller (for account holder data) and explains the controller/processor split for practice data.',
    href: '/privacy',
    audience: 'For everyone',
  },
  {
    title: 'Sub-processors',
    description: 'The third-party services GPDash uses to deliver the platform — Supabase, Vercel, Upstash, Bunny Fonts, Open-Meteo. Each with role, hosting region, and data handled.',
    href: '/privacy/processors',
    audience: 'For practice IG / due diligence',
  },
  {
    title: 'Data Processing Agreement (DPA)',
    description: 'Template DPA covering UK GDPR Article 28 obligations. Practices sign this with GPDash as the processor of their operational data. Includes schedules for processing description, technical measures, sub-processors, and permitted instructions.',
    href: '/legal/dpa',
    audience: 'For practice IG / contracting',
    draft: !LEGAL_META.privacyReviewedByLegal,
  },
  {
    title: 'DSPT evidence pack',
    description: 'Maps GPDash technical and organisational controls against all 10 NHS Data Security and Protection Toolkit standards. Designed to give a practice\'s IG officer a concrete answer to "how does GPDash handle X?" during due diligence.',
    href: '/legal/dspt',
    audience: 'For practice IG / due diligence',
  },
];

export default function LegalLandingPage() {
  return (
    <main className="min-h-screen px-6 py-10" style={{ background: '#f8fafc', color: '#0f172a' }}>
      <article className="max-w-3xl mx-auto" style={{ lineHeight: 1.65 }}>
        <header className="mb-8">
          <h1 className="text-3xl font-semibold mb-3" style={{ color: '#0f172a' }}>Legal &amp; compliance</h1>
          <p className="text-sm text-slate-600">
            Resources for practices considering or already using GPDash. If
            you&apos;re an Information Governance officer doing due diligence,
            the DPA and DSPT evidence pack are usually the documents you want.
          </p>
          <p className="text-xs text-slate-500 mt-3">
            For anything not covered here, email{' '}
            <a href={`mailto:${LEGAL_META.privacyContactEmail}`} className="text-cyan-700 hover:underline">
              {LEGAL_META.privacyContactEmail}
            </a>.
          </p>
        </header>

        <div className="space-y-4">
          {docs.map(doc => (
            <Link
              key={doc.href}
              href={doc.href}
              className="block rounded-xl transition-colors"
              style={{ background: 'white', border: '1px solid #e2e8f0', padding: 20, textDecoration: 'none' }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1.5 flex-wrap">
                <h2 className="text-lg font-semibold" style={{ color: '#0f172a' }}>
                  {doc.title}
                </h2>
                <div className="flex items-center gap-2">
                  {doc.draft && (
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: '#fef3c7', color: '#78350f', border: '1px solid #fcd34d' }}
                    >
                      DRAFT
                    </span>
                  )}
                  <span className="text-xs text-slate-500">{doc.audience}</span>
                </div>
              </div>
              <p className="text-sm text-slate-700 mb-2" style={{ marginBottom: 0 }}>
                {doc.description}
              </p>
              <div className="text-xs text-cyan-700 mt-3 font-medium">
                Open →
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-10 pt-6 text-xs text-slate-500" style={{ borderTop: '1px solid #e2e8f0' }}>
          <p className="mb-1">
            Controller: {LEGAL_META.controllerName}
          </p>
          <p>
            <Link href="/" className="hover:underline">← Back to GPDash</Link>
          </p>
        </footer>
      </article>
    </main>
  );
}
