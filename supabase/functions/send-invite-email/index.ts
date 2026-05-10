// supabase/functions/send-invite-email/index.ts
//
// Edge Function that sends a GPDash-themed invite email via Resend.
//
// Trigger: a database webhook on practice_invites INSERT (set up in
// the Supabase dashboard — see docs/email-automation.md). This catches
// every invite path:
//
//   - Single invites via invite_user_to_practice RPC
//   - Bulk invites via bulk_invite_users_to_practice RPC
//   - Any future invite source — the trigger fires on INSERT regardless
//     of which RPC inserted the row
//
// Why an Edge Function (not a direct Resend call from the Next.js API):
//
//   - Decoupled — invite creation succeeds even if email infrastructure
//     is down. The webhook retries automatically.
//   - All invite-email logic in one place. Future invite paths get the
//     email automatically without touching client/server code.
//   - Fire-and-forget from the user's perspective: the invite RPC
//     returns instantly; the email gets sent moments later.
//
// Required environment variables (set in Supabase dashboard → Edge
// Functions → Secrets):
//
//   RESEND_API_KEY    — your Resend API key (same one used for SMTP)
//   SITE_URL          — base URL where invite links resolve, e.g.
//                       https://preview.gpdash.net or https://gpdash.net.
//                       Invite links are ${SITE_URL}/v4/invite/<id>.
//   FROM_EMAIL        — sender address, e.g. noreply@gpdash.net.
//                       Domain must be verified in Resend.
//   FROM_NAME         — display name, defaults to "GPDash" if unset.
//
// Built-in Supabase secrets (auto-injected — don't set):
//
//   SUPABASE_URL                   — project URL, used to construct
//                                    the database client
//   SUPABASE_SERVICE_ROLE_KEY      — service-role key for reading
//                                    practice + profile rows that RLS
//                                    would otherwise hide

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Environment ───────────────────────────────────────────────────────
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SITE_URL = Deno.env.get('SITE_URL') || 'https://gpdash.net';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@gpdash.net';
const FROM_NAME = Deno.env.get('FROM_NAME') || 'GPDash';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ─── HTTP handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Use POST' }), {
      status: 405, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set; refusing to send.');
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body must be JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Database-webhook payload shape:
  //   { type, table, schema, record, old_record }
  // Direct invocation also accepted: just pass `{ record: { ... } }`.
  const record = payload?.record;
  if (!record || !record.id || !record.email || !record.practice_id) {
    return new Response(JSON.stringify({ error: 'Missing record fields' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Defensive: if this is somehow firing on a non-INSERT (e.g. UPDATE
  // making accepted_at non-null), do nothing.
  if (payload.type && payload.type !== 'INSERT') {
    return new Response(JSON.stringify({ skipped: 'not_insert' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }
  if (record.accepted_at || record.revoked_at) {
    return new Response(JSON.stringify({ skipped: 'already_resolved' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Look up practice + inviter via service-role client (bypasses RLS)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: practice }, { data: inviterProfile }] = await Promise.all([
    supabase.from('practices').select('id, name, slug').eq('id', record.practice_id).maybeSingle(),
    supabase.from('profiles').select('name, email').eq('id', record.invited_by).maybeSingle(),
  ]);

  const practiceName = practice?.name || 'a GP practice';
  const inviterName = inviterProfile?.name || inviterProfile?.email || 'A colleague';
  const role = String(record.role || 'user').toLowerCase();

  const inviteUrl = `${SITE_URL.replace(/\/$/, '')}/v4/invite/${record.id}`;
  const subject = `You're invited to ${practiceName} on GPDash`;
  const html = renderInviteEmail({
    practiceName,
    inviterName,
    role,
    inviteUrl,
    expiresAt: record.expires_at,
  });

  // Resend API call
  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: record.email,
      subject,
      html,
    }),
  });

  const resendBody = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error(`Resend rejected send for invite ${record.id}: ${resendRes.status}`, resendBody);
    return new Response(JSON.stringify({
      error: 'resend_send_failed',
      status: resendRes.status,
      body: resendBody,
    }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`Sent invite email to ${record.email} for invite ${record.id} (Resend id: ${resendBody.id})`);
  return new Response(JSON.stringify({ ok: true, resend_id: resendBody.id }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});


// ─── Email template ────────────────────────────────────────────────────
// Same design language as docs/email-templates.md: light card, branded
// header with the 3x3 capacity-tile logo, system fonts. Cyan CTA. Tables
// for layout (Outlook desktop friendly), inline styles only.
//
// Kept in this file rather than imported because Edge Functions are
// deployed separately and importing from /lib would require a build step.
function renderInviteEmail({
  practiceName,
  inviterName,
  role,
  inviteUrl,
  expiresAt,
}: {
  practiceName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: string | null;
}) {
  // Pretty role label
  const roleLabel =
    role === 'owner' ? 'an Owner' :
    role === 'admin' ? 'an Admin' :
    'a User';

  // Days until expiry, for the footer line
  let expiresLine = '';
  if (expiresAt) {
    const days = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 86400000));
    if (days > 0) {
      expiresLine = `This invitation expires in ${days} day${days === 1 ? '' : 's'}.`;
    }
  }

  // HTML escape for any user-controlled text we interpolate
  const esc = (s: string) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>You're invited to ${esc(practiceName)} on GPDash</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#334155;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f8fafc;opacity:0;">
    ${esc(inviterName)} invited you to join ${esc(practiceName)} on GPDash.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">

          <!-- Header: logo + wordmark -->
          <tr>
            <td style="padding:28px 32px 24px;border-bottom:1px solid #f1f5f9;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
                      <rect width="36" height="36" rx="7.6" fill="#1e293b"/>
                      <rect x="4.5" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981"/>
                      <rect x="13.87" y="4.5" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="23.23" y="4.5" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="13.87" width="8.27" height="8.27" rx="3" fill="#10b981" opacity="0.7"/>
                      <rect x="13.87" y="13.87" width="8.27" height="8.27" rx="3" fill="#f59e0b"/>
                      <rect x="23.23" y="13.87" width="8.27" height="8.27" rx="3" fill="#334155"/>
                      <rect x="4.5" y="23.23" width="8.27" height="8.27" rx="3" fill="#ef4444"/>
                      <rect x="13.87" y="23.23" width="8.27" height="8.27" rx="3" fill="#f59e0b" opacity="0.5"/>
                      <rect x="23.23" y="23.23" width="8.27" height="8.27" rx="3" fill="#334155"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:18px;font-weight:700;color:#0f172a;letter-spacing:-0.01em;">
                    <span style="color:#10b981;font-weight:400;opacity:0.5;">[</span>GP<span style="color:#10b981;font-weight:400;opacity:0.5;">]</span><span style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-weight:300;color:#10b981;letter-spacing:0.18em;margin-left:2px;">DASH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:22px;font-weight:600;color:#0f172a;line-height:1.3;">
                You're invited to ${esc(practiceName)}
              </h1>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569;">
                <strong style="color:#0f172a;">${esc(inviterName)}</strong> has invited you to join
                <strong style="color:#0f172a;">${esc(practiceName)}</strong> on GPDash as ${roleLabel}.
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569;">
                GPDash is a practice management dashboard — capacity, rotas, demand
                forecasting, and team coverage in one place.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
                <tr>
                  <td style="border-radius:8px;background:#0891b2;">
                    <a href="${esc(inviteUrl)}"
                       style="display:inline-block;padding:12px 24px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Accept invitation
                    </a>
                  </td>
                </tr>
              </table>

              <!-- URL fallback for clients that don't render buttons properly -->
              <p style="margin:0 0 18px;font-size:12px;line-height:1.6;color:#64748b;word-break:break-all;">
                Or copy this link into your browser:<br>
                <span style="color:#0f172a;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;">${esc(inviteUrl)}</span>
              </p>

              ${expiresLine ? `<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#94a3b8;">${esc(expiresLine)}</p>` : ''}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;line-height:1.5;">
              Don't recognise the sender or didn't expect an invitation? Ignore this
              email — no account will be created until you accept.
            </td>
          </tr>
        </table>

        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;margin-top:18px;">
          <tr>
            <td align="center" style="font-size:11px;color:#94a3b8;">
              GPDash · GP practice management
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
