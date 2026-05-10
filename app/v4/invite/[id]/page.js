// /v4/invite/[id] — invite acceptance landing page.
//
// Visitor arrives via a copy-pasted invite link. We look up the invite
// summary (anonymously if needed — public_get_invite_summary is granted
// to anon) and render different states based on:
//
//   - Invite missing → 404 message
//   - Invite revoked → "this invite was revoked"
//   - Invite expired → "this invite has expired"
//   - Invite accepted → "this invite has already been used"
//   - Visitor signed out → "Sign in to <invited_email> to accept" with
//     links to /v4/login and /v4/signup pre-filled with the email
//   - Visitor signed in with WRONG email → "You're signed in as X but
//     this invite was sent to Y. Sign out and sign in with Y to accept."
//   - Visitor signed in with RIGHT email → "Accept" button → calls
//     accept_invite RPC → redirects to /p/<slug>
//
// The flow is server-rendered (signed-in state read on the server),
// with a client component only for the actual Accept action.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import AcceptInviteButton from './AcceptInviteButton';

export const dynamic = 'force-dynamic';

export default async function InviteAcceptPage({ params }) {
  const { id: inviteId } = params;

  const cookieStore = cookies();
  const supabase = createClient(cookieStore);
  if (!supabase) return <Shell><Message kind="error">Supabase not configured.</Message></Shell>;

  // Look up summary — anonymously OK, server has the grant.
  const { data: summary, error } = await supabase.rpc('public_get_invite_summary', {
    invite_id: inviteId,
  });
  if (error) {
    return <Shell><Message kind="error">Couldn't load invite: {error.message}</Message></Shell>;
  }
  if (!summary) {
    return <Shell><Message kind="error">Invite not found. Check the link is correct, or ask the person who sent it to send a new one.</Message></Shell>;
  }

  // Pull the signed-in user too (may be null)
  const { data: { user } } = await supabase.auth.getUser();
  const callerEmail = user?.email?.toLowerCase() || null;
  const invitedEmail = summary.invited_email?.toLowerCase();
  const emailsMatch = callerEmail && invitedEmail && callerEmail === invitedEmail;

  // ─── State branches ─────────────────────────────────────────────────
  if (summary.revoked_at) {
    return <Shell title="Invite revoked">
      <Message kind="warning">
        This invite was revoked by the person who sent it. Ask them to send a new one if you still want to join.
      </Message>
    </Shell>;
  }
  if (summary.accepted_at) {
    return <Shell title="Invite already used">
      <Message kind="info">
        This invite has already been accepted. If you were already added to {summary.practice_name}, just{' '}
        <Link href="/v4/login" style={{ color: '#22d3ee' }}>sign in</Link>.
      </Message>
    </Shell>;
  }
  if (summary.is_expired) {
    return <Shell title="Invite expired">
      <Message kind="warning">
        This invite expired on {new Date(summary.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
        Ask the person who sent it to send a new one.
      </Message>
    </Shell>;
  }

  return (
    <Shell title={`Join ${summary.practice_name}`}>
      <p style={{ fontSize: 14, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
        <strong style={{ color: 'white' }}>{summary.inviter_name}</strong> has invited you to join{' '}
        <strong style={{ color: 'white' }}>{summary.practice_name}</strong>{' '}
        as <strong style={{ color: '#67e8f9' }}>{summary.role}</strong>.
      </p>

      {!user ? (
        <SignInPrompt invitedEmail={invitedEmail} inviteId={inviteId} />
      ) : !emailsMatch ? (
        <WrongAccountMessage callerEmail={callerEmail} invitedEmail={invitedEmail} />
      ) : (
        <AcceptInviteButton
          inviteId={inviteId}
          practiceSlug={summary.practice_slug}
        />
      )}

      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: '#64748b' }}>
        Invite expires {new Date(summary.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
      </div>
    </Shell>
  );
}

function SignInPrompt({ invitedEmail, inviteId }) {
  // After sign-in/sign-up, send the user back to this same page so the
  // accept button takes over.
  const next = encodeURIComponent(`/v4/invite/${inviteId}`);
  return (
    <div>
      <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 }}>
        To accept, sign in with the email this invite was sent to:
        {' '}<strong style={{ color: '#cbd5e1' }}>{invitedEmail}</strong>
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link
          href={`/v4/login?email=${encodeURIComponent(invitedEmail)}&next=${next}`}
          style={{ ...btn, background: '#0891b2', color: 'white' }}
        >
          Sign in
        </Link>
        <Link
          href={`/v4/signup?email=${encodeURIComponent(invitedEmail)}&next=${next}`}
          style={{ ...btn, background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}

function WrongAccountMessage({ callerEmail, invitedEmail }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'rgba(245,158,11,0.1)',
      border: '1px solid rgba(245,158,11,0.25)',
      borderRadius: 8,
      fontSize: 13,
      color: '#fde68a',
      lineHeight: 1.5,
    }}>
      You're signed in as <strong>{callerEmail}</strong>, but this invite was sent to{' '}
      <strong>{invitedEmail}</strong>. Sign out and sign back in with the right email to accept,
      or ask the person who sent it to issue a new invite to <strong>{callerEmail}</strong>.
      <div style={{ marginTop: 10 }}>
        <Link href="/v4/login" style={{ color: '#22d3ee', fontSize: 12 }}>Switch accounts →</Link>
      </div>
    </div>
  );
}

function Shell({ title, children }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a, #1e293b, #0f172a)',
      color: '#e2e8f0',
      padding: 32,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        maxWidth: 480,
        width: '100%',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 28,
      }}>
        {title && <h1 style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 600, color: 'white', marginBottom: 16 }}>{title}</h1>}
        {children}
      </div>
    </div>
  );
}

function Message({ kind, children }) {
  const colours = {
    error:   { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.3)',  text: '#fca5a5' },
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', text: '#fde68a' },
    info:    { bg: 'rgba(34,211,238,0.1)', border: 'rgba(34,211,238,0.25)', text: '#a5f3fc' },
  }[kind] || { bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.15)', text: '#cbd5e1' };
  return (
    <div style={{ padding: 14, background: colours.bg, border: `1px solid ${colours.border}`, borderRadius: 8, fontSize: 13, color: colours.text, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

const btn = { padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none', display: 'inline-block' };
