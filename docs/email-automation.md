# Email automation: invite emails

GPDash sends an invite email automatically whenever an admin creates an
invite (single or bulk). This is wired up via:

1. A Supabase **Edge Function** — `supabase/functions/send-invite-email`
2. A Supabase **Database Webhook** that fires on
   `INSERT INTO public.practice_invites` and POSTs to the function

This document is the one-time setup checklist. After this is done, every
invite created via any code path automatically gets an email.

---

## Prerequisites

- Resend account with `gpdash.net` (or your domain) verified — should
  already be done if Supabase auth emails are working
- Resend API key (the one you used for SMTP works fine; same key)
- Supabase CLI installed locally (`npm i -g supabase`) for deploying
  the function. Alternatively the function can be created via the
  dashboard editor.

---

## Step 1: deploy the Edge Function

### Option A — via CLI (recommended)

```bash
# Login if you haven't
supabase login

# From the repo root
supabase link --project-ref dvmfgxqqvyoifybwlnky

# Deploy
supabase functions deploy send-invite-email --no-verify-jwt
```

The `--no-verify-jwt` flag means the function accepts unauthenticated
POSTs. We rely on a custom signature (configured below in the webhook
header) for authentication instead. Without this flag the database
webhook can't reach it.

### Option B — via Dashboard

1. Open Supabase project → **Edge Functions** → **Create a new function**
2. Name: `send-invite-email`
3. Paste the contents of `supabase/functions/send-invite-email/index.ts`
4. Deploy

---

## Step 2: set environment secrets

The function reads four env vars (all set in dashboard, NOT committed
to the repo):

| Secret | Value |
| ------ | ----- |
| `RESEND_API_KEY` | Your Resend API key |
| `SITE_URL` | `https://preview.gpdash.net` (preview) or `https://gpdash.net` (production) |
| `FROM_EMAIL` | `noreply@gpdash.net` (or whatever you used for SMTP) |
| `FROM_NAME` | `GPDash` |

To set them:

1. Supabase project → **Edge Functions** → **send-invite-email** → **Secrets**
2. Click **New secret** for each row above
3. Save

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — don't
add them.

---

## Step 3: create the database webhook

This is the bit that connects "row inserted" → "function fires".

1. Supabase project → **Database** → **Webhooks** → **Create a new hook**
2. Fill in:
   - **Name**: `send-invite-email-on-insert`
   - **Table**: `practice_invites`
   - **Events**: tick **Insert** only (not Update or Delete)
   - **Type**: **Supabase Edge Functions**
   - **Edge Function**: `send-invite-email`
   - **HTTP Method**: POST
   - **HTTP Headers**: leave default (Supabase fills in `Authorization`
     with the project's anon key automatically)
   - **HTTP Params**: leave empty
3. Save

That's it. From now on every new row in `practice_invites` triggers
the function asynchronously.

---

## Step 4: test

1. Open `preview.gpdash.net/v4/practice/<your-practice>?tab=users`
2. Use the bulk-invite modal to send a test invite to your own
   email (different from the practice owner)
3. Within ~10 seconds, the email should arrive
4. Check Resend dashboard → Emails — should show "Delivered"
5. Check Supabase → Edge Functions → `send-invite-email` → **Logs** —
   should see "Sent invite email to ..." log line

If nothing arrives, check in this order:

1. **Edge Function Logs** for errors. Most common: `RESEND_API_KEY not
   configured` (forgot Step 2) or `resend_send_failed` with details.
2. **Resend dashboard → Emails** — was the send attempted? Status?
3. **Database Webhooks** in Supabase → click the hook → **Logs** —
   was the webhook fired? What HTTP response did it get?

---

## Behaviour notes

- **Resending**: if a user clicks "Send" on a paste they've already
  invited, the bulk RPC short-circuits — the database row already exists,
  no INSERT fires, no email sent again. To resend, revoke the existing
  invite first, then re-create.
- **Bounces**: Resend records bounced emails in their dashboard. Currently
  GPDash doesn't surface bounces in the UI — Pending invites show as
  pending until accepted/revoked/expired regardless. A future enhancement
  could read Resend's webhook for bounces and flag the invite row.
- **Single invites**: the same flow runs whether the invite was created
  via single-invite form or bulk. The webhook fires on any INSERT.
- **Local dev**: edge functions don't fire from `supabase start` unless
  you also run `supabase functions serve`. For local testing of the email
  itself, easiest is to deploy to staging.

---

## Costs

- Resend free tier: 3,000 emails/month, 100/day. Each invite uses 1.
- Supabase Edge Functions free tier: 500K invocations/month. Each
  invite triggers ~1 invocation.

Both wildly more than a beta SaaS will ever use.
