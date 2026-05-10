'use client';

// TransferOwnershipButton — owner-only action. Opens a modal listing
// every other member of the practice; owner picks one, types confirm,
// and we call transfer_practice_ownership which atomically promotes
// the target to owner and demotes the caller to admin.
//
// This is the only safe self-service way for an owner to step down,
// and the prerequisite for an owner to use Leave Practice.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';

export default function TransferOwnershipButton({ practiceId, practiceName, members, myUserId }) {
  const router = useRouter();
  const supabase = createClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Eligible candidates = everyone in the practice except me
  const candidates = members.filter(m => m.user_id !== myUserId);
  const selected = candidates.find(c => c.user_id === selectedUserId);

  // Type "transfer" to confirm — adds friction proportional to how
  // irreversible this is from the perspective of the outgoing owner
  const confirmRequired = 'transfer';
  const canSubmit = !!selectedUserId && confirmText.trim().toLowerCase() === confirmRequired;

  const close = () => {
    setShowModal(false);
    setTimeout(() => {
      setSelectedUserId('');
      setConfirmText('');
      setError('');
    }, 200);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('transfer_practice_ownership', {
      target_practice_id: practiceId,
      new_owner_user_id: selectedUserId,
    });
    setBusy(false);
    if (err) { setError(err.message); return; }
    close();
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          padding: '7px 14px',
          fontSize: 12,
          color: '#cbd5e1',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Transfer ownership
      </button>

      {showModal && (
        <div style={overlay}>
          <div style={modal}>
            <button onClick={close} aria-label="Close" style={closeBtn}>×</button>

            <h3 style={modalTitle}>Transfer ownership of {practiceName}</h3>
            <p style={modalDesc}>
              The new owner gets full control of the practice. You'll be demoted
              to admin in the same action — you'll keep most of your access,
              but you won't be able to delete the practice, transfer ownership
              again, or remove the new owner.
            </p>
            <p style={{ ...modalDesc, color: '#fde68a' }}>
              This is reversible only if the new owner agrees to transfer back.
            </p>

            {candidates.length === 0 ? (
              <div style={{ padding: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, color: '#fde68a', fontSize: 13, marginBottom: 14 }}>
                There are no other members to transfer ownership to. Invite someone first, then come back here once they've accepted.
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  New owner
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                    fontSize: 14,
                    marginBottom: 16,
                  }}
                >
                  <option value="">— Pick a member —</option>
                  {candidates.map(c => (
                    <option key={c.user_id} value={c.user_id}>
                      {c.name || c.email} {c.role !== 'user' ? `(${c.role})` : ''}
                    </option>
                  ))}
                </select>

                {selected && (
                  <div style={{
                    padding: 14,
                    background: 'rgba(34,211,238,0.06)',
                    border: '1px solid rgba(34,211,238,0.2)',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#a5f3fc',
                    lineHeight: 1.5,
                    marginBottom: 16,
                  }}>
                    <strong>{selected.name || selected.email}</strong> will become owner.
                    You will become an admin.
                  </div>
                )}

                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  Type <code style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: 4, color: '#fde68a' }}>transfer</code> to confirm
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: '#e2e8f0',
                    fontSize: 14,
                    marginBottom: 16,
                    fontFamily: 'ui-monospace, Menlo, monospace',
                  }}
                />

                {error && (
                  <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 12, borderRadius: 6 }}>
                    {error}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={close} style={btnSubtle}>Cancel</button>
              {candidates.length > 0 && (
                <button
                  onClick={submit}
                  disabled={!canSubmit || busy}
                  style={{
                    padding: '8px 16px',
                    background: canSubmit ? '#d97706' : 'rgba(217,119,6,0.3)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: canSubmit && !busy ? 'pointer' : 'not-allowed',
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  {busy ? 'Transferring…' : 'Transfer ownership'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20 };
const modal = { background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto', position: 'relative' };
const closeBtn = { position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', color: '#64748b', fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 4 };
const modalTitle = { fontSize: 16, fontWeight: 600, color: 'white', marginBottom: 8, fontFamily: "'Outfit', sans-serif" };
const modalDesc = { fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 14 };
const btnSubtle = { padding: '8px 16px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
