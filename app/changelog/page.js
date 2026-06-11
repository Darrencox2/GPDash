// Public changelog — renders lib/changelog.js (the same data shown in
// the in-app sidebar) as a standalone page. Server component, no auth,
// styled to match the /legal and /privacy public pages.
import { CHANGELOG } from '@/lib/changelog';
import { APP_VERSION } from '@/lib/version';

export const metadata = {
  title: 'Changelog',
  description: 'What has changed in GPDash, version by version.',
};

const PAGE_BG = 'linear-gradient(160deg, #0f172a 0%, #111c33 55%, #0f172a 100%)';

const TYPE_BADGE = {
  feature: { label: 'New', bg: 'rgba(16,185,129,0.16)', border: 'rgba(16,185,129,0.4)', color: '#34d399' },
  fix:     { label: 'Fix', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.38)', color: '#f87171' },
  tweak:   { label: 'Improved', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.38)', color: '#60a5fa' },
  note:    { label: 'Note', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', color: '#94a3b8' },
};

function Badge({ type }) {
  const b = TYPE_BADGE[type] || TYPE_BADGE.note;
  return (
    <span style={{
      display: 'inline-block', flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '1px 8px',
      borderRadius: 999, background: b.bg, border: `1px solid ${b.border}`, color: b.color,
      marginTop: 2, minWidth: 64, textAlign: 'center',
    }}>{b.label}</span>
  );
}

export default function ChangelogPage() {
  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px 64px', background: PAGE_BG, color: '#e2e8f0' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', lineHeight: 1.65 }}>
        <header style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 32, fontWeight: 600, marginBottom: 10, color: '#f1f5f9' }}>Changelog</h1>
          <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.7, margin: 0 }}>
            Every change to GPDash, version by version. Current version: <strong style={{ color: '#f1f5f9' }}>{APP_VERSION}</strong>.
          </p>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
            <a href="/" style={{ color: '#67e8f9', textDecoration: 'underline' }}>Back to GPDash</a>
          </p>
        </header>

        {CHANGELOG.map((rel) => (
          <section key={rel.version} style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: '#f1f5f9', margin: 0 }}>v{rel.version}</h2>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{rel.title}</span>
              {rel.date && <span style={{ fontSize: 12, color: '#64748b', marginLeft: 'auto' }}>{rel.date}</span>}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(rel.changes || []).map((c, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Badge type={c.type} />
                  <span style={{ fontSize: 13.5, color: '#cbd5e1' }}>{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </article>
    </main>
  );
}
