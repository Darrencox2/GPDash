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

---

# Email automation: scheduled report emails

A practice can have saved reports emailed to a list of people on a
cadence — "these three reports, every Monday at 08:00, to these five".
Set up from Reporting: open a saved report, click **Email on a schedule**.

One schedule can carry several reports (`report_schedule_items`, ordered
by `position`). They arrive as a single email with one header, one CTA
and one footer, a contents list, and a titled section with its own chart
per report — so a practice gets one Monday digest instead of four
separate emails. Deleting a saved report cascades it out of every bundle
that carried it; that is why it is a join table and not a `uuid[]`.

Unlike invite emails, this does NOT go through an Edge Function. The
send happens in the Next.js route `/api/cron/scheduled-reports`, because
it has to import `lib/workload-report.js` — the same report engine the
dashboard renders from. That is what guarantees the figures in the email
match the figures on screen. A Deno Edge Function could not import it
without a second, drifting copy.

## How the clock works

The Vercel project is on the **hobby** plan: cron is capped at two jobs
at once-a-day granularity, and `retention-cleanup` already uses one.
"Every Monday at 08:00" cannot be expressed there. So the clock lives in
Postgres:

```
pg_cron (*/15 * * * *)
  -> public.dispatch_report_schedules()
  -> net.http_post  ->  https://<site>/api/cron/scheduled-reports
  -> renders with lib/workload-report.js -> Resend -> report_send_log
```

`dispatch_report_schedules()` counts due rows before making any HTTP
call, so 95 of every 96 daily wakeups do nothing and cost nothing.

## One-time setup

### Step 1: Vercel environment variables

| Variable | Value | Notes |
| -------- | ----- | ----- |
| `RESEND_API_KEY` | your Resend API key | the same key the SMTP / invite function uses |
| `CRON_SECRET` | a long random string | probably already set for retention-cleanup |
| `REPORT_FROM_EMAIL` | `noreply@gpdash.net` | optional; falls back to `FROM_EMAIL`, then `noreply@gpdash.net` |
| `FROM_NAME` | `GPDash` | optional; defaults to `GPDash` |

`NEXT_PUBLIC_SITE_URL` should already be set — it is what the "Open in
GPDash" button in the email points at.

### Step 2: Supabase Vault secrets

The database needs to know where to call and how to authenticate. In the
Supabase SQL editor:

```sql
select vault.create_secret('<the same CRON_SECRET>', 'gpdash_cron_secret');
select vault.create_secret('https://gpdash.net',     'gpdash_site_url');
```

Use `https://preview.gpdash.net` for the preview environment.

**Until both secrets exist the dispatcher is a deliberate no-op.** It
will not fire and it will not error every 15 minutes either; it raises a
notice naming the missing secrets. So the migration is safe to ship
before the secrets are set.

### Step 3: confirm pg_cron came up

The migration `20260902120100_report_schedule_cron.sql` enables pg_cron
and schedules the job. Enabling an extension can fail on the migration
role, so it is wrapped to warn rather than abort — a failure there must
not take an unrelated deploy down with it. Confirm it worked:

```sql
select jobname, schedule, active from cron.job
where jobname = 'gpdash-dispatch-report-schedules';
```

If that returns no rows, enable pg_cron once via
**Dashboard -> Database -> Extensions**, then re-run the migration body.
Everything in it is idempotent.

## Verifying without waiting for Monday

Two ways, both safe:

1. **Send test to me** in the schedule setup screen. Runs the entire real
   path — same data load, same engine, same renderer, same Resend call —
   but delivers only to the signed-in user and does not touch
   `next_send_at` or the delivery history. If the test arrives and looks
   right, the scheduled send will too.

2. **Dry run the dispatcher** as a platform admin:

   ```
   GET /api/cron/scheduled-reports?dry_run=true
   ```

   Lists what would be sent right now and sends nothing.

## Failure model

A failed send still advances `next_send_at`. A practice with one bad
recipient address must not be retried every 15 minutes forever, and must
not sit at the head of the queue blocking every other practice. The
reason is written to `report_send_log` and onto the schedule itself
(`last_status` / `last_error`), which is what the Reporting UI shows
against each schedule — the same lesson as invite `email_status` in
v4.139.0: a send that silently failed must never look like one that
arrived.

Sends are skipped, not failed, when there is nothing honest to send: no
CSV uploaded for the practice, no valid recipients, no reports left in
the schedule, or every report in it deleted. Each is recorded with its
reason in `report_send_log`, alongside `report_names` for what the email
actually carried.

A single report inside a bundle that matches no data is NOT a skip — it
gets its section with a note saying so, because dropping it silently
would leave the recipient unaware it was meant to be there.

## Data protection

Recipients do not have to be practice members — a PCN or ICB contact is
a real case. Recipients that are not members are flagged amber in the
setup screen with an explicit warning, stored with `external: true`, and
counted in `report_send_log.external_count`, so sends outside the
practice boundary stay visible in the audit trail rather than being
indistinguishable from internal ones.

Every email carries a footer asking recipients not to forward it outside
their organisation.
