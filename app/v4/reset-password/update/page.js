'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { mapAuthError } from '@/lib/friendly-errors';
import { AuthCard, formStyles as f, isPasswordValid, PasswordChecklist } from '../../_lib/auth-ui';

export default function ResetPasswordUpdatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  // Establish a session from the reset link. Supabase can deliver the
  // recovery in three shapes depending on project/email-template config:
  //   1. PKCE:        ?code=...                  -> exchangeCodeForSession
  //   2. token_hash:  ?token_hash=...&type=recovery -> verifyOtp
  //   3. legacy hash: #access_token=...&type=recovery (handled automatically
  //      by the client's detectSessionInUrl, surfaced via getSession)
  // The previous version only did getSession(), so links of the first two
  // (now-default) shapes always showed "invalid" even when perfectly valid.
  useEffect(() => {
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    let cancelled = false;

    const establish = async () => {
      // Already signed in (returning to the page, or the callback route
      // already exchanged the link)? Then we are ready.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (!cancelled) {
          setReady(true);
          try {
            const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
              const { data: factors } = await supabase.auth.mfa.listFactors();
              const totp = factors?.totp?.[0];
              if (totp && !cancelled) setMfaFactorId(totp.id);
            }
          } catch { /* no MFA - nothing to do */ }
        }
        return;
      }

      // Otherwise complete the exchange here as a fallback. PKCE links
      // carry ?code=; token_hash links carry ?token_hash=&type=. The
      // /auth/callback route normally does this first, but handling it
      // here too means the page works whichever way the link is built.
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const tokenHash = url.searchParams.get('token_hash');
      const type = url.searchParams.get('type') || 'recovery';

      try {
        if (code) {
          const { error: err } = await supabase.auth.exchangeCodeForSession(code);
          if (err) throw err;
        } else if (tokenHash) {
          const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
          if (err) throw err;
        } else {
          await new Promise(r => setTimeout(r, 600));
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (!s2) throw new Error('no-link');
        }
        if (!cancelled) {
          setReady(true);
          window.history.replaceState({}, '', '/v4/reset-password/update');
          try {
            const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
              const { data: factors } = await supabase.auth.mfa.listFactors();
              const totp = factors?.totp?.[0];
              if (totp && !cancelled) setMfaFactorId(totp.id);
            }
          } catch { /* no MFA - nothing to do */ }
        }
      } catch {
        if (!cancelled) setError('Invalid or expired reset link. Please request a new one.');
      }
    };

    establish();
    return () => { cancelled = true; };
  }, [supabase]);

  // Two-factor step: if the account has an authenticator enrolled, the
  // session must be lifted with a 6-digit code before a password change is
  // allowed. Detect that and ask inline, instead of letting the change
  // fail with a jargon error.
  const [mfaFactorId, setMfaFactorId] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  const passwordsMatch = !confirmPassword || password === confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!supabase) {
      setError('Supabase not configured.');
      return;
    }
    if (!isPasswordValid(password)) {
      setError('Password must be at least 8 characters and include a letter and a digit.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (mfaFactorId && mfaCode.length !== 6) {
      setError('Your account is protected by two-factor authentication. Enter the 6-digit code from your authenticator app in the field above, then save.');
      return;
    }
    setLoading(true);
    if (mfaFactorId) {
      const { error: mfaErr } = await supabase.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode });
      if (mfaErr) {
        setLoading(false);
        setError(mapAuthError(mfaErr.message));
        return;
      }
    }
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(mapAuthError(err.message));
    } else {
      // Audit: log the password change. User is signed in at this
      // point (the reset link gave them a session), so auth.uid()
      // resolves correctly inside the RPC.
      supabase.rpc('log_auth_event', {
        event_type: 'password_changed',
        details: { via: 'reset_link' },
      }).then(null, () => {});
      router.push('/v4/dashboard');
      router.refresh();
    }
  };

  return (
    <AuthCard title="Set new password" subtitle="Choose a strong password">
      <form onSubmit={handleSubmit}>
        {error && <div style={f.errorBox}>{error}</div>}
        {mfaFactorId && (
          <div style={f.field}>
            <label style={f.label}>Authenticator code</label>
            <input
              style={f.input}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
            />
            <p className="text-caption text-mid mt-1.5">
              Your account has two-factor authentication, so a code from your authenticator app is needed to change the password.
            </p>
          </div>
        )}

        <div style={f.field}>
          <label style={f.label}>New password</label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={f.input}
            placeholder="At least 8 characters"
            disabled={!ready}
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
              borderColor: passwordsMatch ? f.input.border : 'rgba(239,68,68,0.5)',
            }}
            placeholder="Re-enter password"
            disabled={!ready}
          />
          {!passwordsMatch && (
            <div className="mt-1.5 text-caption text-red-300">
              Passwords don't match yet.
            </div>
          )}
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
