// Layout for all /v4/* pages — dark glass theme, consistent with existing app.
// Doesn't apply to /v4-test (intentionally bare diagnostic page).
//
// We set the background on this wrapper rather than relying on globals.css
// because globals.css ships a light slate (#f1f5f9) for the legacy v3 dashboard
// body. Without an opaque dark background here, the v4 auth cards floated
// over a pale grey body and looked off.

export const metadata = {
  title: 'GPDash v4',
};

export default function V4Layout({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      color: '#e2e8f0',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      {children}
    </div>
  );
}
