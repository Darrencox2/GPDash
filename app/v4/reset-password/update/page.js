'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { AuthCard, formStyles as f } from '../../_lib/auth-ui';

export default function ResetPasswordUpdatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  // Check that we have a session — the user should arrive here from a reset link
  useEffect(() => {
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else setError('Invalid or expired reset link. Please request a new one.');
    });
  }, [supabase]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      router.push('/v4/dashboard');
      router.refresh();
    }
  };

  return (
    <AuthCard title="Set new password" subtitle="Choose a strong password">
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}

        <div style={f.field}>
          <label style={f.label}>New password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={f.input}
            placeholder="At least 8 characters"
            disabled={!ready}
          />
        </div>

        <div style={f.field}>
          <label style={f.label}>Confirm password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={f.input}
            placeholder="Re-enter password"
            disabled={!ready}
          />
        </div>

        <button
          type="submit"
          disabled={loading || !ready}
          style={{ ...f.button, ...((loading || !ready) ? f.buttonDisabled : {}) }}
        >
          {loading ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </AuthCard>
  );
}
