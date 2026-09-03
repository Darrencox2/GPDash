// Public changelog — renders lib/changelog.js (the same data shown in
// the in-app sidebar) as a standalone page. Server component, no auth,
// styled to match the /legal and /privacy public pages.
import { CHANGELOG as RECENT } from '@/lib/changelog';
import { CHANGELOG_ARCHIVE } from '@/lib/changelog-archive';
// Server component: the archive import costs the browser nothing.
const CHANGELOG = [...RECENT, ...CHANGELOG_ARCHIVE];
import { APP_VERSION } from '@/lib/version';

export const metadata = {
  title: 'Changelog',
  description: 'What has changed in GPDash, version by version.',
};

const PAGE_BG = 'linear-gradient(160deg, #0f172a 0%, #111c33 55%, #0f172a 100%)';

const TYPE_BADGE = {
  feature: { label: 'New', bg: 'rgba(16,185,129,0.16)', border: 'rgba(16,185,129,0.4)', color: 'var(--c-green-2)' },
  fix:     { label: 'Fix', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.38)', color: 'var(--c-red-2)' },
  tweak:   { label: 'Improved', bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.38)', color: 'var(--c-blue-2)' },
  note:    { label: 'Note', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.3)', color: 'var(--g-text-mid)' },
};

function Badge({ type }) {
  const b = TYPE_BADGE[type] || TYPE_BADGE.note;
  return (
    <span style={{
      display: 'inline-block', flexShrink: 0, fontSize: 11, fontWeight: 600, padding: '1px 8px',
      borderRadius: 'var(--r-pill)', background: b.bg, border: `1px solid ${b.border}`, color: b.color,
      marginTop: 2, minWidth: 64, textAlign: 'center',
    }}>{b.label}</span>
  );
}

// Rendering every release at once produced a 162,000px page on desktop and
// 289,000px on mobile across 7,585 DOM nodes - enough to crash a headless
// browser mid-screenshot. Nobody scrolls 76 metres to reach v1. Show the
// recent releases and put the rest behind an explicit opt-in.
const RECENT_COUNT = 12;

export default async function ChangelogPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const showAll = sp.all === '1';
  const releases = showAll ? CHANGELOG : CHANGELOG.slice(0, RECENT_COUNT);
  const hiddenCount = CHANGELOG.length - releases.length;
  return (
    <main style={{ minHeight: '100vh', padding: '40px 24px 64px', background: PAGE_BG, color: 'var(--g-text-hi)' }}>
      <article style={{ maxWidth: 760, margin: '0 auto', lineHeight: 1.65 }}>
        <header style={{ marginBottom: 36 }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, fontWeight: 600, marginBottom: 10, color: 'var(--g-text-pale)' }}>Changelog</h1>
          <p style={{ fontSize: 14, color: 'var(--g-text-soft)', lineHeight: 1.7, margin: 0 }}>
            Every change to GPDash, version by version. Current version: <strong style={{ color: 'var(--g-text-pale)' }}>{APP_VERSION}</strong>.
          </p>
          <p className="text-meta text-slate-400 mt-2.5">
            <a href="/" style={{ color: 'var(--link)', textDecoration: 'underline' }}>Back to GPDash</a>
          </p>
        </header>

        {releases.map((rel) => (
          <section key={rel.version} style={{ marginBottom: 28, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, color: 'var(--g-text-pale)', margin: 0 }}>v{rel.version}</h2>
              <span className="text-body-sm text-slate-400">{rel.title}</span>
              {rel.date && <span style={{ fontSize: 12, color: 'var(--meta)', marginLeft: 'auto' }}>{rel.date}</span>}
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(rel.changes || []).map((c, i) => (
                <li key={i} className="flex gap-2.5 items-start">
                  <Badge type={c.type} />
                  <span className="text-body text-slate-300">{c.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {hiddenCount > 0 && (
          <p style={{ marginTop: 8, fontSize: 14 }}>
            <a href="/changelog?all=1" style={{ color: 'var(--link)', textDecoration: 'underline' }}>
              Show all {CHANGELOG.length} releases
            </a>
            <span style={{ color: 'var(--meta)' }}> &middot; {hiddenCount} older {hiddenCount === 1 ? 'release' : 'releases'} hidden</span>
          </p>
        )}
        {showAll && (
          <p style={{ marginTop: 8, fontSize: 14 }}>
            <a href="/changelog" style={{ color: 'var(--link)', textDecoration: 'underline' }}>
              Show recent releases only
            </a>
          </p>
        )}
      </article>
    </main>
  );
}
