// /launch — the home-screen app's start page (manifest start_url).
//
// Purpose: paint the branded splash with as close to ZERO network as possible.
// This page is fully static (no auth, no data) and cache-friendly (see
// vercel.json headers), and everything it needs is inline — so on repeat
// launches the phone renders it from local cache instantly, while the inline
// script navigates on to the real dashboard (via the fast-path cookie) in the
// background. The previous flow could not paint anything until a server
// round-trip completed; this decouples first pixel from the network entirely.

export const dynamic = 'force-static';

export const metadata = { title: 'GPDash' };

const NAV_SCRIPT = `(function(){
  try {
    var m = document.cookie.match(/(?:^|; )gpdash-last-practice=([a-zA-Z0-9-]{1,64})(?:;|$)/);
    var dest = m ? '/p/' + m[1] : '/';
    // replace() so Back never returns to the splash
    window.location.replace(dest);
  } catch (e) { window.location.replace('/'); }
})();`;

const TILE = { g: '#10b981', a: '#f59e0b', r: '#ef4444', s: '#334155' };

function InlineLogo({ size = 64 }) {
  const s = size, rad = s * 0.21, pad = s * 0.125, gap = s * 0.04;
  const tile = (s - pad * 2 - gap * 2) / 3;
  const pos = (i) => pad + i * (tile + gap);
  const cells = [
    [0, 0, TILE.g, 1], [1, 0, TILE.g, 0.7], [2, 0, TILE.s, 1],
    [0, 1, TILE.g, 0.7], [1, 1, TILE.a, 1], [2, 1, TILE.s, 1],
    [0, 2, TILE.r, 1], [1, 2, TILE.a, 0.5], [2, 2, TILE.s, 1],
  ];
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-label="GPDash">
      <rect width={s} height={s} rx={rad} fill="#1e293b" stroke="var(--g-text-mute)" strokeWidth="0.5" />
      {cells.map(([x, y, fill, op], i) => (
        <rect key={i} x={pos(x)} y={pos(y)} width={tile} height={tile} rx={rad * 0.4} fill={fill} opacity={op} />
      ))}
    </svg>
  );
}

export default function Launch() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 20,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)',
      }}
    >
      <style>{`@keyframes gpdash-spin { to { transform: rotate(360deg); } }`}</style>
      <noscript><meta httpEquiv="refresh" content="0;url=/" /></noscript>
      <InlineLogo size={64} />
      <div style={{ fontSize: 24, letterSpacing: 1, fontFamily: "'Space Mono', ui-monospace, monospace", color: 'var(--g-text-hi)' }}>
        <span style={{ color: 'var(--state-ok)', opacity: 0.8 }}>[</span>
        <span style={{ fontWeight: 700 }}>GP</span>
        <span style={{ color: 'var(--state-ok)', opacity: 0.8 }}>]</span>
        <span style={{ fontWeight: 200, color: 'var(--state-ok)' }}>DASH</span>
      </div>
      <div
        aria-label="Loading"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid rgba(148,163,184,0.25)', borderTopColor: '#34d399',
          animation: 'gpdash-spin 0.8s linear infinite',
        }}
      />
      <script dangerouslySetInnerHTML={{ __html: NAV_SCRIPT }} />
    </div>
  );
}
