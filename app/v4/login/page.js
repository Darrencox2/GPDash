'use client';
export const dynamic = 'force-dynamic';

// /v4/login
//
// Standard email + password sign-in. Reads ?email= for pre-fill and
// ?next= for post-login redirect — both used by the invite landing
// page so a sign-in started from an invite returns to the invite page
// to accept it. Falls back to /v4/dashboard if no ?next= given.

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f } from '../_lib/auth-ui';

export default function LoginPage() {
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
    setLoading(false);
    if (err) {
      setError(err.message);
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
      </form>
    </AuthCard>
  );
}
