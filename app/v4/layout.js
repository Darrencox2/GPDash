// Layout for all /v4/* pages — dark glass theme, consistent with existing app.
// Doesn't apply to /v4-test (intentionally bare diagnostic page).

export const metadata = {
  title: 'GPDash v4',
};

export default function V4Layout({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      color: '#e2e8f0',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      {children}
    </div>
  );
}
