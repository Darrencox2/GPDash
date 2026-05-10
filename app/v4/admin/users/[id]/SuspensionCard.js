'use client';

// SuspensionCard — UI for suspending and unsuspending a user.
//
// Suspended users:
//   - Cannot sign in (Supabase auth blocks them via banned_until)
//   - Have profiles.suspended_at + suspended_reason set
//   - Show with an amber "Suspended" badge in the user list and detail header
//   - Their data is preserved — no cascade deletes — so unsuspending
//     restores everything as it was
//
// Use cases:
//   - Investigation pending: "Filed a complaint, need to look into it"
//   - Compliance hold: "Pending NHS Digital review"
//   - Cooling off: "User keeps doing X after being asked to stop"
//
// Less drastic than delete; reversible.

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SuspensionCard({ user }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draftReason, setDraftReason] = useState('');
  const [showSuspendForm, setShowSuspendForm] = useState(false);

  const isSuspended = !!user.suspended_at;

  const suspend = async () => {
    if (!confirm(`Suspend ${user.email}?\n\nThey'll be unable to sign in. Their data is preserved and you can unsuspend at any time.`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/v4/admin/suspend-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, reason: draftReason }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || `Failed (${res.status})`); return; }
      setShowSuspendForm(false);
      setDraftReason('');
      router.refresh();
    } catch (e) {
      setError(e.message || 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const unsuspend = async () => {
    if (!confirm(`Unsuspend ${user.email}? They'll be able to sign in again immediately.`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/v4/admin/suspend-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || `Failed (${res.status})`); return; }
      router.refresh();
    } catch (e) {
      setError(e.message || 'Network error');
    } finally {
      setBusy(false);
    }
  };

  if (isSuspended) {
    return (
      <div>
        <div style={{
          padding: 14,
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)',
          borderRadius: 8,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>
            Suspended
          </div>
          <div style={{ fontSize: 12, color: '#fde68a', lineHeight: 1.5 }}>
            Suspended on {new Date(user.suspended_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
            {user.suspended_reason && (
              <>
                <br/>
                <strong>Reason:</strong> {user.suspended_reason}
              </>
            )}
          </div>
        </div>
        {error && <ErrorBox message={error} />}
        <button onClick={unsuspend} disabled={busy} style={btnPrimary}>
          {busy ? 'Lifting suspension…' : 'Unsuspend (restore sign-in)'}
        </button>
      </div>
    );
  }

  return (
    <div>
      {error && <ErrorBox message={error} />}
      {!showSuspendForm ? (
        <>
          <button onClick={() => setShowSuspendForm(true)} style={btnSubtle}>
            Suspend user
          </button>
          <p style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
            Blocks sign-in without deleting any data. Reversible at any time.
            Use for investigations, compliance holds, or temporary cooling-off
            periods. Use the danger zone below for permanent deletion.
          </p>
        </>
      ) : (
        <div>
          <label style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
            Reason (internal — only shown to platform admins)
          </label>
          <textarea
            value={draftReason}
            onChange={(e) => setDraftReason(e.target.value)}
            placeholder="e.g. Pending complaint review &mdash; investigating before we restore access."
            rows={3}
            style={{
              width: '100%',
              padding: '8px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              color: '#e2e8f0',
              fontSize: 13,
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 60,
              marginBottom: 10,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={suspend} disabled={busy} style={btnDanger}>
              {busy ? 'Suspending…' : 'Confirm suspend'}
            </button>
            <button onClick={() => { setShowSuspendForm(false); setDraftReason(''); setError(''); }} disabled={busy} style={btnSubtle}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div style={{
      padding: '8px 12px',
      background: 'rgba(239,68,68,0.12)',
      border: '1px solid rgba(239,68,68,0.3)',
      color: '#fca5a5',
      fontSize: 12,
      borderRadius: 6,
      marginBottom: 10,
    }}>{message}</div>
  );
}

const btnPrimary = { padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSubtle = { padding: '8px 14px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnDanger = { padding: '8px 14px', background: '#d97706', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
