-- ============================================================================
-- Meetings module — data model (Stage 1)
-- ============================================================================
-- Confidential leadership feature: agendas, minutes, and a cross-meeting
-- action log. Restricted to the leadership tier (owner / partner /
-- practice_manager) via is_practice_leadership(). Operational admins and all
-- other staff have NO access — partner meetings contain confidential matter
-- (pay, HR, complaints), so every policy gates on is_practice_leadership(),
-- not is_practice_admin().
--
-- Three tables, all practice-scoped with cascade delete:
--   meetings        — one row per meeting (date, type, status, attendees)
--   agenda_items    — ordered items within a meeting; hold the discussion
--                     note + outcome (the minutes ARE the agenda, filled in)
--   meeting_actions — actions arising; the cross-meeting action register
-- ============================================================================

-- ─── 1. meetings ─────────────────────────────────────────────────────────
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  title text not null check (char_length(title) <= 200),
  meeting_type text not null default 'partners' check (char_length(meeting_type) <= 60),
  meeting_date date not null,
  start_time time,
  location text check (char_length(location) <= 200),
  attendees jsonb not null default '[]'::jsonb,  -- [{name, present}] free-form snapshot
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'minuted', 'cancelled')),
  notes text check (char_length(notes) <= 5000),  -- general meeting-level notes
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists meetings_practice_date_idx
  on public.meetings (practice_id, meeting_date desc);

-- ─── 2. agenda_items ─────────────────────────────────────────────────────
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  position int not null default 0,                 -- ordering within the meeting
  title text not null check (char_length(title) <= 300),
  owner_name text check (char_length(owner_name) <= 120),  -- who leads this item
  pre_notes text check (char_length(pre_notes) <= 4000),   -- pre-reading / agenda detail
  minute_note text check (char_length(minute_note) <= 8000), -- what was discussed
  outcome text check (outcome in ('decision', 'noted', 'deferred', 'action')),
  carried_from uuid references public.agenda_items(id) on delete set null, -- deferred-forward link
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agenda_items_meeting_idx
  on public.agenda_items (meeting_id, position);
create index if not exists agenda_items_practice_idx
  on public.agenda_items (practice_id);

-- ─── 3. meeting_actions ──────────────────────────────────────────────────
create table if not exists public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete set null,   -- meeting it arose in
  agenda_item_id uuid references public.agenda_items(id) on delete set null,
  description text not null check (char_length(description) <= 2000),
  assignee_name text check (char_length(assignee_name) <= 120),
  due_date date,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done', 'cancelled')),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meeting_actions_practice_status_idx
  on public.meeting_actions (practice_id, status);
create index if not exists meeting_actions_meeting_idx
  on public.meeting_actions (meeting_id);

-- ─── 4. updated_at triggers ──────────────────────────────────────────────
create or replace function public.touch_meetings_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists meetings_touch on public.meetings;
create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_meetings_updated_at();
drop trigger if exists agenda_items_touch on public.agenda_items;
create trigger agenda_items_touch before update on public.agenda_items
  for each row execute function public.touch_meetings_updated_at();
drop trigger if exists meeting_actions_touch on public.meeting_actions;
create trigger meeting_actions_touch before update on public.meeting_actions
  for each row execute function public.touch_meetings_updated_at();

-- ─── 5. RLS — leadership tier ONLY ───────────────────────────────────────
-- Every policy gates on is_practice_leadership(practice_id): owner / partner /
-- practice_manager only. Platform admins included for support. Operational
-- admins and all other staff are denied entirely.
alter table public.meetings enable row level security;
alter table public.agenda_items enable row level security;
alter table public.meeting_actions enable row level security;

-- meetings
drop policy if exists meetings_all on public.meetings;
create policy meetings_all on public.meetings for all
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id))
  with check (public.is_platform_admin() or public.is_practice_leadership(practice_id));

-- agenda_items
drop policy if exists agenda_items_all on public.agenda_items;
create policy agenda_items_all on public.agenda_items for all
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id))
  with check (public.is_platform_admin() or public.is_practice_leadership(practice_id));

-- meeting_actions
drop policy if exists meeting_actions_all on public.meeting_actions;
create policy meeting_actions_all on public.meeting_actions for all
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id))
  with check (public.is_platform_admin() or public.is_practice_leadership(practice_id));
