-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 005: clinicians table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The clinicians table replaces data.clinicians[] in the Redis blob.
-- Each clinician belongs to exactly one practice (FK to practices).
-- A clinician may or may not be linked to a user account (e.g. some clinicians
-- view their rota via the public link without logging in).
--
-- The link to a user account (`linked_user_id`) is set when:
--   - A user with practice membership claims this clinician as themselves
--   - An admin manually links them
-- It is intentionally separate from practice_users — a "clinician" is a
-- record about a person's working pattern, while a "practice_user" is an
-- account with login access. They overlap (a GP user is both) but are
-- conceptually different (a receptionist is a user but not a clinician;
-- a locum's clinician record might exist before they ever log in).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Enums ──────────────────────────────────────────────────────────────
create type public.clinician_group as enum ('gp', 'nursing', 'allied', 'admin');
create type public.clinician_status as enum ('active', 'left', 'administrative');


-- ─── 1. clinicians table ────────────────────────────────────────────────
create table public.clinicians (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references public.practices(id) on delete cascade,

  -- Identity
  name            text not null,                              -- "Cox, Dr Darren"
  title           text,                                       -- "Dr"
  initials        text,                                       -- "DC"
  role            text,                                       -- "GP Partner", "ANP", etc.
  group_id        public.clinician_group not null default 'gp',
  status          public.clinician_status not null default 'active',

  -- Pattern + cover
  sessions        smallint default 0,                         -- weekly sessions (0-10)
  buddy_cover     boolean not null default false,             -- participates in buddy cover
  can_provide_cover boolean not null default true,            -- can be allocated to cover others

  -- Identity matching for CSV imports
  -- The CSV uses arbitrary names; we match by exact name or aliases.
  aliases         text[] default array[]::text[],

  -- Optional link to a user account (so My Rota knows "this is me")
  linked_user_id  uuid references auth.users(id) on delete set null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id),
  updated_by      uuid references auth.users(id)
);

-- Indexes
create index clinicians_practice_id_idx     on public.clinicians (practice_id);
create index clinicians_practice_status_idx on public.clinicians (practice_id, status);
create index clinicians_linked_user_idx     on public.clinicians (linked_user_id) where linked_user_id is not null;

-- Initials must be unique within a practice for active clinicians
-- (avoids ambiguity in the UI). Allows duplicates for left/admin where they
-- aren't displayed.
create unique index clinicians_practice_initials_active_uidx
  on public.clinicians (practice_id, lower(initials))
  where status = 'active' and initials is not null;


-- ─── 2. updated_at trigger ──────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clinicians_set_updated_at
  before update on public.clinicians
  for each row execute function public.set_updated_at();


-- ─── 3. Row-level security ──────────────────────────────────────────────
alter table public.clinicians enable row level security;

-- All practice members can SELECT clinicians of their practice
create policy clinicians_select_member
  on public.clinicians for select
  using (practice_id in (select public.user_practice_ids()));

-- Owners and admins can INSERT/UPDATE/DELETE clinicians in their practice
-- Helper function: is the caller an owner/admin of the practice?
create or replace function public.is_practice_admin(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.practice_users
    where practice_id = target_practice_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
$$;

revoke all on function public.is_practice_admin(uuid) from public;
grant execute on function public.is_practice_admin(uuid) to authenticated;

create policy clinicians_insert_admin
  on public.clinicians for insert
  with check (public.is_practice_admin(practice_id));

create policy clinicians_update_admin
  on public.clinicians for update
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

create policy clinicians_delete_admin
  on public.clinicians for delete
  using (public.is_practice_admin(practice_id));


-- ─── 4. Helper: claim_clinician_as_self() ───────────────────────────────
-- Allows a logged-in user to claim a clinician record as themselves.
-- The clinician must belong to a practice the user is a member of, and
-- must not already be linked to a different user.
-- Practice admins can also link any clinician to any user via UPDATE.
create or replace function public.claim_clinician_as_self(target_clinician_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  clin_row public.clinicians;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into clin_row from public.clinicians where id = target_clinician_id;
  if clin_row.id is null then
    raise exception 'Clinician not found';
  end if;

  -- Caller must be a member of this practice
  if not exists (
    select 1 from public.practice_users
    where practice_id = clin_row.practice_id and user_id = caller_id
  ) then
    raise exception 'You are not a member of this practice';
  end if;

  -- If already linked to someone else, block (admin must manually re-link)
  if clin_row.linked_user_id is not null and clin_row.linked_user_id != caller_id then
    raise exception 'This clinician is already linked to a different user';
  end if;

  update public.clinicians
  set linked_user_id = caller_id, updated_at = now(), updated_by = caller_id
  where id = target_clinician_id;
end;
$$;

revoke all on function public.claim_clinician_as_self(uuid) from public;
grant execute on function public.claim_clinician_as_self(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- A clinician record can now be created/edited only by practice admins.
-- Members can read all clinicians of their practice.
-- Users can claim themselves to a clinician record (for "My Rota").
-- ═══════════════════════════════════════════════════════════════════════════
