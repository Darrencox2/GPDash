-- Scheduled report emails.
--
-- A practice builds a report in the report builder, saves it, and then
-- schedules it: "email this to these people every Monday at 08:00".
--
-- Two tables:
--
--   report_schedules       — the standing instruction: a cadence, a
--                            recipient list, and an email layout.
--
--   report_schedule_items  — which saved reports go in that email, and in
--                            what order. One email can carry several
--                            reports, so a practice gets a single Monday
--                            digest rather than four separate emails
--                            landing at once.
--
-- Items point at saved_reports rather than snapshotting their configs, so
-- editing a saved report changes what gets sent next time. That is the
-- intent: you perfect the report once and every schedule carrying it
-- follows. A deleted report cascades out of the bundles that carried it,
-- which is why this is a join table and not a uuid[] — an array cannot
-- carry a foreign key, so it would leave dangling ids behind.
--
--   report_send_log   — what actually happened on each attempt. Exists
--                       for the same reason practice_invites grew
--                       email_status in v4.139.0: an email that silently
--                       failed looked exactly like one that arrived, and
--                       nobody found out. A schedule must be able to say
--                       Sent / Failed / why.
--
-- Recipients are stored as JSONB rather than a join table because they
-- are not all users: a schedule can go to a PCN manager or an ICB
-- contact who has no GPDash account. Each entry is
-- { email, name, external } where external=true means "not a member of
-- this practice" — recorded at save time so the send log and the UI can
-- both flag data leaving the practice boundary without re-deriving it.
--
-- Read:  any practice member can see their practice's schedules.
-- Write: practice admins only (matches saved_reports).
-- The dispatcher runs as service role and bypasses RLS entirely.

-- ─── 1. Schedules ────────────────────────────────────────────────────────
create table if not exists public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,

  -- Cadence vocabulary is deliberately the same as meeting_schedules
  -- (lib/meeting-schedules.js) plus 'daily', so the app has one way of
  -- saying "every other Tuesday" rather than two.
  cadence text not null check (cadence in ('daily','weekly','fortnightly','monthly','monthly_nth')),
  day_of_week smallint check (day_of_week between 0 and 6),      -- 0 = Sunday
  day_of_month smallint check (day_of_month between 1 and 28),   -- capped at 28: every month has one
  week_of_month smallint check (week_of_month between 1 and 5),  -- 5 = last
  anchor_date date,                                              -- fortnightly parity

  -- Send time is practice-local (Europe/London) wall clock. next_send_at
  -- below is the resolved UTC instant, so BST is handled once at write
  -- time rather than every read. Minutes are quarter-hours because the
  -- dispatcher wakes every 15 minutes — offering 08:07 would be a lie.
  send_hour smallint not null default 8 check (send_hour between 0 and 23),
  send_minute smallint not null default 0 check (send_minute in (0,15,30,45)),

  recipients jsonb not null default '[]'::jsonb,
  layout jsonb not null default '{}'::jsonb,   -- which blocks the email includes
  subject text,
  intro text,

  active boolean not null default true,
  next_send_at timestamptz,
  last_sent_at timestamptz,
  last_status text check (last_status in ('sent','failed','skipped')),
  last_error text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- The dispatcher's only query: due schedules, soonest first.
create index if not exists report_schedules_due_idx
  on public.report_schedules (next_send_at)
  where active;

create index if not exists report_schedules_practice_idx
  on public.report_schedules (practice_id, created_at desc);

-- ─── 1b. Which reports go in the email ───────────────────────────────────
-- position orders the sections in the email. A schedule with no items left
-- (every report deleted) is skipped at send time with a recorded reason
-- rather than sending an empty digest.
create table if not exists public.report_schedule_items (
  schedule_id uuid not null references public.report_schedules(id) on delete cascade,
  saved_report_id uuid not null references public.saved_reports(id) on delete cascade,
  position smallint not null default 0,
  primary key (schedule_id, saved_report_id)
);

create index if not exists report_schedule_items_schedule_idx
  on public.report_schedule_items (schedule_id, position);

create index if not exists report_schedule_items_report_idx
  on public.report_schedule_items (saved_report_id);

-- ─── 2. Send log ─────────────────────────────────────────────────────────
create table if not exists public.report_send_log (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.report_schedules(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('sent','failed','skipped')),
  kind text not null default 'scheduled' check (kind in ('scheduled','test')),
  recipient_count integer not null default 0,
  external_count integer not null default 0,
  recipients jsonb,
  report_names text[],
  error text,
  provider_id text,                                   -- Resend message id, for support tickets
  triggered_by uuid references auth.users(id) on delete set null
);

create index if not exists report_send_log_schedule_idx
  on public.report_send_log (schedule_id, sent_at desc);

create index if not exists report_send_log_practice_idx
  on public.report_send_log (practice_id, sent_at desc);

-- ─── 3. Updated-at trigger ───────────────────────────────────────────────
create or replace function public.touch_report_schedules_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists report_schedules_touch_updated_at on public.report_schedules;
create trigger report_schedules_touch_updated_at
  before update on public.report_schedules
  for each row execute function public.touch_report_schedules_updated_at();

-- ─── 4. RLS ──────────────────────────────────────────────────────────────
alter table public.report_schedules enable row level security;
alter table public.report_schedule_items enable row level security;
alter table public.report_send_log enable row level security;

drop policy if exists report_schedules_select on public.report_schedules;
create policy report_schedules_select
  on public.report_schedules for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = report_schedules.practice_id
        and pu.user_id = auth.uid()
    )
  );

drop policy if exists report_schedules_modify on public.report_schedules;
create policy report_schedules_modify
  on public.report_schedules for all
  using (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  );

-- Items inherit their parent schedule's access: if you can see the
-- schedule you can see what is in it, and if you can change the schedule
-- you can change its contents.
drop policy if exists report_schedule_items_select on public.report_schedule_items;
create policy report_schedule_items_select
  on public.report_schedule_items for select
  using (
    exists (
      select 1 from public.report_schedules rs
      where rs.id = report_schedule_items.schedule_id
        and (
          public.is_platform_admin()
          or exists (
            select 1 from public.practice_users pu
            where pu.practice_id = rs.practice_id and pu.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists report_schedule_items_modify on public.report_schedule_items;
create policy report_schedule_items_modify
  on public.report_schedule_items for all
  using (
    exists (
      select 1 from public.report_schedules rs
      where rs.id = report_schedule_items.schedule_id
        and (public.is_platform_admin() or public.is_practice_admin(rs.practice_id))
    )
  )
  with check (
    exists (
      select 1 from public.report_schedules rs
      where rs.id = report_schedule_items.schedule_id
        and (public.is_platform_admin() or public.is_practice_admin(rs.practice_id))
    )
  );

-- The log is read-only to users: rows are written by the dispatcher and
-- the test-send route, both service role. Members can read their own
-- practice's history so "did Monday's report go?" is answerable in the UI.
drop policy if exists report_send_log_select on public.report_send_log;
create policy report_send_log_select
  on public.report_send_log for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = report_send_log.practice_id
        and pu.user_id = auth.uid()
    )
  );

comment on table public.report_schedules is
  'Standing instructions to email one or more saved reports on a cadence. Admin-write, member-read.';
comment on table public.report_schedule_items is
  'Which saved reports a schedule bundles into its email, and in what order. Deleting a report removes it from every bundle that carried it.';
comment on table public.report_send_log is
  'One row per scheduled or test send attempt, with the outcome. Read-only to users; written by the dispatcher under service role.';
comment on column public.report_schedules.next_send_at is
  'Resolved UTC instant of the next send. Computed by lib/report-schedules.js from the Europe/London wall clock above, so BST is handled at write time. The dispatcher recomputes it after each attempt.';
comment on column public.report_schedules.recipients is
  'Array of { email, name, external }. external=true means the address is not a member of this practice — recorded at save time so sends outside the practice boundary stay visible.';
