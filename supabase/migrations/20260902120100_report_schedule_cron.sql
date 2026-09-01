-- The clock behind scheduled report emails.
--
-- WHY THIS LIVES IN POSTGRES AND NOT IN vercel.json
--
-- The Vercel project is on the hobby plan, where cron is capped at two
-- jobs running at once-a-day granularity — and retention-cleanup already
-- holds one of them. "Every Monday at 08:00" is not expressible there.
-- pg_cron is, it runs on every Supabase plan, and pg_net (already
-- installed) can reach back out to the app. So the clock is here and the
-- work stays in Next.js:
--
--   pg_cron (*/15) -> dispatch_report_schedules() -> net.http_post
--       -> https://<site>/api/cron/scheduled-reports
--       -> renders with lib/workload-report.js -> Resend -> report_send_log
--
-- The route, not this function, does the rendering: it has to import the
-- same report engine the on-screen builder uses, which is the only way
-- the emailed numbers cannot drift from the ones on the dashboard.
--
-- ONE-TIME SETUP (see docs/email-automation.md). Two Vault secrets:
--
--   select vault.create_secret('<CRON_SECRET>',  'gpdash_cron_secret');
--   select vault.create_secret('https://gpdash.net', 'gpdash_site_url');
--
-- Until both exist the dispatcher is a no-op — it will not fire, and it
-- will not error every 15 minutes either. The secret is never committed;
-- it must match CRON_SECRET in the Vercel environment.

-- ─── 1. Extension ────────────────────────────────────────────────────────
-- Wrapped so that a permissions quirk on the migration role cannot break
-- an otherwise unrelated deploy. If this warns, enable pg_cron once via
-- Dashboard -> Database -> Extensions; everything below is idempotent and
-- the next push completes the wiring.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise warning 'pg_cron could not be enabled automatically (%). Enable it in Dashboard -> Database -> Extensions, then re-run this migration.', sqlerrm;
end $$;

-- ─── 2. Dispatcher ───────────────────────────────────────────────────────
create or replace function public.dispatch_report_schedules()
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_secret text;
  v_url text;
  v_due integer;
begin
  -- Nothing due? Do not wake the app. This runs 96 times a day and most
  -- of those are quiet, so the cheap count comes before the HTTP call.
  select count(*) into v_due
  from public.report_schedules
  where active
    and next_send_at is not null
    and next_send_at <= now();

  if v_due = 0 then
    return;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'gpdash_cron_secret' limit 1;
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'gpdash_site_url' limit 1;

  if v_secret is null or v_url is null then
    raise notice 'dispatch_report_schedules: % schedule(s) due but gpdash_cron_secret / gpdash_site_url are not set in Vault; skipping.', v_due;
    return;
  end if;

  -- Fire and forget. pg_net queues the request and returns immediately;
  -- the route is responsible for its own retries and for writing the
  -- outcome to report_send_log. A schedule whose send fails keeps its
  -- next_send_at moved forward by the route, so a broken address cannot
  -- wedge the queue and block every other practice.
  perform net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/scheduled-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.dispatch_report_schedules() from public, anon, authenticated;

comment on function public.dispatch_report_schedules() is
  'Every 15 minutes: if any report schedule is due, POST /api/cron/scheduled-reports with the Vault-held CRON_SECRET. No-op when nothing is due or when the Vault secrets are unset.';

-- ─── 3. The job ──────────────────────────────────────────────────────────
-- Guarded on the extension actually being present so this file stays
-- runnable even if step 1 warned.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning 'pg_cron not installed; scheduled report emails will not dispatch until it is enabled and this migration is re-run.';
    return;
  end if;

  -- Idempotent: unschedule any previous definition before re-adding, so
  -- re-running this migration cannot leave two jobs racing each other.
  perform cron.unschedule('gpdash-dispatch-report-schedules')
  where exists (
    select 1 from cron.job where jobname = 'gpdash-dispatch-report-schedules'
  );

  perform cron.schedule(
    'gpdash-dispatch-report-schedules',
    '*/15 * * * *',
    $cron$ select public.dispatch_report_schedules(); $cron$
  );
end $$;
