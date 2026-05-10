-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 024: admin user management RPCs
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds the platform-admin RPCs needed by the /v4/admin/users/[id] page to
-- fully manage a user without going into the practice's own dashboard:
--
--   admin_delete_user(target_user_id)
--     Deletes the user from auth.users. profiles, practice_users, and
--     clinicians.linked_user_id are handled by the cascade / set-null
--     behaviour established in earlier migrations.
--
--   admin_set_user_membership(target_user_id, target_practice_id, new_role)
--     Adds the user to a practice with the given role, OR updates the
--     user's existing role within that practice. UPSERT semantics.
--
--   admin_remove_user_membership(target_user_id, target_practice_id)
--     Removes the user from the practice. Does NOT delete the user.
--
--   admin_update_user_profile(target_user_id, new_name, new_is_platform_admin)
--     Updates the profile name and/or the platform admin flag.
--     Both args optional (pass null to leave unchanged).
--
-- All four are platform-admin-only. They use the same is_platform_admin()
-- guard as the existing admin_* RPCs so behaviour is consistent.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. admin_delete_user ────────────────────────────────────────────────
-- Deletes the auth.users row. Cascades to profiles (id FK), practice_users
-- (user_id FK), and any clinicians.linked_user_id is set to null by the
-- existing FK ON DELETE SET NULL.
--
-- Safety: refuses to delete:
--   - the calling user themselves (use account-deletion flow)
--   - the last platform admin (lockout protection)
create or replace function public.admin_delete_user(target_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
  is_target_admin boolean;
  remaining_admins int;
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Refusing to delete yourself — sign out and use account deletion instead';
  end if;

  -- Pull email + admin status before deletion (so we can return them)
  select u.email, coalesce(pr.is_platform_admin, false)
  into user_email, is_target_admin
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where u.id = target_user_id;

  if user_email is null then
    raise exception 'User not found';
  end if;

  -- Lockout protection: if the target is a platform admin, refuse if
  -- they're the last one.
  if is_target_admin then
    select count(*) into remaining_admins
    from public.profiles
    where is_platform_admin = true and id <> target_user_id;
    if remaining_admins = 0 then
      raise exception 'Refusing to delete the last platform admin';
    end if;
  end if;

  -- Auth users delete cascades to profiles + practice_users via FK
  delete from auth.users where id = target_user_id;

  result := json_build_object(
    'deleted_user_id', target_user_id,
    'deleted_email', user_email,
    'was_platform_admin', is_target_admin
  );
  return result;
end;
$$;
revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;


-- ─── 2. admin_set_user_membership ────────────────────────────────────────
-- UPSERT the user into a practice with the given role. If a membership
-- already exists, updates the role. If not, creates one.
create or replace function public.admin_set_user_membership(
  target_user_id uuid,
  target_practice_id uuid,
  new_role public.practice_role
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  practice_name text;
  user_email text;
  existed boolean;
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  -- Validate both ends
  select email into user_email from auth.users where id = target_user_id;
  if user_email is null then raise exception 'User not found'; end if;

  select name into practice_name from public.practices where id = target_practice_id;
  if practice_name is null then raise exception 'Practice not found'; end if;

  -- Did a membership already exist?
  select exists(
    select 1 from public.practice_users
    where user_id = target_user_id and practice_id = target_practice_id
  ) into existed;

  insert into public.practice_users (user_id, practice_id, role)
  values (target_user_id, target_practice_id, new_role)
  on conflict (user_id, practice_id)
  do update set role = excluded.role;

  result := json_build_object(
    'user_id', target_user_id,
    'practice_id', target_practice_id,
    'practice_name', practice_name,
    'role', new_role,
    'created', not existed
  );
  return result;
end;
$$;
revoke all on function public.admin_set_user_membership(uuid, uuid, public.practice_role) from public;
grant execute on function public.admin_set_user_membership(uuid, uuid, public.practice_role) to authenticated;


-- ─── 3. admin_remove_user_membership ─────────────────────────────────────
-- Removes the user from the practice. The user themselves is unaffected.
--
-- Safety: refuses to remove a practice's last owner (would leave the
-- practice ownerless).
create or replace function public.admin_remove_user_membership(
  target_user_id uuid,
  target_practice_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_role public.practice_role;
  remaining_owners int;
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  select role into removed_role
  from public.practice_users
  where user_id = target_user_id and practice_id = target_practice_id;

  if removed_role is null then
    raise exception 'Membership not found';
  end if;

  if removed_role = 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id and role = 'owner' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'Refusing to remove the last owner of this practice';
    end if;
  end if;

  delete from public.practice_users
  where user_id = target_user_id and practice_id = target_practice_id;

  result := json_build_object(
    'user_id', target_user_id,
    'practice_id', target_practice_id,
    'removed_role', removed_role
  );
  return result;
end;
$$;
revoke all on function public.admin_remove_user_membership(uuid, uuid) from public;
grant execute on function public.admin_remove_user_membership(uuid, uuid) to authenticated;


-- ─── 4. admin_update_user_profile ────────────────────────────────────────
-- Updates the profile name and/or the is_platform_admin flag. Pass null
-- for either field to leave it unchanged.
--
-- Safety: refuses to demote the last platform admin (lockout protection,
-- same as admin_delete_user).
create or replace function public.admin_update_user_profile(
  target_user_id uuid,
  new_name text default null,
  new_is_platform_admin boolean default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  current_admin boolean;
  remaining_admins int;
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  select is_platform_admin into current_admin
  from public.profiles where id = target_user_id;

  if current_admin is null then
    raise exception 'Profile not found';
  end if;

  -- Lockout protection: if demoting from admin, ensure others remain.
  if new_is_platform_admin = false and current_admin = true then
    select count(*) into remaining_admins
    from public.profiles
    where is_platform_admin = true and id <> target_user_id;
    if remaining_admins = 0 then
      raise exception 'Refusing to demote the last platform admin';
    end if;
  end if;

  update public.profiles
  set
    name = coalesce(new_name, name),
    is_platform_admin = coalesce(new_is_platform_admin, is_platform_admin)
  where id = target_user_id;

  -- Re-read to return what's actually in the DB now.
  select json_build_object(
    'id', id,
    'name', name,
    'is_platform_admin', is_platform_admin
  ) into result
  from public.profiles where id = target_user_id;

  return result;
end;
$$;
revoke all on function public.admin_update_user_profile(uuid, text, boolean) from public;
grant execute on function public.admin_update_user_profile(uuid, text, boolean) to authenticated;
