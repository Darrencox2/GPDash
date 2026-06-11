'use client';
export const dynamic = 'force-dynamic';

// /v4/security — TOTP enrollment + factor management
//
// Two-stage UI:
//   1. List existing factors (if any)
//      - If platform admin and ?required=mfa, show a banner explaining
//        why they're being asked to enrol now
//      - "Add authenticator" button starts enrollment
//   2. Enrollment in progress
//      - Show QR code + manual secret
//      - 6-digit code input to verify
//      - On success: factor activates, list updates, redirect to ?next= or /v4/dashboard
//
// Supabase MFA API used:
//   listFactors()  → enrolled factors (totp[], phone[])
//   enroll({ factorType: 'totp' }) → { id, totp: { qr_code, secret, uri } }
//                                     qr_code is an SVG string we drop into innerHTML
//                                     (it's generated server-side by Supabase from
//                                     known-safe inputs — not user content)
//   challenge({ factorId }) → { id } (the challengeId for verify)
//   verify({ factorId, challengeId, code }) → session at aal2
//   unenroll({ factorId }) → removes a factor
//
// Audit: enrollment success logs an mfa_enrolled auth event for the
// timeline view on /v4/admin/users/[id].

import { useEffect, useState, Suspense } from 'react';
import { confirmDialog } from '@/components/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

export default function SecurityPage() {
  return (
    <Suspense fallback={<PageShell><div style={{ color: '#94a3b8' }}>Loading…</div></PageShell>}>
      <SecurityPageInner />
    </Suspense>
  );
}

function SecurityPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const required = searchParams.get('required') === 'mfa';
  const next = searchParams.get('next') || '/v4/dashboard';

  // Page state
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState([]);
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  // Enrollment-in-progress state
  const [enrolling, setEnrolling] = useState(null); // { factorId, qrSvg, secret }
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const refresh = async () => {
    setError('');
    if (!supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }
    const { data: { user: u } } = await supabase.auth.getUser();
    setUser(u);
    const { data: list, error: lerr } = await supabase.auth.mfa.listFactors();
    if (lerr) setError(lerr.message);
    // listFactors returns all factors; the .totp / .phone sub-arrays are
    // already filtered + sorted. Concatenate for unified display.
    const all = [...(list?.totp || []), ...(list?.phone || [])];
    setFactors(all);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startEnroll = async () => {
    setError('');
    setCode('');
    // friendlyName helps the user identify which factor is which on
    // the management list (and in the auth-events timeline).
    const friendlyName = `Authenticator (${new Date().toLocaleDateString('en-GB')})`;
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setEnrolling({
      factorId: data.id,
      qrSvg: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  };

  const cancelEnroll = async () => {
    // Clean up the un-verified factor so it doesn't clutter the user's
    // record. Unenroll silently — if it fails we just leave the orphan.
    if (enrolling?.factorId) {
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }).then(null, () => {});
    }
    setEnrolling(null);
    setCode('');
  };

  const verifyEnroll = async () => {
    if (!enrolling) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setVerifying(true);
    setError('');
    // challenge() then verify() — two steps, as the API requires.
    const { data: chal, error: cerr } = await supabase.auth.mfa.challenge({
      factorId: enrolling.factorId,
    });
    if (cerr) {
      setError(cerr.message);
      setVerifying(false);
      return;
    }
    const { error: verr } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: chal.id,
      code,
    });
    setVerifying(false);
    if (verr) {
      setError(verr.message || 'Verification failed. Check the code and try again.');
      // Log the failure for the audit timeline.
      supabase.rpc('log_auth_event', {
        event_type: 'mfa_failed',
        details: { phase: 'enrollment', factor_id: enrolling.factorId },
      }).then(null, () => {});
      return;
    }
    // Success — log the enrollment, refresh the list, redirect if we
    // came here for a required check.
    supabase.rpc('log_auth_event', {
      event_type: 'mfa_enrolled',
      details: { factor_id: enrolling.factorId, factor_type: 'totp' },
    }).then(null, () => {});
    setEnrolling(null);
    setCode('');
    await refresh();
    if (required) {
      router.push(next);
    }
  };

  const removeFactor = async (factorId) => {
    if (!(await confirmDialog({ message: 'Remove this authenticator? You\'ll need to enrol another before signing into admin areas again.', danger: true }))) return;
    setError('');
    const { error: uerr } = await supabase.auth.mfa.unenroll({ factorId });
    if (uerr) {
      setError(uerr.message);
      return;
    }
    await refresh();
  };

  if (loading) {
    return <PageShell><div style={{ color: '#94a3b8' }}>Loading…</div></PageShell>;
  }

  return (
    <PageShell>
      <h1 style={h1}>Security</h1>
      {user?.email && (
        <p style={{ color: '#94a3b8', marginTop: -8, marginBottom: 24, fontSize: 14 }}>
          Signed in as <strong style={{ color: '#cbd5e1' }}>{user.email}</strong>
        </p>
      )}

      {required && factors.length === 0 && (
        <div style={requiredBanner}>
          <strong style={{ color: '#fbbf24' }}>Two-factor authentication is required</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#cbd5e1' }}>
            Platform admin accounts must have 2FA enrolled. Set up an authenticator
            below to continue.
          </p>
        </div>
      )}

      <section style={section}>
        <h2 style={h2}>Two-factor authentication (TOTP)</h2>
        <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.55 }}>
          Use an authenticator app such as <strong>Google Authenticator</strong>,
          <strong> 1Password</strong>, <strong>Authy</strong>, or your password manager's
          built-in TOTP support. After scanning the QR code, you'll need to enter a
          fresh 6-digit code to confirm.
        </p>

        {factors.length === 0 && !enrolling && (
          <button onClick={startEnroll} style={btnPrimary}>
            Set up authenticator
          </button>
        )}

        {factors.length > 0 && !enrolling && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
              ENROLLED AUTHENTICATORS
            </div>
            {factors.map(f => (
              <div key={f.id} style={factorRow}>
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 500 }}>
                    {f.friendly_name || 'Authenticator'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {f.factor_type} · enrolled {new Date(f.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <button onClick={() => removeFactor(f.id)} style={btnDanger}>
                  Remove
                </button>
              </div>
            ))}
            <button onClick={startEnroll} style={{ ...btnSubtle, marginTop: 8 }}>
              Add another authenticator
            </button>
          </div>
        )}

        {enrolling && (
          <div style={{ marginTop: 16, padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--r-md)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'white', margin: '0 0 12px' }}>
              Step 1 — Scan the QR code
            </h3>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ background: 'white', padding: 12, borderRadius: 'var(--r-md)', width: 200, height: 200, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Supabase returns totp.qr_code as a data: URI (image/svg+xml),
                    not raw SVG markup — render it as an image so it scales to
                    fit rather than overflowing and covering the controls below. */}
                <img src={enrolling.qrSvg} alt="Two-factor authentication QR code" width={176} height={176} style={{ display: 'block', width: 176, height: 176 }} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                  Can't scan? Enter this secret manually in your authenticator app:
                </div>
                <div style={{
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: 'var(--r-sm)',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 13,
                  color: '#67e8f9',
                  wordBreak: 'break-all',
                  userSelect: 'all',
                }}>
                  {enrolling.secret}
                </div>
              </div>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'white', margin: '20px 0 12px' }}>
              Step 2 — Enter the 6-digit code your app shows
            </h3>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && code.length === 6 && verifyEnroll()}
              placeholder="123456"
              style={otpInput}
              maxLength={6}
            />

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={verifyEnroll} disabled={verifying || code.length !== 6} style={{
                ...btnPrimary,
                opacity: (verifying || code.length !== 6) ? 0.4 : 1,
                cursor: (verifying || code.length !== 6) ? 'not-allowed' : 'pointer',
              }}>
                {verifying ? 'Verifying…' : 'Verify + enrol'}
              </button>
              <button onClick={cancelEnroll} style={btnSubtle}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div style={errorBox}>{error}</div>
        )}
      </section>

      <p style={{ color: '#475569', fontSize: 12, marginTop: 32, textAlign: 'center' }}>
        <Link href="/v4/dashboard" style={{ color: '#94a3b8' }}>← Back to dashboard</Link>
      </p>
    </PageShell>
  );
}

// ─── Layout shell ──────────────────────────────────────────────────────
function PageShell({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: '32px 24px 64px',
      fontFamily: "'DM Sans', system-ui, sans-serif",
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────
const h1 = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: 32, fontWeight: 500, color: 'white',
  marginBottom: 8,
};
const h2 = {
  fontFamily: "'Outfit', sans-serif",
  fontSize: 18, fontWeight: 500, color: 'white',
  marginBottom: 8,
};
const section = {
  padding: 24,
  background: 'rgba(15,23,42,0.6)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 'var(--r-lg)',
  marginTop: 16,
};
const requiredBanner = {
  padding: 14,
  background: 'rgba(251,191,36,0.08)',
  border: '1px solid rgba(251,191,36,0.3)',
  borderRadius: 'var(--r-md)',
  marginBottom: 16,
};
const factorRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: 12,
  background: 'rgba(255,255,255,0.02)',
  borderRadius: 'var(--r-md)',
  marginBottom: 6,
};
const otpInput = {
  width: '100%', maxWidth: 200,
  padding: '12px 16px',
  background: 'rgba(0,0,0,0.3)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--r-md)',
  color: 'white',
  fontFamily: "'Space Mono', monospace",
  fontSize: 22,
  letterSpacing: 4,
  textAlign: 'center',
};
const btnPrimary = {
  padding: '10px 18px',
  background: '#0891b2',
  color: 'white',
  border: 'none',
  borderRadius: 'var(--r-md)',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  marginTop: 12,
};
const btnSubtle = {
  padding: '10px 18px',
  background: 'rgba(255,255,255,0.05)',
  color: '#cbd5e1',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--r-md)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnDanger = {
  padding: '6px 12px',
  background: 'rgba(239,68,68,0.1)',
  color: '#fca5a5',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 'var(--r-sm)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const errorBox = {
  marginTop: 14,
  padding: '10px 14px',
  background: 'rgba(239,68,68,0.1)',
  border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 'var(--r-md)',
  color: '#fca5a5',
  fontSize: 13,
};
