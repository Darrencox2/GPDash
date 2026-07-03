// Branded launch splash — streams instantly while the server prepares the
// dashboard. Deliberately high-contrast and self-contained (hardcoded colours,
// inline keyframes): the previous skeleton used near-black tiles on a black
// background and read as a frozen black screen on phones.
import GPDashLogo from '@/components/GPDashLogo';

export default function Loading() {
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
      <GPDashLogo size="sidebar" />
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 4, color: '#e2e8f0', fontFamily: "'Outfit', 'DM Sans', sans-serif" }}>
        [GP]DASH
      </div>
      <div
        aria-label="Loading"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid rgba(148,163,184,0.25)', borderTopColor: '#34d399',
          animation: 'gpdash-spin 0.8s linear infinite',
        }}
      />
      <div style={{ fontSize: 14, color: '#94a3b8' }}>Loading your practice…</div>
    </div>
  );
}
