// /legal — public landing page for practice-facing legal docs.
//
// Dark glass theme matching /privacy and the rest of GPDash.
//
// NOT linked from the main navigation. Discoverable only via the
// platform admin section (so we can hand the URL to a prospective
// practice's IG officer during due diligence without surfacing it to
// every visitor).

import Link from 'next/link';
import { LEGAL_META } from '@/lib/legal-meta';

export const metadata = {
  title: 'Legal & compliance · GPDash',
  description: 'GPDash data processing agreement, DSPT evidence pack, and related compliance materials.',
  robots: { index: false, follow: false },
};

const PAGE_BG = 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)';

const docs = [
  { title: 'Privacy Notice', description: 'How GPDash collects, uses, and protects personal data. Covers our role as a controller (for account holder data) and explains the controller/processor split for practice data.', href: '/privacy', audience: 'For everyone' },
  { title: 'Sub-processors', description: 'The third-party services GPDash uses to deliver the platform — Supabase, Vercel, Upstash, Bunny Fonts, Open-Meteo. Each with role, hosting region, and data handled.', href: '/privacy/processors', audience: 'For practice IG / due diligence' },
  { title: 'Data Processing Agreement (DPA)', description: 'Template DPA covering UK GDPR Article 28 obligations. Practices sign this with GPDash as the processor of their operational data. Includes schedules for processing description, technical measures, sub-processors, and permitted instructions.', href: '/legal/dpa', audience: 'For practice IG / contracting', draft: !LEGAL_META.privacyReviewedByLegal },
  { title: 'DSPT evidence pack', description: 'Maps GPDash technical and organisational controls against all 10 NHS Data Security and Protection Toolkit standards. Designed to give a practice\'s IG officer a concrete answer to "how does GPDash handle X?" during due diligence.', href: '/legal/dspt', audience: 'For practice IG / due diligence' },
];

export default function LegalLandingPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px 64px', background: PAGE_BG, color: '#e2e8f0' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', lineHeight: 1.65 }}>
        <header style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 600, marginBottom: 10, color: '#f1f5f9' }}>Legal &amp; compliance</h1>
          <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7, margin: 0 }}>
            Resources for practices considering or already using GPDash. If you&apos;re an Information Governance officer doing due diligence, the DPA and DSPT evidence pack are usually the documents you want.
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
            For anything not covered here, email{' '}
            <a href={`mailto:${LEGAL_META.privacyContactEmail}`} style={{ color: '#67e8f9', textDecoration: 'underline' }}>
              {LEGAL_META.privacyContactEmail}
            </a>.
          </p>
        </header>

        <div style={{ display: 'grid', gap: 12 }}>
          {docs.map(doc => (
            <Link
              key={doc.href}
              href={doc.href}
              style={{
                display: 'block',
                borderRadius: 'var(--r-lg)',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: 20,
                textDecoration: 'none',
                color: 'inherit',
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 17, fontWeight: 600, margin: 0, color: '#f1f5f9' }}>
                  {doc.title}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {doc.draft && (
                    <span style={{
                      fontSize: 10,
                      padding: '2px 8px',
                      borderRadius: 'var(--r-pill)',
                      fontWeight: 600,
                      background: 'rgba(251,191,36,0.15)',
                      color: '#fcd34d',
                      border: '1px solid rgba(251,191,36,0.30)',
                      letterSpacing: 0.4,
                    }}>DRAFT</span>
                  )}
                  <span style={{ fontSize: 11, color: '#64748b' }}>{doc.audience}</span>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#cbd5e1', margin: 0, lineHeight: 1.65 }}>
                {doc.description}
              </p>
              <div style={{ fontSize: 12, color: '#67e8f9', marginTop: 12, fontWeight: 500 }}>
                Open →
              </div>
            </Link>
          ))}
        </div>

        <footer style={{ marginTop: 48, paddingTop: 24, fontSize: 12, color: '#64748b', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ marginBottom: 6 }}>Controller: {LEGAL_META.controllerName}</p>
          <p style={{ margin: 0 }}><Link href="/" style={{ color: '#94a3b8', textDecoration: 'none' }}>← Back to GPDash</Link></p>
        </footer>
      </article>
    </main>
  );
}
