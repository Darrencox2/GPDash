-- ============================================================================
-- Meeting schedules — recurring meeting definitions (Stage 2a)
-- ============================================================================
-- Define a recurring meeting (e.g. "weekly partners meeting, Tuesdays") once;
-- the app generates meetings rows forward from it. Each generated meeting
-- links back via meetings.schedule_id so the table can show which series an
-- occurrence belongs to and top up future dates over time.
--
-- Leadership-tier only, mirroring the meetings RLS (is_practice_leadership).
-- ============================================================================

create table if not exists public.meeting_schedules (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  meeting_type text not null default 'partners' check (char_length(meeting_type) <= 60),
  cadence text not null check (cadence in ('weekly', 'fortnightly', 'monthly')),
  -- weekly/fortnightly: day_of_week 0=Sun..6=Sat. monthly: day_of_month 1..28.
  day_of_week int check (day_of_week between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  start_time time,
  location text check (char_length(location) <= 200),
  -- anchor date for fortnightly parity + generation start
  anchor_date date not null default current_date,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meeting_schedules_practice_idx
  on public.meeting_schedules (practice_id);

-- Link generated meetings back to their schedule (nullable: one-off meetings
-- have no schedule). on delete set null so deleting a schedule keeps history.
alter table public.meetings
  add column if not exists schedule_id uuid references public.meeting_schedules(id) on delete set null;
create index if not exists meetings_schedule_idx on public.meetings (schedule_id);

-- updated_at trigger (reuse the meetings touch function)
drop trigger if exists meeting_schedules_touch on public.meeting_schedules;
create trigger meeting_schedules_touch before update on public.meeting_schedules
  for each row execute function public.touch_meetings_updated_at();

-- RLS — leadership only, same pattern as meetings
alter table public.meeting_schedules enable row level security;
drop policy if exists meeting_schedules_all on public.meeting_schedules;
create policy meeting_schedules_all on public.meeting_schedules for all
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id))
  with check (public.is_platform_admin() or public.is_practice_leadership(practice_id));
