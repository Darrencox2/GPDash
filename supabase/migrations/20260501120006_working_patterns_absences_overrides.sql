-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 006: working_patterns + absences + daily_overrides
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These three tables together describe "is this clinician working on this
-- date?" for any clinician and date.
--
-- Resolution order (highest to lowest priority):
--   1. daily_overrides — explicit "in" or "off" for a specific date
--   2. absences         — date range marking the clinician absent
--   3. working_patterns — the regular weekly pattern, possibly versioned
--                          by effective_from / effective_to
--
-- working_patterns is versioned so we can preserve history when a clinician
-- changes their working days. Old patterns aren't deleted; instead a new row
-- is inserted with effective_from set to the change date, and the previous
-- row's effective_to is set to the day before.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. working_patterns ────────────────────────────────────────────────
-- A versioned weekly pattern: which mornings/afternoons the clinician works.
-- Pattern stored as JSONB for flexibility (mon-am-in, mon-pm-off, etc.)
create table public.working_patterns (
  id              uuid primary key default gen_random_uuid(),
  clinician_id    uuid not null references public.clinicians(id) on delete cascade,
  effective_from  date not null,
  effective_to    date,                                       -- null = current
  pattern         jsonb not null,                             -- { mon: { am: 'in', pm: 'off' }, ... }
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

create index working_patterns_clinician_idx
  on public.working_patterns (clinician_id, effective_from desc);

-- Convenience: only one "current" pattern per clinician
create unique index working_patterns_current_uidx
  on public.working_patterns (clinician_id)
  where effective_to is null;


-- ─── 2. absences ────────────────────────────────────────────────────────
-- Date-range absences. Reason is a controlled vocabulary to avoid storing
-- free-text health data — important for IG compliance.
create type public.absence_reason as enum (
  'annual_leave',
  'training',
  'study_leave',
  'unwell',
  'parental_leave',
  'compassionate',
  'other'
);

create table public.absences (
  id            uuid primary key default gen_random_uuid(),
  clinician_id  uuid not null references public.clinicians(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        public.absence_reason not null default 'other',
  notes         text,                                          -- free-text optional notes (no health data)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  updated_by    uuid references auth.users(id),

  constraint absences_date_range_check check (end_date >= start_date)
);

create index absences_clinician_dates_idx
  on public.absences (clinician_id, start_date, end_date);

-- updated_at trigger
create trigger absences_set_updated_at
  before update on public.absences
  for each row execute function public.set_updated_at();


-- ─── 3. daily_overrides ─────────────────────────────────────────────────
-- Single-day override. e.g. "in this Saturday" or "off Tuesday afternoon".
create type public.session_state as enum ('in', 'off');

create table public.daily_overrides (
  clinician_id  uuid not null references public.clinicians(id) on delete cascade,
  date          date not null,
  am            public.session_state,                          -- null = no override
  pm            public.session_state,                          -- null = no override
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  updated_by    uuid references auth.users(id),

  primary key (clinician_id, date)
);

create trigger daily_overrides_set_updated_at
  before update on public.daily_overrides
  for each row execute function public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW-LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: is the clinician this row references in a practice the caller
-- is a member of? Bypasses RLS via SECURITY DEFINER so policies can use it
-- without recursion.
create or replace function public.clinician_in_my_practice(target_clinician_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinicians c
    where c.id = target_clinician_id
      and c.practice_id in (select public.user_practice_ids())
  )
$$;

revoke all on function public.clinician_in_my_practice(uuid) from public;
grant execute on function public.clinician_in_my_practice(uuid) to authenticated;


-- Helper: is the caller an admin of the practice that owns this clinician?
create or replace function public.clinician_admin_check(target_clinician_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.clinicians c
    where c.id = target_clinician_id
      and public.is_practice_admin(c.practice_id)
  )
$$;

revoke all on function public.clinician_admin_check(uuid) from public;
grant execute on function public.clinician_admin_check(uuid) to authenticated;


-- ─── working_patterns RLS ───────────────────────────────────────────────
alter table public.working_patterns enable row level security;

create policy working_patterns_select_member
  on public.working_patterns for select
  using (public.clinician_in_my_practice(clinician_id));

create policy working_patterns_insert_admin
  on public.working_patterns for insert
  with check (public.clinician_admin_check(clinician_id));

create policy working_patterns_update_admin
  on public.working_patterns for update
  using (public.clinician_admin_check(clinician_id))
  with check (public.clinician_admin_check(clinician_id));

create policy working_patterns_delete_admin
  on public.working_patterns for delete
  using (public.clinician_admin_check(clinician_id));


-- ─── absences RLS ───────────────────────────────────────────────────────
alter table public.absences enable row level security;

create policy absences_select_member
  on public.absences for select
  using (public.clinician_in_my_practice(clinician_id));

-- Clinicians can insert/update their OWN absences. Admins can manage anyone's.
create policy absences_insert_self_or_admin
  on public.absences for insert
  with check (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );

create policy absences_update_self_or_admin
  on public.absences for update
  using (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );

create policy absences_delete_self_or_admin
  on public.absences for delete
  using (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );


-- ─── daily_overrides RLS ────────────────────────────────────────────────
alter table public.daily_overrides enable row level security;

create policy daily_overrides_select_member
  on public.daily_overrides for select
  using (public.clinician_in_my_practice(clinician_id));

-- Same self-or-admin pattern as absences
create policy daily_overrides_insert_self_or_admin
  on public.daily_overrides for insert
  with check (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );

create policy daily_overrides_update_self_or_admin
  on public.daily_overrides for update
  using (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );

create policy daily_overrides_delete_self_or_admin
  on public.daily_overrides for delete
  using (
    public.clinician_admin_check(clinician_id)
    or exists (
      select 1 from public.clinicians c
      where c.id = clinician_id and c.linked_user_id = (select auth.uid())
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Three tables, full RLS.
-- Note on policy pattern: "self_or_admin" means a clinician can manage their
-- own absences and overrides (they know best when they're unwell or swapping
-- a session) but admins can override.
-- ═══════════════════════════════════════════════════════════════════════════
