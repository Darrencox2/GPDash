'use client';

// PasswordResetButton — sends a Supabase password recovery email to the
// user. Same flow as the public /v4/reset-password page, just initiated
// by the platform admin on someone else's behalf.

import { useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function PasswordResetButton({ email }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ kind: 'idle', message: '' });

  const send = async () => {
    if (!confirm(`Send a password reset email to ${email}?\n\nThey'll receive a link to set a new password.`)) return;
    setBusy(true);
    setStatus({ kind: 'idle', message: '' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/v4/reset-password/update`,
    });
    setBusy(false);
    if (error) {
      setStatus({ kind: 'error', message: error.message });
    } else {
      setStatus({ kind: 'success', message: `Reset email sent to ${email}.` });
    }
  };

  return (
    <div>
      <button
        onClick={send}
        disabled={busy}
        style={{
          padding: '8px 14px',
          background: '#0891b2',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>
        {busy ? 'Sending…' : 'Send password reset email'}
      </button>
      {status.message && (
        <div style={{
          marginTop: 10,
          padding: 10,
          fontSize: 12,
          borderRadius: 6,
          background: status.kind === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
          color: status.kind === 'error' ? '#fca5a5' : '#6ee7b7',
          border: `1px solid ${status.kind === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
        }}>{status.message}</div>
      )}
      <p style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Sends a Supabase recovery email to <strong style={{ color: '#94a3b8' }}>{email}</strong>.
        The link redirects them to {typeof window !== 'undefined' ? window.location.origin : ''}/v4/reset-password/update where they can set a new password.
      </p>
    </div>
  );
}
