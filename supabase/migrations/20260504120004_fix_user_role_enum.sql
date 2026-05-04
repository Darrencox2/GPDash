-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 015: Corrective — fix 'user' role on practice_role enum
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase A migration 014 had a bug: it tried to add a check constraint
--
--   check (role in ('owner', 'admin', 'user'))
--
-- but practice_role is an ENUM, not a free-text column. The string 'user'
-- isn't a valid enum value, so Postgres either rejected the constraint
-- (rolling back the whole migration) or accepted it in a way that 'user'
-- is still unassignable.
--
-- This migration:
--   1. Adds 'user' to the practice_role enum properly
--   2. Drops the bogus check constraint if it exists
--   3. Re-applies the rest of Phase A idempotently in case the previous
--      migration rolled back. All operations use IF NOT EXISTS or
--      CREATE OR REPLACE so re-running is safe.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Fix the enum ──────────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS works in PG 12+ and is idempotent.
-- Note: this cannot run inside a transaction in older PG versions, but
-- Supabase migrations on PG 14+ handle this fine.

alter type public.practice_role add value if not exists 'user';

-- Drop the bogus constraint from migration 014 if it somehow got created.
alter table public.practice_users
  drop constraint if exists practice_users_role_check;


-- ─── 2. Re-apply Phase A idempotently ─────────────────────────────────────
-- Below is a defensive re-run of every Phase A operation in case migration
-- 014 rolled back. Each statement is idempotent.

-- Platform admin column
alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

-- Set Darren as platform admin
update public.profiles
set is_platform_admin = true
where id = 'a8a191fe-e94c-49cf-bf9b-0faab74db87e';

-- Helper: is_platform_admin()
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid()),
    false
  )
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

-- Helper: is_practice_admin() now honors platform admin
create or replace function public.is_practice_admin(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users
      where practice_id = target_practice_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
$$;

-- Helper: my_practice_role()
create or replace function public.my_practice_role(target_practice_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.practice_users
  where practice_id = target_practice_id
    and user_id = auth.uid()
$$;
revoke all on function public.my_practice_role(uuid) from public;
grant execute on function public.my_practice_role(uuid) to authenticated;

-- Helper: is_practice_owner()
create or replace function public.is_practice_owner(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users
      where practice_id = target_practice_id
        and user_id = auth.uid()
        and role = 'owner'
    )
$$;
revoke all on function public.is_practice_owner(uuid) from public;
grant execute on function public.is_practice_owner(uuid) to authenticated;

-- RLS: practices SELECT
drop policy if exists practices_select_member on public.practices;
create policy practices_select_member
  on public.practices for select
  using (
    public.is_platform_admin()
    or id in (select public.user_practice_ids())
  );

-- RLS: practices UPDATE (owner-only, platform admin override)
drop policy if exists practices_update_admin on public.practices;
drop policy if exists practices_update_owner on public.practices;
create policy practices_update_owner
  on public.practices for update
  using (public.is_practice_owner(id))
  with check (public.is_practice_owner(id));

-- RLS: practice_users SELECT (admin/owner sees all, others see only self)
drop policy if exists practice_users_select_member on public.practice_users;
create policy practice_users_select_member
  on public.practice_users for select
  using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or public.is_practice_admin(practice_id)
  );

-- RLS: profiles SELECT (admin/owner of shared practice, self, or platform admin)
drop policy if exists profiles_select_same_practice on public.profiles;
create policy profiles_select_same_practice
  on public.profiles for select
  using (
    public.is_platform_admin()
    or id = auth.uid()
    or exists (
      select 1
      from public.practice_users me
      join public.practice_users them
        on them.practice_id = me.practice_id
      where me.user_id = auth.uid()
        and me.role in ('owner', 'admin')
        and them.user_id = profiles.id
    )
  );

-- Last-owner protection trigger
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
as $$
declare
  remaining_owners integer;
begin
  if (TG_OP = 'DELETE' and old.role = 'owner')
     or (TG_OP = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = old.practice_id
      and role = 'owner'
      and user_id <> old.user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot remove or demote the last owner of a practice. Promote another member to owner first.';
    end if;
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists ensure_practice_has_owner on public.practice_users;
create trigger ensure_practice_has_owner
  before update or delete on public.practice_users
  for each row
  execute function public.prevent_last_owner_removal();
