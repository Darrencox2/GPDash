'use client';
export const dynamic = 'force-dynamic';

// /v4/mfa-verify — challenge step for users with MFA enrolled
//
// Reached when: a user has signed in with password (AAL1) but has a
// TOTP factor enrolled. Required to lift them to AAL2 before they
// can access /v4/admin/* (enforced by lib/admin-guard.js) and any
// other AAL2-protected area we add later.
//
// Flow:
//   1. Load the user's TOTP factors via listFactors()
//   2. Auto-pick the first one (most users will have just one)
//   3. Call challenge() to get a challengeId
//   4. User enters 6-digit code; we call verify() to lift to AAL2
//   5. On success, redirect to ?next= or /v4/dashboard
//
// Failed attempts log mfa_failed via log_auth_event so admins can spot
// patterns (someone trying to brute-force a TOTP code) in the auth
// timeline. Successful challenges log mfa_challenged.

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { mapAuthError } from '@/lib/friendly-errors';
import { AuthCard, formStyles as f } from '../_lib/auth-ui';

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={<AuthCard title="Two-factor verification">{null}</AuthCard>}>
      <MfaVerifyInner />
    </Suspense>
  );
}

function MfaVerifyInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const next = searchParams.get('next') || '/v4/dashboard';

  const [factorId, setFactorId] = useState(null);
  const [challengeId, setChallengeId] = useState(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // On mount: find the factor, issue a challenge so the form is ready
  // to verify the moment the user pastes their code in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supabase) { setError('Supabase not configured'); setLoading(false); return; }
      const { data: list, error: lerr } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (lerr || !list?.totp || list.totp.length === 0) {
        // No factor — shouldn't have been sent here; bounce back.
        router.replace('/v4/security?required=mfa');
        return;
      }
      // Pick the first verified TOTP factor (Supabase already filters to
      // verified ones in the .totp list).
      const factor = list.totp[0];
      setFactorId(factor.id);
      // Issue the challenge eagerly so verify() doesn't need a round-trip
      // when the user submits.
      const { data: chal, error: cerr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
      if (cancelled) return;
      if (cerr) { setError(cerr.message); setLoading(false); return; }
      setChallengeId(chal.id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verify = async () => {
    if (!factorId || !challengeId) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setVerifying(true);
    setError('');
    const { error: verr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code,
    });
    if (verr) {
      setError('Code incorrect or expired. Try the next code from your app.');
      setVerifying(false);
      setCode('');
      // Audit: failed challenge attempt
      supabase.rpc('log_auth_event', {
        event_type: 'mfa_failed',
        details: { phase: 'challenge', factor_id: factorId },
      }).then(null, () => {});
      // Re-issue a fresh challenge so they can immediately retry
      const { data: chal } = await supabase.auth.mfa.challenge({ factorId });
      if (chal?.id) setChallengeId(chal.id);
      return;
    }
    // Success — log + redirect
    supabase.rpc('log_auth_event', {
      event_type: 'mfa_challenged',
      details: { factor_id: factorId },
    }).then(null, () => {});
    // router.push then a hard refresh so server components on the next
    // page re-evaluate AAL with the new session.
    router.push(next);
    router.refresh();
  };

  const signOut = async () => {
    // Audit logout BEFORE actually signing out (auth.uid() goes null after).
    await supabase.rpc('log_auth_event', {
      event_type: 'logout',
      details: { reason: 'mfa_lockout' },
    }).then(null, () => {});
    await supabase.auth.signOut();
    router.push('/v4/login');
  };

  if (loading) {
    return (
      <AuthCard title="Two-factor verification">
        <div className="text-slate-400 text-center p-5">
          Loading…
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Two-factor verification">
      <p style={{ color: 'var(--g-text-soft)', fontSize: 14, lineHeight: 1.55, marginBottom: 20 }}>
        Open your authenticator app and enter the current 6-digit code for GPDash.
      </p>
      <div style={f.field}>
        <label style={f.label}>Verification code</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={e => e.key === 'Enter' && code.length === 6 && verify()}
          placeholder="123456"
          maxLength={6}
          style={{
            ...f.input,
            fontFamily: "var(--font-mono)",
            fontSize: 22,
            letterSpacing: 4,
            textAlign: 'center',
          }}
        />
      </div>

      {error && (
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--r-md)', color: 'var(--c-red)', fontSize: 13,
        }}>{error}</div>
      )}

      <button
        onClick={verify}
        disabled={verifying || code.length !== 6}
        style={{ ...f.button, ...((verifying || code.length !== 6) ? f.buttonDisabled : {}) }}
      >
        {verifying ? 'Verifying…' : 'Verify'}
      </button>

      <div style={{ ...f.footerLink, marginTop: 20 }}>
        Lost access to your authenticator?{' '}
        <button onClick={signOut} style={{
          background: 'transparent', border: 'none', padding: 0,
          color: 'var(--c-cyan)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline',
          fontFamily: 'inherit',
        }}>
          Sign out
        </button>
        {' '}and contact a platform admin for recovery.
      </div>
    </AuthCard>
  );
}
