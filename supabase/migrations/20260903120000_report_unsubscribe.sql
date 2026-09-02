-- "Stop sending this to me" for scheduled report emails.
--
-- Recipients of a scheduled report are not necessarily GPDash users — a PCN
-- or ICB contact has no account and never will — so the link in the email
-- has to work with no login. It carries an opaque per-recipient token, and
-- nothing else: no email address in the URL, because that would put personal
-- data in a query string that lands in server logs, proxies and browser
-- history.
--
-- Two levels of opting out:
--
--   1. This schedule only. Recorded in place on the recipient inside
--      report_schedules.recipients, as unsubscribedAt. The person stays in
--      the list, struck through, so the admin can see who left and when
--      rather than watching the list silently shrink.
--
--   2. Every report email from the practice. Recorded in
--      report_email_optouts, which is a suppression list consulted at send
--      time. It has to outlive the schedules themselves: an unsubscribe that
--      an admin can undo by adding the address to a new schedule tomorrow is
--      not an unsubscribe.

-- ─── 1. Practice-wide suppression list ───────────────────────────────────
create table if not exists public.report_email_optouts (
  practice_id uuid not null references public.practices(id) on delete cascade,
  email text not null,
  opted_out_at timestamptz not null default now(),
  -- Which schedule's email the link came from, for the audit trail. Nulled
  -- rather than cascaded away so the record survives the schedule.
  source_schedule_id uuid references public.report_schedules(id) on delete set null,
  primary key (practice_id, email)
);

comment on table public.report_email_optouts is
  'Addresses that have opted out of every scheduled report email from a practice. Checked at send time, and outlives the schedules, so re-adding the address to a new schedule does not resume sending.';

-- ─── 2. Why a schedule stopped ───────────────────────────────────────────
-- A schedule whose last recipient unsubscribes is paused rather than left
-- active, because an active schedule that can never send is a lie. The
-- reason is kept so the UI can say what happened instead of just showing
-- it switched off.
alter table public.report_schedules
  add column if not exists pause_reason text;

comment on column public.report_schedules.pause_reason is
  'Why the schedule was paused automatically, e.g. every recipient unsubscribed. Null when a human paused it.';

-- ─── 3. Token lookup ─────────────────────────────────────────────────────
-- The unsubscribe page resolves a token to a schedule with a containment
-- query against the recipients array:
--   where recipients @> '[{"token":"..."}]'
-- jsonb_path_ops is the smaller, faster index for @> specifically, which is
-- the only operator this lookup uses.
create index if not exists report_schedules_recipients_idx
  on public.report_schedules using gin (recipients jsonb_path_ops);

-- ─── 4. RLS ──────────────────────────────────────────────────────────────
alter table public.report_email_optouts enable row level security;

-- Members can see who has opted out of their practice's reports, so the
-- setup screen can warn before re-adding a suppressed address.
drop policy if exists report_email_optouts_select on public.report_email_optouts;
create policy report_email_optouts_select
  on public.report_email_optouts for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = report_email_optouts.practice_id
        and pu.user_id = auth.uid()
    )
  );

-- An admin can lift an opt-out, but only on request from the person
-- themselves — the UI says so. Writes from the unsubscribe link itself go
-- through the service role, which bypasses RLS, because the person clicking
-- has no session at all.
drop policy if exists report_email_optouts_modify on public.report_email_optouts;
create policy report_email_optouts_modify
  on public.report_email_optouts for all
  using (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  );
