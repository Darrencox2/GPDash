'use client';

// PendingInvitesCard — replaces the read-only invite list.
//
// Per row:
//   - Email + role + sender + "expires X"
//   - Whether the invite email actually reached the provider, reported
//     back by the send-invite-email Edge Function. This used to be
//     invisible: the card claimed the email was on its way the moment
//     the row was inserted, so a rejected address looked identical to a
//     delivered one.
//   - Copy invite link — the fallback when sending failed, and the way
//     to deliver an invite by hand over Slack or text
//   - Revoke button (calls revoke_practice_invite RPC)
//
// Owner/admin permissions handled at the RPC; UI just shows the buttons
// and surfaces errors.

import { useState } from 'react';
import { confirmDialog } from '@/components/ui';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getSiteUrl } from '@/lib/site-url';

export default function PendingInvitesCard({ invites, canManage }) {
  if (!invites || invites.length === 0) return null;
  return (
    <div style={{
      background: 'var(--g-tile-2)',
      border: '1px solid var(--g-border-2)',
      borderRadius: 'var(--r-lg)',
      padding: 20,
    }}>
      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 14, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 14 }}>
        Pending invites
      </h3>
      {invites.map(inv => (
        <InviteRow key={inv.id} invite={inv} canManage={canManage} />
      ))}
      <div className="mt-3 text-caption text-mid leading-normal">
        Invite emails send automatically and each row shows whether that worked. If one says it failed, copy the link and send it yourself.
          </div>
    </div>
  );
}

const EMAIL_STATUS = {
  sent:    { label: 'Emailed',      colour: 'var(--c-green-2)', border: 'rgba(52,211,153,0.4)',  bg: 'rgba(16,185,129,0.12)' },
  failed:  { label: 'Email failed', colour: 'var(--c-red)', border: 'rgba(239,68,68,0.45)',  bg: 'rgba(239,68,68,0.12)' },
  pending: { label: 'Sending…',     colour: 'var(--c-amber-2)', border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.10)' },
};

function EmailStatusPill({ status, sentAt, error }) {
  const s = EMAIL_STATUS[status] || EMAIL_STATUS.pending;
  const title = status === 'failed'
    ? (error || 'The email provider rejected this address.')
    : status === 'sent'
      ? (sentAt ? `Accepted by the email provider on ${new Date(sentAt).toLocaleString('en-GB')}` : 'Accepted by the email provider')
      : 'Not confirmed yet. This normally settles within a few seconds.';
  return (
    <span title={title}
      style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap',
        color: s.colour, background: s.bg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

function InviteRow({ invite: inv, canManage }) {
  const router = useRouter();
  const supabase = createClient();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Build the invite URL using the configured stable site URL so the
  // Copy-link output points at preview.gpdash.net / gpdash.net rather
  // than a transient Vercel deployment URL that 404s after rebuilds.
  const inviteUrl = `${getSiteUrl()}/v4/invite/${inv.id}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
    } catch {
      // Fallback for non-secure / older browsers
      const ta = document.createElement('textarea');
      ta.value = inviteUrl;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const revoke = async () => {
    if (!(await confirmDialog({ message: `Revoke invite for ${inv.email}? They won't be able to use the existing link anymore.`, danger: true }))) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('revoke_practice_invite', { invite_id: inv.id });
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  };

  const expired = new Date(inv.expires_at) < new Date();

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--g-tile)' }}>
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body text-hi">{inv.email}</span>
            <EmailStatusPill status={inv.email_status} sentAt={inv.email_sent_at} error={inv.email_error} />
          </div>
          <div className="text-caption text-mid mt-0.5">
            Invited as <span style={{ textTransform: 'capitalize' }}>{inv.role}</span>
            {' · '}
            {expired ? (
              <span className="text-red-300">expired {new Date(inv.expires_at).toLocaleDateString('en-GB')}</span>
            ) : (
              <>expires {new Date(inv.expires_at).toLocaleDateString('en-GB')}</>
            )}
          </div>
          {inv.email_status === 'failed' && (
            <div className="text-caption mt-1" style={{ color: 'var(--c-red)' }}>
              The email did not go out{inv.email_error ? `: ${inv.email_error}` : ''}. Copy the link below and send it to them yourself.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!expired && (
            <button
              onClick={copy}
              title="Copy invite link to clipboard"
              style={{
                padding: '5px 10px',
                fontSize: 11,
                color: copied ? 'var(--c-green-2)' : 'var(--g-text-hi)',
                background: 'var(--g-tile)',
                border: '1px solid var(--g-border-2)',
                borderRadius: 'var(--r-sm)',
                cursor: 'pointer',
              }}
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          )}
          {canManage && (
            <button
              onClick={revoke}
              disabled={busy}
              style={{
                padding: '5px 10px',
                fontSize: 11,
                color: 'var(--c-red)',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--r-sm)',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? '…' : 'Revoke'}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--c-red)', padding: '5px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--r-sm)' }}>
          {error}
        </div>
      )}
    </div>
  );
}
