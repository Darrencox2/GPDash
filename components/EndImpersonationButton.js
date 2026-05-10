'use client';

// EndImpersonationButton — small client component used inside the
// ImpersonationBanner. Lives separately because the banner itself is
// a server component.

import { useState } from 'react';

export default function EndImpersonationButton() {
  const [busy, setBusy] = useState(false);

  const end = async () => {
    setBusy(true);
    try {
      await fetch('/api/v4/admin/end-impersonation', { method: 'POST' });
    } catch {}
    // Regardless of success/failure, send the user back to /v4/login.
    // The route signs them out anyway, so a fresh login is needed.
    window.location.href = '/v4/login';
  };

  return (
    <button
      onClick={end}
      disabled={busy}
      style={{
        padding: '6px 14px',
        background: 'rgba(0,0,0,0.25)',
        color: 'white',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        cursor: busy ? 'wait' : 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {busy ? 'Ending…' : 'End impersonation →'}
    </button>
  );
}
