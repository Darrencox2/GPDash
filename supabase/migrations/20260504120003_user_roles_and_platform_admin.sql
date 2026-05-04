-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 014: User roles & platform admin
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Phase A of the role overhaul. Schema + RLS only — no UI changes yet.
--
-- Adds:
--   - profiles.is_platform_admin flag (the site owner — Darren)
--   - Third practice role 'user' (read-mostly, can edit own rota notes)
--   - Helper functions: is_platform_admin(), is_practice_admin() now
--     returns true for platform admin too (override everywhere)
--   - Trigger preventing removal/demotion of the last owner of a practice
--
-- Updates RLS so:
--   - Platform admin can SELECT every practice-scoped row (read-anywhere
--     for support), and the existing _admin policies already let them
--     write because is_practice_admin() returns true for them
--   - 'user' role members can SELECT practice data the same as before
--     but the existing _admin write policies block them automatically
--     (since they're not 'owner' or 'admin')
--   - practice_users and profiles SELECT is tightened: 'user' role
--     members no longer see other members, only themselves; admin/owner
--     keep the previous "see everyone in your practice" view
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Schema: platform admin flag + user role ───────────────────────────

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false;

-- Set the platform admin (Darren). Hardcoded UUID is fine — there is exactly
-- one site owner and the value is stable.
update public.profiles
set is_platform_admin = true
where id = 'a8a191fe-e94c-49cf-bf9b-0faab74db87e';

-- Allow 'user' as a third role on practice_users.
-- The existing constraint (from migration 001) limits roles to owner/admin.
alter table public.practice_users
  drop constraint if exists practice_users_role_check;

alter table public.practice_users
  add constraint practice_users_role_check
  check (role in ('owner', 'admin', 'user'));


-- ─── 2. Helper: is the current user a platform admin? ─────────────────────
-- security definer so the function can read profiles.is_platform_admin
-- regardless of the caller's RLS view of profiles.

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


-- ─── 3. Update is_practice_admin() to honor platform admin ────────────────
-- Platform admin gets write access to every practice. Easier than adding
-- "or is_platform_admin()" to a dozen separate policies — this one update
-- propagates to every existing _admin policy that already calls
-- is_practice_admin().

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


-- ─── 4. Helper: my role in a given practice ───────────────────────────────
-- Returns 'owner' | 'admin' | 'user' | null. Used by the server-side
-- dashboard loader to expose role info to the UI for edit-gating.

create or replace function public.my_practice_role(target_practice_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.practice_users
  where practice_id = target_practice_id
    and user_id = auth.uid()
$$;

revoke all on function public.my_practice_role(uuid) from public;
grant execute on function public.my_practice_role(uuid) to authenticated;


-- ─── 5. Helper: is the current user owner of this practice? ───────────────
-- For the few things only owners can do (e.g. edit slug, transfer ownership,
-- manage billing later). Platform admin acts as owner everywhere.

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


-- ─── 6. Tighten practices SELECT: include platform admin ──────────────────
-- A platform admin should see every practice in the system.

drop policy if exists practices_select_member on public.practices;

create policy practices_select_member
  on public.practices for select
  using (
    public.is_platform_admin()
    or id in (select public.user_practice_ids())
  );


-- ─── 7. Tighten practices UPDATE: owner-only for the row ──────────────────
-- Migration 002 (practices_update_policy) granted UPDATE to admin+owner.
-- Tightening to owner-only — admins shouldn't be able to rename the
-- practice or change the slug. Platform admin still passes via the
-- is_practice_owner() override.

drop policy if exists practices_update_admin on public.practices;

create policy practices_update_owner
  on public.practices for update
  using (public.is_practice_owner(id))
  with check (public.is_practice_owner(id));


-- ─── 8. Tighten practice_users SELECT: 'user' sees only self ──────────────
-- Previously: any member could see all members of their practice.
-- Now: owners and admins see all; 'user' role sees only their own row.
-- Platform admin sees everything.

drop policy if exists practice_users_select_member on public.practice_users;

create policy practice_users_select_member
  on public.practice_users for select
  using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or public.is_practice_admin(practice_id)
  );


-- ─── 9. Tighten profiles SELECT: 'user' sees only self ────────────────────
-- Previously: a member could see all profiles of others in the same
-- practice. Now: 'user' role sees only themselves; admin/owner of any
-- shared practice see each other's profiles; platform admin sees everyone.

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


-- ─── 10. Last-owner protection trigger ────────────────────────────────────
-- Prevent removing or demoting the last owner of a practice. Without this,
-- a practice can become unmanageable if its sole owner leaves or changes
-- their role.

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
