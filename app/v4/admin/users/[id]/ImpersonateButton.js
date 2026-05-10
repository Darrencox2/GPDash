'use client';

// ImpersonateButton — starts an impersonation session.
//
// Workflow:
//   1. Admin clicks the button → modal opens with strong warning
//   2. Admin enters a reason (required) and clicks "Confirm"
//   3. Browser POSTs to /api/v4/admin/impersonate
//   4. Server records the session, signs the admin out, sets cookie,
//      returns a magic link URL
//   5. Browser navigates to the magic link → user signs in as the
//      target → banner appears via cookie
//
// We require a reason because impersonation should be deliberate and
// auditable. "Investigating reported bug #123" / "Helping user fix
// linked clinician" / etc. — captured in impersonation_sessions.reason.

import { useState } from 'react';

export default function ImpersonateButton({ user, currentUserIsTarget }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');

  // Disable for the cases where impersonation is forbidden:
  //   - You can't impersonate yourself
  //   - You can't impersonate suspended users (would bypass suspension)
  //   - You can't impersonate other platform admins (privilege flow)
  const disabledReason = currentUserIsTarget
    ? "Can't impersonate yourself"
    : user.suspended_at
      ? "Can't impersonate suspended user"
      : user.is_platform_admin
        ? "Can't impersonate another platform admin"
        : null;

  const start = async () => {
    if (!reason.trim()) {
      setError('Please enter a reason for impersonating this user.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/v4/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user_id: user.id, reason }),
      });
      const json = await res.json();
      if (!res.ok || !json.action_link) {
        setError(json.error || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      // Navigate to the magic link. After sign-in the user lands on
      // /v4/dashboard; the gpdash_imp cookie is preserved across the
      // redirect because it's HttpOnly + path=/ + persists to expiry.
      window.location.href = json.action_link;
    } catch (e) {
      setError(e.message || 'Network error');
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!!disabledReason}
          style={{
            padding: '8px 14px',
            background: disabledReason ? 'rgba(255,255,255,0.04)' : '#7c3aed',
            color: disabledReason ? '#64748b' : 'white',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: disabledReason ? 'not-allowed' : 'pointer',
          }}
          title={disabledReason || ''}
        >
          Sign in as this user (impersonate)
        </button>
        <p style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
          {disabledReason
            ? disabledReason
            : 'Use sparingly — only to debug a problem the user is reporting. Every action you take while impersonating is recorded against your account, with the user\'s ID attached. The session is logged, time-limited (1 hour), and visible in the user\'s activity timeline.'}
        </p>
      </div>

      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: 24,
            maxWidth: 500,
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fbbf24', marginBottom: 12 }}>
              ⚠ Impersonate {user.email}?
            </h3>
            <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5, marginBottom: 16 }}>
              You'll be signed out of your admin account and signed in as <strong>{user.email}</strong>.
              You'll see exactly what they see and any actions you take will be logged
              against your admin user ID with the impersonation flag.
            </p>
            <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
              The session expires in 1 hour. Click "End impersonation" in the red banner
              at any time to return to the login screen — you'll need to sign back in to
              your admin account afterwards.
            </p>

            <label style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>
              Reason (required — recorded in audit log)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Investigating reported bug #123 &mdash; user can&apos;t open the rota page."
              rows={3}
              autoFocus
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
                minHeight: 70,
                marginBottom: 12,
              }}
            />

            {error && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                fontSize: 12,
                borderRadius: 6,
                marginBottom: 12,
              }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowModal(false); setReason(''); setError(''); }}
                disabled={busy}
                style={btnSubtle}
              >
                Cancel
              </button>
              <button
                onClick={start}
                disabled={busy || !reason.trim()}
                style={{ ...btnDanger, opacity: (busy || !reason.trim()) ? 0.5 : 1 }}
              >
                {busy ? 'Starting…' : 'Confirm — sign in as this user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const btnSubtle = { padding: '8px 14px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnDanger = { padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' };
