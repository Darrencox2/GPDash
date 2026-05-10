'use client';

// LeavePracticeButton — shown on the current user's own row in the
// member list. Calls leave_practice RPC; redirects to dashboard on
// success.
//
// The DB enforces the last-owner check, but we mirror it here as a
// disabled state with explanation so the button doesn't look broken.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function LeavePracticeButton({ practiceId, practiceName, myRole, totalOwners }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isLastOwner = myRole === 'owner' && totalOwners === 1;

  const leave = async () => {
    if (isLastOwner) return;
    if (!confirm(`Leave ${practiceName}?\n\nYou'll lose access immediately. Your personal data (notes, account) is preserved — you'll just no longer be able to view or edit anything in this practice. An owner can re-invite you later if needed.`)) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('leave_practice', { target_practice_id: practiceId });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // After leaving, the practice page will refuse to load for them.
    // Send them to the dashboard.
    router.push('/v4/dashboard');
    router.refresh();
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={leave}
        disabled={busy || isLastOwner}
        title={isLastOwner ? 'You are the last owner. Transfer ownership to someone else first.' : 'Leave this practice'}
        style={{
          padding: '4px 10px',
          fontSize: 11,
          color: isLastOwner ? '#64748b' : '#fbbf24',
          background: isLastOwner ? 'rgba(148,163,184,0.06)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${isLastOwner ? 'rgba(148,163,184,0.15)' : 'rgba(245,158,11,0.25)'}`,
          borderRadius: 6,
          cursor: isLastOwner || busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? '…' : 'Leave'}
      </button>
      {error && (
        <div style={{ fontSize: 10, color: '#fca5a5', maxWidth: 200, textAlign: 'right' }}>{error}</div>
      )}
    </div>
  );
}
