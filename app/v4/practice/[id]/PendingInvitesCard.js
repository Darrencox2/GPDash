'use client';

// PendingInvitesCard — replaces the read-only invite list.
//
// Per row:
//   - Email + role + sender + "expires X"
//   - Copy invite link (since we don't auto-email yet, this is the
//     primary delivery mechanism — admin sends the link via Slack/text)
//   - Revoke button (calls revoke_practice_invite RPC)
//
// Owner/admin permissions handled at the RPC; UI just shows the buttons
// and surfaces errors.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { getSiteUrl } from '@/lib/site-url';

export default function PendingInvitesCard({ invites, canManage }) {
  if (!invites || invites.length === 0) return null;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: 20,
    }}>
      <h3 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: '#cbd5e1', marginBottom: 14 }}>
        Pending invites
      </h3>
      {invites.map(inv => (
        <InviteRow key={inv.id} invite={inv} canManage={canManage} />
      ))}
      <div style={{ marginTop: 12, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
        Invite emails aren't sent automatically yet — copy the link and forward it via your usual channel (Slack, text, email, etc.).
      </div>
    </div>
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
    if (!confirm(`Revoke invite for ${inv.email}? They won't be able to use the existing link anymore.`)) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.rpc('revoke_practice_invite', { invite_id: inv.id });
    setBusy(false);
    if (err) { setError(err.message); return; }
    router.refresh();
  };

  const expired = new Date(inv.expires_at) < new Date();

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div style={{ fontSize: 14, color: '#e2e8f0' }}>{inv.email}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Invited as <span style={{ textTransform: 'capitalize' }}>{inv.role}</span>
            {' · '}
            {expired ? (
              <span style={{ color: '#fca5a5' }}>expired {new Date(inv.expires_at).toLocaleDateString('en-GB')}</span>
            ) : (
              <>expires {new Date(inv.expires_at).toLocaleDateString('en-GB')}</>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {!expired && (
            <button
              onClick={copy}
              title="Copy invite link to clipboard"
              style={{
                padding: '5px 10px',
                fontSize: 11,
                color: copied ? '#34d399' : '#cbd5e1',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6,
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
                color: '#fca5a5',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
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
        <div style={{ marginTop: 6, fontSize: 11, color: '#fca5a5', padding: '5px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
          {error}
        </div>
      )}
    </div>
  );
}
