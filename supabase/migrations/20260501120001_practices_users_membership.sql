-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 001: practices, profiles, practice_users
-- ═══════════════════════════════════════════════════════════════════════════
--
-- This is a tiny first migration to validate our schema approach before the
-- full v4 schema. It creates three tables and proper row-level security:
--
--   practices       — one row per GP practice (the tenant)
--   profiles        — extends auth.users with display info (name, etc.)
--   practice_users  — membership: which user belongs to which practice + role
--
-- Run this in: Supabase dashboard → SQL Editor → New query → paste → Run
--
-- After running, the v4-test page should be able to read practices it has
-- access to (initially none, since no users exist yet).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. practices table ──────────────────────────────────────────────────
-- A "practice" is a tenant. Each practice has many users and isolated data.
create table public.practices (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  ods_code    text,                              -- NHS practice code (optional)
  region      text,                              -- e.g. "South West", optional
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helpful index for finding practices by ODS code
create unique index practices_ods_code_idx
  on public.practices (ods_code)
  where ods_code is not null;


-- ─── 2. profiles table ──────────────────────────────────────────────────
-- Extends auth.users (Supabase's built-in users table) with our app's
-- profile fields. Linked 1:1 by id. Created automatically when a user signs up
-- (via the trigger below).
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ─── 3. practice_users table ────────────────────────────────────────────
-- Membership table: which users belong to which practices, and what role.
-- A user can be in multiple practices (e.g. a locum).
create type public.practice_role as enum ('owner', 'admin', 'clinician', 'receptionist');

create table public.practice_users (
  practice_id  uuid not null references public.practices(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         public.practice_role not null default 'clinician',
  joined_at    timestamptz not null default now(),
  invited_by   uuid references auth.users(id),
  primary key (practice_id, user_id)
);

create index practice_users_user_id_idx on public.practice_users (user_id);


-- ─── 4. Auto-create profile on signup ───────────────────────────────────
-- When a new user signs up via Supabase Auth, automatically create a row
-- in public.profiles. Avoids us having to remember to do it from app code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — enforces tenant isolation at the database level
-- ═══════════════════════════════════════════════════════════════════════════
-- These policies mean: even if our app code has bugs, the database itself
-- prevents user A from seeing user B's data. RLS is enforced on every query.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.practices       enable row level security;
alter table public.profiles        enable row level security;
alter table public.practice_users  enable row level security;


-- ─── practices policies ─────────────────────────────────────────────────
-- A user can SELECT a practice only if they're a member of it.
create policy practices_select_member
  on public.practices for select
  using (
    id in (
      select practice_id from public.practice_users
      where user_id = (select auth.uid())
    )
  );

-- For now, INSERT/UPDATE/DELETE on practices is locked down (handled later
-- via signup flow with elevated privileges). This is intentional — we don't
-- want anyone to be able to create practices arbitrarily yet.


-- ─── profiles policies ──────────────────────────────────────────────────
-- A user can SELECT their own profile.
create policy profiles_select_own
  on public.profiles for select
  using (id = (select auth.uid()));

-- A user can SELECT profiles of others in the same practice (so we can show
-- "Allocated to: Dr Smith" etc).
create policy profiles_select_same_practice
  on public.profiles for select
  using (
    id in (
      select pu.user_id from public.practice_users pu
      where pu.practice_id in (
        select practice_id from public.practice_users
        where user_id = (select auth.uid())
      )
    )
  );

-- A user can UPDATE their own profile.
create policy profiles_update_own
  on public.profiles for update
  using (id = (select auth.uid()));


-- ─── practice_users policies ────────────────────────────────────────────
-- A user can SELECT membership rows for practices they belong to.
-- (So they can see who else is in their practice and what role they have.)
create policy practice_users_select_member
  on public.practice_users for select
  using (
    practice_id in (
      select practice_id from public.practice_users
      where user_id = (select auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE on practice_users is locked down for now.
-- Will be opened up via specific function calls (invite, role change, leave)
-- in a later migration.


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. To verify, run in SQL editor:
--
--   select * from public.practices;     -- should be 0 rows (RLS hides nothing)
--   select count(*) from public.practices;  -- 0
--
-- After signing up via Supabase Auth (later migration), the trigger should
-- auto-create a profiles row.
-- ═══════════════════════════════════════════════════════════════════════════
