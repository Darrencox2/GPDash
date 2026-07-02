// Streaming shell for /p/[id]. Next.js sends this INSTANTLY while the page's
// server component authenticates and runs its data queries — without it the
// route sends nothing until every query finishes, which reads as a frozen
// blank screen (worst on the iOS home-screen app, where there is no progress
// bar). Pure divs + theme tokens so it costs nothing and matches both themes.
export default function Loading() {
  const tile = { background: 'var(--g-tile)', borderRadius: 12 };
  return (
    <div
      className="min-h-screen animate-pulse"
      style={{ background: 'var(--g-surface)', padding: 20 }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* header row */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
          <div style={{ ...tile, width: 44, height: 44 }} />
          <div style={{ ...tile, width: 180, height: 22 }} />
          <div style={{ ...tile, width: 110, height: 36, marginLeft: 'auto' }} />
        </div>
        {/* main panel */}
        <div style={{ ...tile, height: 280, marginBottom: 16 }} />
        {/* card row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
          <div style={{ ...tile, height: 120 }} />
          <div style={{ ...tile, height: 120 }} />
          <div style={{ ...tile, height: 120 }} />
        </div>
      </div>
    </div>
  );
}
