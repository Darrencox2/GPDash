// ImpersonationBanner — server component rendered in the v4 layout.
//
// Reads the gpdash_imp cookie (set by /api/v4/admin/impersonate) and
// validates it via the admin_check_impersonation RPC, which enforces:
//   - the caller IS the impersonation target
//   - the session hasn't been ended
//   - the session hasn't expired
//
// If the validation passes, render a sticky red banner at the top of
// the page so the impersonator knows they are NOT acting as themselves.
// Includes an "End impersonation" form that POSTs to the end route.
//
// If no cookie / invalid cookie / expired session: return null. The
// banner is silent when there's nothing to surface.

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import EndImpersonationButton from './EndImpersonationButton';

export default async function ImpersonationBanner() {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('gpdash_imp');
  if (!sessionCookie?.value) return null;

  const supabase = createClient(cookieStore);
  if (!supabase) return null;

  // RPC validates caller = target + active + not expired.
  // Returns null if anything's off, in which case we don't render.
  const { data: session } = await supabase.rpc('admin_check_impersonation', {
    session_id: sessionCookie.value,
  });
  if (!session) return null;

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 9999,
      background: '#dc2626',
      color: 'white',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
      fontSize: 13,
      lineHeight: 1.4,
      borderBottom: '2px solid #991b1b',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      <div>
        <strong>⚠ Impersonation</strong>
        {' '}You're signed in as <strong>{session.target_email}</strong> on behalf of <strong>{session.admin_email}</strong>.
        {' '}Anything you do here is logged.
        {session.reason && (
          <span style={{ opacity: 0.9 }}> · Reason: {session.reason}</span>
        )}
      </div>
      <EndImpersonationButton />
    </div>
  );
}
