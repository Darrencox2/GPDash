'use client';

// DeletePracticeButton — typed-confirmation delete used in the danger zone
// of the platform-admin practice detail page. Same pattern as the user-
// delete UI: type the slug to enable the red button. Calls the existing
// admin_delete_practice RPC (migration 018).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function DeletePracticeButton({ practiceId, practiceName, practiceSlug }) {
  const router = useRouter();
  const supabase = createClient();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = confirm === practiceSlug;

  const remove = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('admin_delete_practice', {
      target_practice_id: practiceId,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.push('/v4/admin');
  };

  return (
    <>
      {error && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 12,
        }}>{error}</div>
      )}
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, lineHeight: 1.5 }}>
        Deleting <strong style={{ color: '#cbd5e1' }}>{practiceName}</strong> removes all of its
        clinicians, working patterns, absences, rota notes, buddy allocations, CSV history, settings,
        and members. The members' user accounts are not deleted, just unlinked from this practice.
        This cannot be undone.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={`Type "${practiceSlug}" to enable delete`}
          style={{
            flex: '1 1 220px',
            padding: '8px 10px',
            fontSize: 13,
            color: '#e2e8f0',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={remove}
          disabled={!ready || busy}
          style={{
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 500,
            color: 'white',
            background: '#dc2626',
            border: 'none',
            borderRadius: 6,
            cursor: ready ? 'pointer' : 'not-allowed',
            opacity: ready ? 1 : 0.4,
          }}
        >
          {busy ? 'Deleting…' : 'Delete practice'}
        </button>
      </div>
    </>
  );
}
