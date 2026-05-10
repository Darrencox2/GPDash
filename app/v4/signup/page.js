'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f, isPasswordValid, PasswordChecklist } from '../_lib/auth-ui';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  // We only show the password mismatch warning *after* the user has typed
  // something into the confirm field — typing both fields character-by-
  // character would otherwise scream "passwords do not match!" the entire
  // time, which is noise.
  const passwordsMatch = !confirmPassword || password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isPasswordValid(password)) {
      setError('Password must be at least 8 characters and include a letter and a digit.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!supabase) {
      setError('Supabase not configured. Check Vercel environment variables.');
      return;
    }

    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/v4/dashboard`,
      },
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // If email confirmation is required, Supabase returns a user but no session
    if (data.user && !data.session) {
      setNeedsVerification(true);
    } else {
      // Email confirmation off — sign in is immediate
      router.push('/v4/dashboard');
      router.refresh();
    }
  };

  if (needsVerification) {
    return (
      <AuthCard title="Check your email" subtitle="We sent you a verification link">
        <div style={f.successBox}>
          A verification email has been sent to <strong>{email}</strong>. Click the link in
          the email to activate your account, then come back here to sign in.
        </div>
        <Link href="/v4/login" style={{ ...f.link, ...f.footerLink }}>← Back to sign in</Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account" subtitle="v4 preview — for testing only">
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}

        <div style={f.field}>
          <label style={f.label}>Your name</label>
          <input
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={f.input}
            placeholder="Dr Jane Smith"
          />
        </div>

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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={f.input}
            placeholder="At least 8 characters"
          />
          <PasswordChecklist password={password} />
        </div>

        <div style={f.field}>
          <label style={f.label}>Confirm password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={{
              ...f.input,
              // Subtle red ring when the user has typed something AND it
              // doesn't match — avoids flagging an empty field as wrong.
              borderColor: passwordsMatch ? f.input.border : 'rgba(239,68,68,0.5)',
            }}
            placeholder="Re-enter your password"
          />
          {!passwordsMatch && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5' }}>
              Passwords don't match yet.
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{ ...f.button, ...(loading ? f.buttonDisabled : {}) }}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>

        <div style={f.footerLink}>
          Already have an account? <Link href="/v4/login" style={f.link}>Sign in</Link>
        </div>
      </form>
    </AuthCard>
  );
}
