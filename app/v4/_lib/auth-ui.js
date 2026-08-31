// Shared UI for v4 auth pages — keep visual consistency across login/signup/reset.
// All client components since they have form interactions.

// Inline SVG version of the GPDash logo, server-component-safe (no
// hooks, no client-only refs). Used in the AuthCard header so every
// auth page is unmistakably branded.
function AuthLogo() {
  return (
    <div className="flex items-center gap-2.5 mb-6">
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
      <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1, fontFamily: "var(--font-mono)" }}>
        <span style={{ fontSize: 18, fontWeight: 400, color: '#10b981', opacity: 0.4 }}>[</span>
        <span className="text-h3 font-bold text-white">GP</span>
        <span style={{ fontSize: 18, fontWeight: 400, color: '#10b981', opacity: 0.4 }}>]</span>
        <span style={{ fontFamily: "var(--font-heading)", fontSize: 18, fontWeight: 200, color: '#10b981', letterSpacing: '3px', marginLeft: 2 }}>DASH</span>
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
        borderRadius: 'var(--r-lg)',
        padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <AuthLogo />
        <div className="mb-6">
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: 24,
            fontWeight: 600,
            color: 'white',
            marginBottom: 6,
          }}>{title}</h1>
          {subtitle && (
            <p className="text-body-sm text-slate-400">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

// DESIGN SYSTEM NOTE: these values intentionally mirror the DARK theme
// constants rather than the --g-* tokens. Auth surfaces (login/signup/reset/
// MFA) are dark-locked by design and must not flip with the in-app theme.
// Radii already use the shared --r-* tokens. This module is the sanctioned
// auth variant of the design system, not a separate system.
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
    padding: '11px 12px',
    fontSize: 16,
    color: '#e2e8f0',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 'var(--r-md)',
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
    borderRadius: 'var(--r-md)',
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
    borderRadius: 'var(--r-md)',
    fontSize: 12,
    color: '#fca5a5',
    marginBottom: 16,
  },
  successBox: {
    padding: '10px 12px',
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 'var(--r-md)',
    fontSize: 12,
    color: '#6ee7b7',
    marginBottom: 16,
  },
  footerLink: {
    display: 'block',
    marginTop: 16,
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
  link: {
    color: 'var(--link)',
    textDecoration: 'none',
    display: 'inline-block',
    padding: '10px 4px',
    margin: '-10px -4px',
  },
  // Demoted variant: the legal/secondary link that should not compete
  // with the real next step.
  linkMuted: {
    color: 'var(--meta)',
    textDecoration: 'none',
    display: 'inline-block',
    padding: '10px 4px',
    margin: '-10px -4px',
  },
};

// ─── Password validation ──────────────────────────────────────────────
//
// THIS LIST MUST MIRROR THE SUPABASE PROJECT POLICY (Authentication →
// Providers → Email → Password Requirements). It did not, and that
// silently broke sign-up: the project requires lower + upper + digit +
// symbol, while this file asked only for a letter and a digit. A new
// user ticked all three boxes green, pressed Create account, and the
// server rejected the password - so no account was created and no
// verification email was ever sent. They were left waiting for a code
// that could not arrive. Proven against the live API on 31 Aug 2026:
// "Winscombe1" is refused, "Winscombe1!" is accepted.
//
// The looser policy this file used to describe is the better one on the
// evidence (length beats character classes, which push people towards
// "Password1!" and post-it notes). If the project policy is relaxed to
// match, relax these rules in the same commit - never leave the two
// out of step again, because the user only ever sees this side.
const SYMBOLS = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

export function validatePassword(pw) {
  const v = pw || '';
  return {
    longEnough: v.length >= 8,
    hasLower: /[a-z]/.test(v),
    hasUpper: /[A-Z]/.test(v),
    hasDigit: /[0-9]/.test(v),
    hasSymbol: SYMBOLS.test(v),
  };
}

export function isPasswordValid(pw) {
  const v = validatePassword(pw);
  return v.longEnough && v.hasLower && v.hasUpper && v.hasDigit && v.hasSymbol;
}

// One sentence saying the whole rule, for error messages and hints.
export const PASSWORD_RULE_TEXT =
  'Passwords need at least 8 characters, a lower-case and an upper-case letter, a number, and a symbol such as ! or ?';

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
      fontSize: 12,
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
      borderRadius: 'var(--r-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
    }}>
      <Item ok={v.longEnough} label="At least 8 characters" />
      <Item ok={v.hasLower && v.hasUpper} label="Upper and lower case letters" />
      <Item ok={v.hasDigit} label="A number" />
      <Item ok={v.hasSymbol} label="A symbol, such as ! ? or #" />
    </div>
  );
}
