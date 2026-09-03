'use client';

// JoinRequestsCard — people asking to join this practice.
//
// The counterpart to the "Ask to join" button on the create-practice
// screen. Before this existed, someone whose practice was already on
// GPDash was told to go and find the owner themselves, and the owner had
// no idea anybody was waiting.
//
// Approving always lands the person on the lowest role. Saying "yes, this
// person works here" is a different decision from "this person runs the
// place", and the Users list above is where a role gets raised
// deliberately.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { confirmDialog } from '@/components/ui';

export default function JoinRequestsCard({ requests, canManage }) {
  if (!requests || requests.length === 0) return null;
  return (
    <div style={{
      background: 'var(--g-tile-2)',
      border: '1px solid rgba(245,158,11,0.35)',
      borderRadius: 'var(--r-lg)',
      padding: 20,
    }}>
      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontWeight: 600, color: 'var(--g-text-hi)', marginBottom: 4 }}>
        Requests to join
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--c-amber-2)' }}>
          {requests.length} waiting
        </span>
      </h3>
      <p className="text-caption text-mid mb-3 leading-normal">
        These people found this practice when signing up and asked to be let in. Approving adds them
        on the lowest role &mdash; change it above once they are in.
      </p>
      {requests.map(r => <RequestRow key={r.id} request={r} canManage={canManage} />)}
    </div>
  );
}

function RequestRow({ request: r, canManage }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const decide = async (approve) => {
    if (!approve) {
      const ok = await confirmDialog({
        message: `Decline the request from ${r.email}? They will not be added, and they can ask again.`,
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true); setError('');
    const { error: err } = await supabase.rpc('decide_join_request', {
      p_request_id: r.id,
      p_approve: approve,
    });
    setBusy(false);
    if (err) { setError(err.message || 'That did not work. Try again in a moment.'); return; }
    router.refresh();
  };

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--g-tile)' }}>
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          <div className="text-body text-hi">{r.name || r.email}</div>
          <div className="text-caption text-mid mt-0.5">
            {r.name ? <>{r.email}{' · '}</> : null}
            asked {new Date(r.requested_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
          {r.message && (
            <div className="text-caption mt-1" style={{ color: 'var(--g-text-hi)', fontStyle: 'italic' }}>
              &ldquo;{r.message}&rdquo;
            </div>
          )}
          {error && <div className="text-caption mt-1" style={{ color: 'var(--c-red)' }}>{error}</div>}
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => decide(false)} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ background: 'var(--g-tile)', border: '1px solid var(--g-border-2)', color: 'var(--meta)' }}
            >
              Decline
            </button>
            <button
              onClick={() => decide(true)} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.5)', color: 'var(--link)' }}
            >
              {busy ? 'Working…' : 'Approve'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
