'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f } from '../_lib/auth-ui';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
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
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={f.input}
            placeholder="At least 8 characters"
          />
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
