'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function AcceptInviteButton({ inviteId, practiceSlug }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const accept = async () => {
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('accept_invite', {
      invite_id: inviteId,
    });
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    // accept_invite returns the practice_id (uuid). Land on the
    // practice's app page so the user sees their new home immediately.
    const target = practiceSlug ? `/p/${practiceSlug}` : `/v4/dashboard`;
    router.push(target);
    router.refresh();
  };

  return (
    <div>
      {error && (
        <div style={{
          marginBottom: 12,
          padding: '10px 12px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8,
          fontSize: 13,
          color: '#fca5a5',
        }}>{error}</div>
      )}
      <button
        onClick={accept}
        disabled={busy}
        style={{
          padding: '10px 18px',
          background: '#0891b2',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Accepting…' : 'Accept invite'}
      </button>
    </div>
  );
}
