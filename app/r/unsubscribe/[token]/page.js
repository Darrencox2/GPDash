// /r/unsubscribe/[token] — the page a recipient lands on from the footer
// link in a scheduled report email.
//
// Server component: resolves the token so the page can name what they are
// actually stopping ("the Monday email with Fill rate and Duty share")
// rather than asking them to confirm something anonymous. Nothing is
// changed by loading this page — the opt-out only happens when the button
// is pressed, which POSTs. A GET must stay safe here, because mail scanners
// and Safe Links follow footer links without a human involved.

import { createAdminClient } from '@/utils/supabase/admin';
import { resolveToken } from '@/lib/report-unsubscribe';
import UnsubscribeForm from './UnsubscribeForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Unsubscribe · GPDash',
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({ params }) {
  const { token } = await params;
  const admin = createAdminClient();
  const resolved = admin ? await resolveToken(admin, token) : null;

  if (!resolved) {
    return (
      <Shell>
        <h1 style={H1}>This link is no longer valid</h1>
        <p style={P}>
          It may already have been used, or the report it came from may have been deleted.
          If you are still receiving emails you did not ask for, reply to one of them and
          ask the practice to remove you.
        </p>
      </Shell>
    );
  }

  const { practiceName, reportNames, schedule, recipient, alreadyOff } = resolved;

  return (
    <Shell>
      <UnsubscribeForm
        token={token}
        email={recipient.email}
        practiceName={practiceName}
        reportNames={reportNames}
        cadence={schedule.cadence}
        alreadyOff={alreadyOff}
      />
    </Shell>
  );
}

const H1 = { margin: '0 0 12px', fontSize: 22, fontWeight: 600, color: '#0f172a', lineHeight: 1.3 };
const P = { margin: '0 0 14px', fontSize: 14, lineHeight: 1.65, color: '#475569' };

// Standalone light-mode shell. This page is opened from an inbox by people
// who have never seen GPDash and have no session, so it does not use the
// app's dark chrome or its theme tokens.
function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f8fafc', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '32px 16px',
      fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    }}>
      <div style={{
        width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #e2e8f0',
        borderRadius: 14, padding: '28px 28px 26px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <svg width="28" height="28" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect width="36" height="36" rx="7.6" fill="#1e293b" />
            <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" />
            <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7" />
            <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155" />
            <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7" />
            <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b" />
            <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155" />
            <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444" />
            <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5" />
            <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155" />
          </svg>
          <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,Consolas,monospace", fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
            <span style={{ color: '#10b981', fontWeight: 400, opacity: 0.5 }}>[</span>GP
            <span style={{ color: '#10b981', fontWeight: 400, opacity: 0.5 }}>]</span>
            <span style={{ fontFamily: 'inherit', fontWeight: 300, color: '#10b981', letterSpacing: '0.18em', marginLeft: 2 }}>DASH</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
