'use client';

// PasswordResetButton — sends a Supabase password recovery email to the
// user. Same flow as the public /v4/reset-password page, just initiated
// by the platform admin on someone else's behalf.

import { useState } from 'react';
import { confirmDialog } from '@/components/ui';
import { createClient } from '@/utils/supabase/client';
import { getSiteUrl } from '@/lib/site-url';

export default function PasswordResetButton({ email }) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Email delivery to nhs.net is unreliable (greylisting/quarantine), so
  // the admin can also generate the recovery link directly and pass it on
  // via any channel. Server-side, platform-admin gated, audit-logged.
  const generateLink = async () => {
    setBusy(true); setStatus({ kind: 'idle', message: '' }); setLink(''); setCopied(false);
    try {
      const res = await fetch('/api/v4/admin/recovery-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect_to: `${getSiteUrl()}/v4/reset-password/update` }),
      });
      const json = await res.json();
      if (!res.ok || !json.link) {
        setStatus({ kind: 'error', message: json.error || 'Could not generate link' });
      } else {
        setLink(json.link);
        setStatus({ kind: 'success', message: 'Recovery link generated — copy it and send it to the user however you like. It works once and expires after an hour.' });
      }
    } catch (e) {
      setStatus({ kind: 'error', message: e?.message || 'Could not generate link' });
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard unavailable — the link is selectable below */ }
  };

  const send = async () => {
    if (!(await confirmDialog({ message: `Send a password reset email to ${email}?\n\nThey'll receive a link to set a new password.`, danger: false }))) return;
    setBusy(true);
    setStatus({ kind: 'idle', message: '' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getSiteUrl()}/v4/reset-password/update`,
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
          borderRadius: 'var(--r-md)',
          fontSize: 13,
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>
        {busy ? 'Sending…' : 'Send password reset email'}
      </button>
      <button
        onClick={generateLink}
        disabled={busy}
        style={{
          marginLeft: 8,
          padding: '8px 14px',
          background: 'var(--g-tile)',
          color: 'var(--g-text-hi)',
          border: '1px solid var(--g-border-2)',
          borderRadius: 'var(--r-md)',
          fontSize: 13,
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}>
        Generate link instead
      </button>
      {status.message && (
        <div style={{
          marginTop: 10,
          padding: 10,
          fontSize: 12,
          borderRadius: 'var(--r-sm)',
          background: status.kind === 'error' ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
          color: status.kind === 'error' ? '#fca5a5' : '#6ee7b7',
          border: `1px solid ${status.kind === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
        }}>{status.message}</div>
      )}
      {link && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <input
            readOnly
            value={link}
            onFocus={(e) => e.target.select()}
            style={{ flex: 1, minWidth: 0, fontSize: 11.5, padding: '8px 10px', background: 'var(--g-field)', color: 'var(--g-text-hi)', border: '1px solid var(--g-line)', borderRadius: 'var(--r-sm)', fontFamily: "'Space Mono', monospace" }}
          />
          <button onClick={copyLink} style={{ padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
      <p style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Sends a Supabase recovery email to <strong style={{ color: '#94a3b8' }}>{email}</strong>.
        The link redirects them to {getSiteUrl()}/v4/reset-password/update where they can set a new password.
      </p>
    </div>
  );
}
