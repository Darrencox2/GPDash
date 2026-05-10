'use client';

// GenerateLinkButton — for users stuck on email_unconfirmed (or any case
// where the platform admin needs a one-time sign-in URL on their behalf).
//
// Calls /api/v4/admin/generate-link which uses the service-role admin
// client to generate a Supabase auth action_link. We display the URL
// for the admin to copy and forward to the user via whatever channel
// they're already using — text, Slack, or re-typing it on a phone call.
//
// We don't auto-send the email because we haven't wired up email
// infrastructure (Resend etc.) yet. Once we do, this can switch to
// auto-send and just confirm "sent". The link-display fallback is
// arguably more useful anyway because it works in cases where the
// user's mailbox is the problem.

import { useState } from 'react';

export default function GenerateLinkButton({ email, emailUnconfirmed }) {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // For unconfirmed accounts we generate a 'signup' link (which both
  // signs them in AND marks the email confirmed). For confirmed accounts
  // we generate a regular magic-link.
  const linkType = emailUnconfirmed ? 'signup' : 'magiclink';

  const generate = async () => {
    setBusy(true);
    setError('');
    setLink(null);
    try {
      const res = await fetch('/api/v4/admin/generate-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, type: linkType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || `Failed (${res.status})`);
        return;
      }
      setLink(json.actionLink);
    } catch (e) {
      setError(e.message || 'Network error');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div>
      <button
        onClick={generate}
        disabled={busy}
        style={{
          padding: '8px 14px',
          background: emailUnconfirmed ? '#d97706' : '#475569',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy
          ? 'Generating…'
          : emailUnconfirmed
            ? 'Generate sign-up confirmation link'
            : 'Generate sign-in link'}
      </button>

      {error && (
        <div style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5',
          fontSize: 12,
          borderRadius: 6,
        }}>{error}</div>
      )}

      {link && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
            Send this link to <strong style={{ color: '#cbd5e1' }}>{email}</strong>. It expires in 1 hour.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              readOnly
              value={link}
              onFocus={(e) => e.target.select()}
              style={{
                flex: 1,
                padding: '7px 10px',
                fontSize: 11,
                fontFamily: 'ui-monospace, Menlo, monospace',
                color: '#e2e8f0',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                outline: 'none',
              }}
            />
            <button
              onClick={copy}
              style={{
                padding: '7px 12px',
                fontSize: 12,
                color: copied ? '#34d399' : '#cbd5e1',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <p style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        {emailUnconfirmed
          ? 'Use this when the user signed up but never received the confirmation email. The link signs them in and confirms their email in one step.'
          : 'Use this for users who can\'t access their email or have lost their password reset email.'}
      </p>
    </div>
  );
}
