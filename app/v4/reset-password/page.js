'use client';
export const dynamic = 'force-dynamic';
import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f } from '../_lib/auth-ui';
import { getSiteUrl } from '@/lib/site-url';

// Suspense wrapper: Next requires one around any client component using
// useSearchParams, same as login and signup.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthCard title="Reset your password">{null}</AuthCard>}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}

function ResetPasswordPageInner() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  // /auth/callback sends spent or expired recovery links here with
  // ?error=link_expired, and nothing read it - the user arrived at an
  // ordinary form with no clue why their link had not worked.
  const errorParam = searchParams.get('error') || '';
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    errorParam === 'link_expired'
      ? 'That reset link has expired or had already been used - links in email are often opened by a scanner first, which spends them. Enter your email below for a fresh code.'
      : ''
  );
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase not configured. Check Vercel environment variables.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getSiteUrl()}/v4/reset-password/update`,
      });
      if (err) {
        // Always show something — some gateway-level failures carry an
        // empty message, which previously rendered as no box at all.
        setError(err.message || `Reset request failed (${err.status || 'no status'}). Please try again or contact support.`);
        return;
      }
      // Audit: log the reset request. anon execute is granted on
      // log_auth_event for exactly this case — the request happens
      // before sign-in. Don't disclose whether the email exists
      // (resetPasswordForEmail itself doesn't either), just record
      // the request.
      supabase.rpc('log_auth_event', {
        event_type: 'password_reset_requested',
        email,
        details: null,
      }).then(null, () => {});
      setSent(true);
    } catch (e) {
      // An exception here previously vanished — surface it instead.
      setError(`Unexpected error: ${e?.message || String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // 6-digit code path. NHS mailboxes run Microsoft Defender Safe Links,
  // which OPENS emailed links to scan them - consuming the one-time reset
  // link before the user can click it. The emailed code cannot be consumed
  // by a scanner, so it always works. verifyOtp establishes a session; the
  // update page then finds it via getSession and lets the user set a new
  // password.
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    setVerifying(true);
    try {
      const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
      if (err) {
        setError(/expired|invalid/i.test(err.message || '')
          ? 'That code is not right or has expired. Check the newest email, or request a fresh one below.'
          : (err.message || 'Could not verify the code.'));
        return;
      }
      router.push('/v4/reset-password/update');
    } catch (e2) {
      setError(e2?.message || 'Unexpected error verifying the code.');
    } finally {
      setVerifying(false);
    }
  };

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle="Enter the 6-digit code from the email">
        <div style={f.successBox}>
          If an account exists for <strong>{email}</strong>, an email is on its way containing a
          6-digit code. Enter the code below. (The email also contains a link, but on NHS and
          other scanned mailboxes the link is often used up by the virus scanner - the code
          always works.)
        </div>
        {error && <div style={f.errorBox}>{error}</div>}
        <form onSubmit={handleVerifyCode}>
          <div style={f.field}>
            <label style={f.label}>6-digit code</label>
            <input
              style={f.input}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              required
            />
          </div>
          <button
            type="submit"
            style={verifying || code.length !== 6 ? f.buttonDisabled : f.button}
            disabled={verifying || code.length !== 6}
          >
            {verifying ? 'Checking code…' : 'Verify code and continue'}
          </button>
        </form>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...f.link, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 12 }}
        >
          {loading ? 'Sending…' : 'Send a fresh code'}
        </button>
        <Link href="/v4/login" style={{ ...f.link, ...f.footerLink }}>← Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset password" subtitle="Enter your email to receive a reset link">
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

        <button
          type="submit"
          disabled={loading}
          style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
        >
          {loading ? 'Sending...' : 'Send reset link'}
        </button>

        <Link href="/v4/login" style={{ ...f.link, ...f.footerLink }}>← Back to sign in</Link>
      </form>
    </AuthCard>
  );
}
