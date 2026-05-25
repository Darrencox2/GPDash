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
import { AuthCard, formStyles as f } from '../_lib/auth-ui';

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

  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      setError(err.message);
      // Audit: failed login attempt. Logged anonymously (no auth.uid()
      // because sign-in failed) — log_auth_event grants execute to
      // 'anon' specifically for this case. Best-effort; don't block
      // the error UX on a logging failure.
      supabase.rpc('log_auth_event', {
        event_type: 'failed_login',
        email,
        details: { reason: err.message },
      }).catch(() => {});
      return;
    }

    // Audit: successful login. Now signed in so auth.uid() resolves
    // and the row is attributed to the right user.
    supabase.rpc('log_auth_event', {
      event_type: 'login',
      email,
      details: null,
    }).catch(() => {});

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
    <AuthCard title="Sign in to GPDash" subtitle="v4 preview — for testing only">
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}

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

        <div style={f.footerLink}>
          <Link href="/v4/reset-password" style={f.link}>Forgot password?</Link>
        </div>
        <div style={f.footerLink}>
          No account? <Link href={signupHref} style={f.link}>Sign up</Link>
        </div>
        <div style={{ ...f.footerLink, fontSize: 11, opacity: 0.75, marginTop: 12 }}>
          <Link href="/privacy" style={f.link}>Privacy notice</Link>
        </div>
      </form>
    </AuthCard>
  );
}
