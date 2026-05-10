// Shared UI for v4 auth pages — keep visual consistency across login/signup/reset.
// All client components since they have form interactions.

// Inline SVG version of the GPDash logo, server-component-safe (no
// hooks, no client-only refs). Used in the AuthCard header so every
// auth page is unmistakably branded.
function AuthLogo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
      <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
        <rect width="36" height="36" rx="7.6" fill="#1e293b" stroke="#334155" strokeWidth="0.5"/>
        <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
        <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
        <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
        <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
        <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
        <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
        <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
        <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
        <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
      </svg>
      <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, fontFamily: "'Space Mono', monospace" }}>
        <span style={{ fontSize: 18, fontWeight: 400, color: '#10b981', opacity: 0.4 }}>[</span>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'white' }}>GP</span>
        <span style={{ fontSize: 18, fontWeight: 400, color: '#10b981', opacity: 0.4 }}>]</span>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontSize: 19, fontWeight: 200, color: '#10b981', letterSpacing: '3px', marginLeft: 2 }}>DASH</span>
      </div>
    </div>
  );
}

export function AuthCard({ title, subtitle, children }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        maxWidth: 400,
        width: '100%',
        background: 'rgba(15,23,42,0.7)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <AuthLogo />
        <div style={{ marginBottom: 24 }}>
          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: 22,
            fontWeight: 600,
            color: 'white',
            marginBottom: 6,
          }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export const formStyles = {
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: '#94a3b8',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: 14,
    color: '#e2e8f0',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    outline: 'none',
    fontFamily: 'inherit',
  },
  button: {
    width: '100%',
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    color: 'white',
    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'transform 0.1s',
    fontFamily: 'inherit',
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  errorBox: {
    padding: '10px 12px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    fontSize: 12,
    color: '#fca5a5',
    marginBottom: 16,
  },
  successBox: {
    padding: '10px 12px',
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 8,
    fontSize: 12,
    color: '#6ee7b7',
    marginBottom: 16,
  },
  footerLink: {
    display: 'block',
    marginTop: 16,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  link: {
    color: '#34d399',
    textDecoration: 'none',
  },
};

// ─── Password validation ──────────────────────────────────────────────
//
// Beta-grade password policy. Deliberately not draconian — research is
// pretty clear that "your password must contain a haiku and a Sanskrit
// glyph" rules push users toward "Password1!" and post-it notes. We
// require:
//  - At least 8 characters
//  - At least one letter
//  - At least one digit
//
// Length is the only thing that genuinely matters for brute-force
// resistance. The letter+digit minima are there as a small mistake-
// catcher (catches "12345678" and "aaaaaaaa" without forcing real users
// to memorise theatre).
export function validatePassword(pw) {
  return {
    longEnough: (pw || '').length >= 8,
    hasLetter: /[a-zA-Z]/.test(pw || ''),
    hasDigit: /[0-9]/.test(pw || ''),
  };
}

export function isPasswordValid(pw) {
  const v = validatePassword(pw);
  return v.longEnough && v.hasLetter && v.hasDigit;
}

// PasswordChecklist — small live-updating requirements box rendered under
// the password field. Each rule turns green when satisfied. Used on
// signup and reset-password.
export function PasswordChecklist({ password }) {
  const v = validatePassword(password);
  const Item = ({ ok, label }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 11,
      color: ok ? '#34d399' : '#94a3b8',
      transition: 'color 0.15s',
    }}>
      <span style={{
        display: 'inline-block',
        width: 12,
        textAlign: 'center',
        fontWeight: 700,
      }}>{ok ? '✓' : '·'}</span>
      <span>{label}</span>
    </div>
  );
  return (
    <div style={{
      marginTop: 6,
      padding: '8px 10px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 6,
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
    }}>
      <Item ok={v.longEnough} label="At least 8 characters" />
      <Item ok={v.hasLetter} label="Includes a letter" />
      <Item ok={v.hasDigit} label="Includes a digit" />
    </div>
  );
}
