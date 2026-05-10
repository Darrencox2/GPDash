-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 036: practice-level member management RPCs
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now, members on a practice's Users tab have been read-only —
-- the only way to change someone's role or remove them was to ask a
-- platform admin to do it via /v4/admin/users. This migration adds:
--
--   set_practice_member_role(practice_id, user_id, new_role)
--   remove_practice_member(practice_id, user_id)
--
-- Both check the caller's permissions on the target practice itself,
-- so no platform-admin escalation is needed for normal practice-level
-- operations. Permission model:
--
--   Owner: can change/remove anyone except themselves (use leave or
--          transfer-ownership for self-actions, coming in a later push).
--          Cannot leave/remove themselves if they are the last owner.
--
--   Admin: can change/remove anyone except owners and themselves.
--          Cannot promote anyone to owner (only owners can).
--
--   User: no actions. RPCs raise 'forbidden'.
--
-- Platform admins bypass everything via the admin_*_membership RPCs
-- already added in migration 014 — those keep working as-is.
--
-- ─── Also ────────────────────────────────────────────────────────────────
-- list_practice_members extended to include linked clinician (id +
-- name) so the Users tab can show "linked to Dr Smith" / "Unlinked"
-- per row. The data was always available via a join — just wasn't
-- surfaced through the RPC.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. list_practice_members — add linked clinician fields ──────────────
-- DROP first because we're changing the TABLE return shape (lesson from
-- migrations 022/023). Idempotent.
drop function if exists public.list_practice_members(uuid);

create function public.list_practice_members(target_practice_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  role public.practice_role,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  linked_clinician_id uuid,
  linked_clinician_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pu.user_id,
    p.email,
    p.name,
    pu.role,
    pu.joined_at,
    u.last_sign_in_at,
    -- Link to clinician via clinicians.linked_user_id. There can only
    -- be one clinician linked to one user at a time (unique partial
    -- index in migration 005), so a 1:1 left join is correct.
    c.id as linked_clinician_id,
    c.name as linked_clinician_name
  from public.practice_users pu
  join public.profiles p on p.id = pu.user_id
  join auth.users u on u.id = pu.user_id
  left join public.clinicians c
    on c.linked_user_id = pu.user_id
    and c.practice_id = target_practice_id
  where pu.practice_id = target_practice_id
  order by
    -- Owners first, then admins, then users alphabetically by name.
    -- Stable presentation regardless of joined_at order.
    case pu.role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    coalesce(p.name, p.email);
$$;
revoke all on function public.list_practice_members(uuid) from public;
grant execute on function public.list_practice_members(uuid) to authenticated;


-- ─── 2. Helper: caller_practice_role(practice_id) ────────────────────────
-- Returns the calling user's role on the practice, or null if they're
-- not a member. Used by both RPCs below to avoid duplicating the
-- permission lookup.
create or replace function public.caller_practice_role(target_practice_id uuid)
returns public.practice_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.practice_users
  where practice_id = target_practice_id
    and user_id = auth.uid();
$$;
revoke all on function public.caller_practice_role(uuid) from public;
grant execute on function public.caller_practice_role(uuid) to authenticated;


-- ─── 3. set_practice_member_role ─────────────────────────────────────────
create or replace function public.set_practice_member_role(
  target_practice_id uuid,
  target_user_id uuid,
  new_role public.practice_role
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  target_role public.practice_role;
  remaining_owners int;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be a member of this practice (or platform admin).
  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role is null and not public.is_platform_admin() then
    raise exception 'You are not a member of this practice';
  end if;

  -- Look up target's current role on this practice
  select role into target_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;
  if target_role is null then
    raise exception 'That user is not a member of this practice';
  end if;

  -- ─── Permission rules ───────────────────────────────────────────────
  -- Self-edit: blocked. Owners use transfer_ownership (Push C); admins
  -- and users have no legitimate self-role-change use case.
  if target_user_id = caller_id then
    raise exception 'Cannot change your own role. Owners can transfer ownership; admins/users can leave the practice.';
  end if;

  -- Caller must be owner OR admin (or platform admin)
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can change member roles';
  end if;

  -- Admins cannot touch owners or promote anyone to owner
  if caller_role = 'admin' and not public.is_platform_admin() then
    if target_role = 'owner' then
      raise exception 'Admins cannot change the role of an owner';
    end if;
    if new_role = 'owner' then
      raise exception 'Only owners can promote someone to owner';
    end if;
  end if;

  -- Last-owner protection: don't allow demoting the last remaining owner
  if target_role = 'owner' and new_role <> 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id
      and role = 'owner'
      and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot demote the last owner. Promote someone else to owner first, or use transfer ownership.';
    end if;
  end if;

  -- ─── Apply ──────────────────────────────────────────────────────────
  update public.practice_users
  set role = new_role
  where practice_id = target_practice_id and user_id = target_user_id;

  return json_build_object(
    'ok', true,
    'practice_id', target_practice_id,
    'user_id', target_user_id,
    'role', new_role
  );
end;
$$;
revoke all on function public.set_practice_member_role(uuid, uuid, public.practice_role) from public;
grant execute on function public.set_practice_member_role(uuid, uuid, public.practice_role) to authenticated;


-- ─── 4. remove_practice_member ────────────────────────────────────────────
create or replace function public.remove_practice_member(
  target_practice_id uuid,
  target_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  target_role public.practice_role;
  remaining_owners int;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role is null and not public.is_platform_admin() then
    raise exception 'You are not a member of this practice';
  end if;

  select role into target_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;
  if target_role is null then
    raise exception 'That user is not a member of this practice';
  end if;

  -- Self-remove: blocked. Use leave_practice (Push C) for self-departures.
  -- Keeps remove_practice_member's intent narrow ("remove someone else")
  -- and lets us put the last-owner check on leave_practice's flavour
  -- of the lockout.
  if target_user_id = caller_id then
    raise exception 'Cannot remove yourself. Use "Leave practice" instead.';
  end if;

  -- Caller must be owner OR admin
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can remove members';
  end if;

  -- Admins cannot remove owners
  if caller_role = 'admin' and target_role = 'owner' and not public.is_platform_admin() then
    raise exception 'Admins cannot remove an owner';
  end if;

  -- Last-owner protection (defensive — shouldn't be reachable since
  -- self-remove is blocked above and admins can't remove owners, but
  -- belt-and-braces in case of platform-admin or future rule changes).
  if target_role = 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id
      and role = 'owner'
      and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot remove the last owner';
    end if;
  end if;

  delete from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;

  return json_build_object(
    'ok', true,
    'practice_id', target_practice_id,
    'user_id', target_user_id
  );
end;
$$;
revoke all on function public.remove_practice_member(uuid, uuid) from public;
grant execute on function public.remove_practice_member(uuid, uuid) to authenticated;
