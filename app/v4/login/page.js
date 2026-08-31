'use client';
export const dynamic = 'force-dynamic';

// /v4/login
//
// Standard email + password sign-in. Reads ?email= for pre-fill and
// ?next= for post-login redirect — both used by the invite landing
// page so a sign-in started from an invite returns to the invite page
// to accept it. Falls back to /v4/dashboard if no ?next= given.

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { mapAuthError } from '@/lib/friendly-errors';
import { AuthCard, formStyles as f } from '../_lib/auth-ui';
import { getSiteUrl } from '@/lib/site-url';

// Outer wrapper provides the Suspense boundary that Next 15 requires
// around any client component using useSearchParams() (was a build
// warning in Next 14, a build error in 15). The inner component does
// the real work; the fallback is a minimal placeholder since this
// page renders quickly once the search params resolve.
export default function LoginPage() {
  return (
    <Suspense fallback={<AuthCard title="Sign in">{null}</AuthCard>}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const emailParam = searchParams.get('email') || '';
  const next = searchParams.get('next') || '/v4/dashboard';

  // /auth/callback sends failures here with ?error=... and nothing read
  // it, so a user whose confirmation link had already been spent (NHS
  // mail scanners open links before the human does) landed on a clean
  // login form with no idea what had happened.
  const CALLBACK_ERRORS = {
    callback_failed: 'That link could not be used. Links in email are often opened by a scanner before you get to them, which uses them up. If you were confirming a new account, sign in below - or enter your email and we will send a fresh confirmation.',
    link_expired: 'That link has expired. Request a fresh one below.',
  };
  const errorParam = searchParams.get('error') || '';

  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(CALLBACK_ERRORS[errorParam] || '');

  // "Email not confirmed" used to be a dead end: the message told people
  // to find an email that, in every case we have seen, never arrived.
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [confirmSent, setConfirmSent] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const resendConfirmation = async () => {
    if (!supabase || !email) return;
    setConfirmBusy(true); setConfirmSent('');
    const { error: err } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setConfirmBusy(false);
    if (err) { setError(mapAuthError(err.message)); return; }
    setConfirmSent('Confirmation email sent. It contains a 6-digit code and a link - either works. Check your junk folder too.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase not configured. Check Vercel environment variables.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setLoading(false);
      setError(mapAuthError(err.message));
      setNeedsConfirm(/email not confirmed/i.test(String(err.message || '')));
      // Audit: failed login attempt. Logged anonymously (no auth.uid()
      // because sign-in failed) — log_auth_event grants execute to
      // 'anon' specifically for this case. Best-effort; don't block
      // the error UX on a logging failure.
      supabase.rpc('log_auth_event', {
        event_type: 'failed_login',
        email,
        details: { reason: err.message },
      }).then(null, () => {});
      return;
    }

    // Audit: successful login. Now signed in so auth.uid() resolves
    // and the row is attributed to the right user.
    supabase.rpc('log_auth_event', {
      event_type: 'login',
      email,
      details: null,
    }).then(null, () => {});

    // Check whether MFA is required for this account. getAuthenticatorAssuranceLevel
    // returns:
    //   currentLevel = the level we're at right now
    //   nextLevel    = the level we should be at
    // If they don't match, the user has MFA enrolled but hasn't proved it
    // this session — bounce them to the challenge page before continuing.
    // requireAdmin in lib/admin-guard.js also enforces this server-side
    // when an admin page is requested, but doing it here too gives a
    // cleaner UX (one redirect, not a flash of the destination page
    // before the server redirect kicks in).
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    setLoading(false);
    if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      router.push(`/v4/mfa-verify?next=${encodeURIComponent(next)}`);
      router.refresh();
      return;
    }

    router.push(next);
    router.refresh();
  };

  // Build the "Sign up" link preserving query params so the invite-from-
  // signup flow stays connected if they bounce between the two pages.
  const signupQs = new URLSearchParams();
  if (emailParam) signupQs.set('email', emailParam);
  if (next !== '/v4/dashboard') signupQs.set('next', next);
  const signupHref = '/v4/signup' + (signupQs.toString() ? `?${signupQs.toString()}` : '');

  return (
    <AuthCard title="Sign in to GPDash" subtitle="Practice rota, capacity and huddle dashboard">
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}
        {(needsConfirm || errorParam === 'callback_failed') && !confirmSent && (
          <button
            type="button" onClick={resendConfirmation} disabled={confirmBusy || !email}
            style={{ display: 'block', width: '100%', marginBottom: 12, padding: '9px 12px', fontSize: 13,
              background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.45)',
              color: '#a5b4fc', borderRadius: 8, cursor: confirmBusy ? 'default' : 'pointer', opacity: email ? 1 : 0.5 }}
          >
            {confirmBusy ? 'Sending…' : 'Send me a new confirmation email'}
          </button>
        )}
        {confirmSent && <div style={{ ...f.errorBox, background: 'rgba(16,185,129,0.10)', borderColor: 'rgba(16,185,129,0.45)', color: '#6ee7b7' }}>{confirmSent}</div>}

        <div style={f.field}>
          <label style={f.label}>Email</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={f.input}
            placeholder="you@practice.nhs.uk"
          />
        </div>

        <div style={f.field}>
          <label style={f.label}>Password</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={f.input}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        {/* Two real next steps share one row; the legal link is demoted
            below so all three no longer compete at the same weight. */}
        <div style={{ ...f.footerLink, display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/v4/reset-password" style={f.link}>Forgot password?</Link>
          <span aria-hidden="true" style={{ color: 'rgba(255,255,255,0.18)' }}>·</span>
          <span>No account? <Link href={signupHref} style={f.link}>Sign up</Link></span>
        </div>
        <div style={{ ...f.footerLink, fontSize: 12, marginTop: 18 }}>
          <Link href="/privacy" style={f.linkMuted}>Privacy notice</Link>
        </div>
      </form>
    </AuthCard>
  );
}
