'use client';
export const dynamic = 'force-dynamic';

// /v4/signup
//
// Two-stage flow:
//   1. Form     → name + email + password + confirm. Submit calls
//                 supabase.auth.signUp.
//   2. Verify   → 6-digit code input. Supabase sends the code to the
//                 user's email; they paste it back in. supabase.auth.
//                 verifyOtp({ type: 'signup' }) confirms the email and
//                 returns a session in one go.
//
// Why a code instead of a magic link:
//   - Survives the email-client → new-tab → "wait, where was I?"
//     handoff that breaks magic links, especially when the signup
//     started from an invite landing page.
//   - Easier to debug ("did the code arrive?" "yes, here it is").
//   - User stays on the same tab/device for the whole flow.
//
// Invite-aware redirects:
//   - ?email=  → pre-fills the email field. Editable (in case they
//                want to use a different address than the one the
//                invite was sent to — they can, the invite landing
//                page handles the "wrong email" case).
//   - ?next=   → where to go AFTER successful verification. Defaults
//                to /v4/dashboard. Used by the invite landing page so
//                a fresh signup-from-invite lands back on the invite
//                page to accept it.
//
// Email delivery note: Supabase's built-in email sender is rate-limited
// (3-4 per hour, project-wide) and frequently spam-filtered. For real
// use, a custom SMTP provider (Resend, SendGrid) needs to be configured
// in Supabase Auth → Settings → SMTP, AND the "Confirm signup" email
// template needs to include {{ .Token }} so the 6-digit code reaches
// the user.

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f, isPasswordValid, PasswordChecklist } from '../_lib/auth-ui';
import { getSiteUrl } from '@/lib/site-url';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const emailParam = searchParams.get('email') || '';
  const next = searchParams.get('next') || '/v4/dashboard';

  const [stage, setStage] = useState('form'); // 'form' | 'verify'

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [code, setCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resentAt, setResentAt] = useState(null);

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!lastName.trim()) { setError('Please enter your surname.'); return; }
    if (!isPasswordValid(password)) {
      setError('Password must be at least 8 characters and include a letter and a digit.');
      return;
    }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!supabase) { setError('Supabase not configured. Check Vercel environment variables.'); return; }

    setLoading(true);
    const combinedName = `${firstName.trim()} ${lastName.trim()}`.trim();
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim() || null,
          last_name: lastName.trim(),
          name: combinedName,
        },
        // Magic link in the email also works as a fallback — some users
        // will click the link instead of typing the code. Both paths
        // land in the right place via /auth/callback?next=...
        // Use getSiteUrl so the link points at the stable preview /
        // production alias rather than the per-deployment Vercel URL
        // (which 404s once newer deployments retire it).
        emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);

    if (err) { setError(err.message); return; }

    // If Supabase returned a session immediately, email confirmation is
    // OFF in the project. Skip the verify stage.
    if (data.session) {
      router.push(next);
      router.refresh();
      return;
    }
    setStage('verify');
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    const token = code.trim();
    if (token.length < 6) {
      setError('Enter the verification code from the email (it should be 6 to 10 digits).');
      return;
    }
    setVerifyLoading(true);
    const { data, error: err } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    });
    setVerifyLoading(false);
    if (err) {
      // The default Supabase message for stale codes is "Token has
      // expired or is invalid" which is technically correct but
      // misleading — the most common cause isn't expiry but rather
      // a previous resend (or duplicate signup attempt) invalidating
      // the old token. Replace it with something the user can act on.
      const raw = String(err.message || '').toLowerCase();
      if (raw.includes('expired') || raw.includes('invalid') || raw.includes('not found')) {
        setError(
          'This code didn\'t work. If you signed up more than once or clicked Resend, only the most recent code is valid — check your inbox for the latest email and try again. If you\'re sure you\'re using the most recent code, click Resend.'
        );
      } else {
        setError(err.message);
      }
      return;
    }
    if (data?.session) {
      router.push(next);
      router.refresh();
    } else {
      setError('Verified, but no session was returned. Try signing in.');
    }
  };

  // Resend cooldown: Supabase rate-limits auth.resend per user (typically
  // 60s between attempts). Without explicit handling the user clicks the
  // button, gets a generic error message, and assumes nothing happened.
  // We track an explicit cooldown locally so the button disables and
  // shows seconds remaining.
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(Date.now());
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setCooldownNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldownUntil]);
  const cooldownSecsLeft = Math.max(0, Math.ceil((cooldownUntil - cooldownNow) / 1000));

  const handleResend = async () => {
    setError('');
    setResendBusy(true);
    setResentAt(null);
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        // Same emailRedirectTo as the original signup so the magic link
        // in the resent email points at the stable site (preview /
        // production), not whichever transient deployment URL the
        // browser happened to be on. Without this Supabase falls back
        // to the project's Site URL config, which may not have ?next=
        // wired up for invite-aware redirects.
        emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setResendBusy(false);
    if (err) {
      // Supabase rate-limit message looks like "For security purposes,
      // you can only request this after Ns." — extract the seconds and
      // start a local cooldown so the UI is honest about what to do.
      const m = String(err.message || '').match(/after\s+(\d+)\s*seconds?/i);
      if (m) {
        const secs = parseInt(m[1], 10);
        setCooldownUntil(Date.now() + secs * 1000);
        setError(`Hold on — Supabase asks us to wait ${secs} seconds between resends. Try again in a moment.`);
      } else {
        setError(err.message || 'Resend failed. Try again in a moment.');
      }
      return;
    }
    // Soft cooldown after a successful resend too — Supabase's next
    // resend would be rate-limited anyway, so disable the button for
    // 60s rather than have the user click it three times in a panic.
    setCooldownUntil(Date.now() + 60_000);
    setResentAt(new Date());
  };

  // Auto-focus the code field when entering verify stage
  useEffect(() => {
    if (stage === 'verify') {
      const t = setTimeout(() => {
        const el = document.getElementById('verify-code-input');
        if (el) el.focus();
      }, 50);
      return () => clearTimeout(t);
    }
  }, [stage]);

  // ─── Verify stage ─────────────────────────────────────────────────
  if (stage === 'verify') {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a verification code to ${email}`}>
        <form onSubmit={handleVerify}>
          {error && <div style={f.errorBox}>{error}</div>}
          {resentAt && !error && (
            <div style={f.successBox}>
              New code sent. Check your inbox (and spam folder, just in case).
            </div>
          )}

          <div style={f.field}>
            <label style={f.label}>Verification code</label>
            <input
              id="verify-code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              required
              value={code}
              // Strip non-digits so paste-with-spaces works.
              // Supabase OTPs are 6-10 digits depending on the project's
              // Auth → Providers → Email → Email OTP Length setting.
              // We accept anything in that range and let verifyOtp do
              // the actual validation.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
              style={{
                ...f.input,
                fontSize: 20,
                letterSpacing: '0.3em',
                textAlign: 'center',
                fontFamily: "'Space Mono', monospace",
              }}
              placeholder="6 to 10 digits"
            />
          </div>

          <button
            type="submit"
            disabled={verifyLoading || code.length < 6}
            style={{ ...f.button, ...((verifyLoading || code.length < 6) ? f.buttonDisabled : {}) }}
          >
            {verifyLoading ? 'Verifying…' : 'Verify and continue'}
          </button>

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
              No code? Check your spam folder.
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendBusy || cooldownSecsLeft > 0}
                style={{
                  padding: '6px 12px', fontSize: 12,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6, color: '#cbd5e1',
                  cursor: (resendBusy || cooldownSecsLeft > 0) ? 'not-allowed' : 'pointer',
                  opacity: (resendBusy || cooldownSecsLeft > 0) ? 0.5 : 1,
                }}
              >
                {resendBusy ? 'Sending…' : (cooldownSecsLeft > 0 ? `Resend in ${cooldownSecsLeft}s` : 'Resend code')}
              </button>
              <button
                type="button"
                onClick={() => { setStage('form'); setCode(''); setError(''); }}
                style={{
                  padding: '6px 12px', fontSize: 12,
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            </div>
          </div>
        </form>
      </AuthCard>
    );
  }

  // ─── Form stage ───────────────────────────────────────────────────
  // Build the "Sign in" link preserving query params
  const loginQs = new URLSearchParams();
  if (emailParam) loginQs.set('email', emailParam);
  if (next !== '/v4/dashboard') loginQs.set('next', next);
  const loginHref = '/v4/login' + (loginQs.toString() ? `?${loginQs.toString()}` : '');

  return (
    <AuthCard title="Create your account" subtitle="v4 preview — for testing only">
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ ...f.field, flex: 1 }}>
            <label style={f.label}>Forename</label>
            <input
              type="text" autoComplete="given-name" value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={f.input} placeholder="Jane"
            />
          </div>
          <div style={{ ...f.field, flex: 1 }}>
            <label style={f.label}>Surname *</label>
            <input
              type="text" required autoComplete="family-name" value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              style={f.input} placeholder="Smith"
            />
          </div>
        </div>

        <div style={f.field}>
          <label style={f.label}>Email</label>
          <input
            type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={f.input} placeholder="you@practice.nhs.uk"
          />
        </div>

        <div style={f.field}>
          <label style={f.label}>Password</label>
          <input
            type="password" required autoComplete="new-password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={f.input} placeholder="At least 8 characters"
          />
          <PasswordChecklist password={password} />
        </div>

        <div style={f.field}>
          <label style={f.label}>Confirm password</label>
          <input
            type="password" required autoComplete="new-password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{ ...f.input, borderColor: passwordsMatch ? f.input.border : 'rgba(239,68,68,0.5)' }}
            placeholder="Re-enter your password"
          />
          {!passwordsMatch && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5' }}>Passwords don't match yet.</div>
          )}
        </div>

        <button
          type="submit" disabled={loading}
          style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>

        <div style={f.footerLink}>
          Already have an account? <Link href={loginHref} style={f.link}>Sign in</Link>
        </div>
      </form>
    </AuthCard>
  );
}
