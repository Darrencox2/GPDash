'use client';

// DeletePracticeButton — opens a modal that requires the user to type
// the practice name (matching) before the delete RPC can be called.
// Platform admin only — page that uses this component must already gate
// rendering on isPlatformAdmin server-side. Any further check here is
// defence in depth.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function DeletePracticeButton({ practiceId, practiceName }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const matches = typed.trim() === practiceName.trim();

  async function deleteIt() {
    if (!matches) return;
    setBusy(true);
    setError('');
    const { data, error: err } = await supabase.rpc('admin_delete_practice', {
      target_practice_id: practiceId,
    });
    setBusy(false);
    if (err) {
      setError(err.message || 'Delete failed');
      return;
    }
    // Success — bounce to admin practices list
    router.push('/v4/admin');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '8px 14px',
          background: '#dc2626',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Delete this practice
      </button>

      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            zIndex: 100,
          }}
        >
          <div style={{
            maxWidth: 480,
            width: '100%',
            background: '#0f172a',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 12,
            padding: 24,
          }}>
            <h2 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 600, color: '#fca5a5', marginBottom: 8 }}>
              ⚠ Delete practice
            </h2>
            <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 12 }}>
              This is permanent and cannot be undone. Deleting <strong style={{ color: 'white' }}>{practiceName}</strong> will
              remove every clinician record, working pattern, absence, rota note, room
              allocation, demand history row, and every member's access to this practice.
            </p>
            <p style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 8 }}>
              Type the practice name below to confirm:
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={practiceName}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.3)',
                border: `1px solid ${matches ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6,
                color: '#e2e8f0',
                fontSize: 14,
                marginBottom: 12,
              }}
            />
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                onClick={deleteIt}
                disabled={!matches || busy}
                style={{
                  padding: '8px 14px',
                  background: matches ? '#dc2626' : 'rgba(220,38,38,0.3)',
                  color: matches ? 'white' : 'rgba(255,255,255,0.5)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: matches && !busy ? 'pointer' : 'not-allowed',
                }}
              >{busy ? 'Deleting…' : 'Delete permanently'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
