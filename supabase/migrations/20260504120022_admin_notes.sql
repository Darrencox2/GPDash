-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 032: admin_notes on profiles + RPC update
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a free-text admin_notes column on profiles so platform admins can
-- jot context that's useful during support calls / onboarding. Examples:
--   - "Called me about ODS code, helped them find it"
--   - "Wants free trial extension; circle back in two weeks"
--   - "Filed a complaint about clinician name parsing — see Slack thread"
--
-- Visibility: only platform admins can read or write this. RLS will
-- already prevent normal users from selecting it because the column is
-- on profiles which has its own row-level rules. We surface it through
-- the admin RPCs only — never include it in the regular profile fetch.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists admin_notes text;


-- ─── Surface in admin_get_user ────────────────────────────────────────────
create or replace function public.admin_get_user(target_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  select json_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'name', pr.name,
    'first_name', pr.first_name,
    'last_name', pr.last_name,
    'is_platform_admin', coalesce(pr.is_platform_admin, false),
    'admin_notes', pr.admin_notes,
    'memberships', coalesce((
      select json_agg(json_build_object(
        'practice_id', pu.practice_id,
        'practice_name', p.name,
        'practice_slug', p.slug,
        'role', pu.role,
        'joined_at', pu.joined_at
      ))
      from public.practice_users pu
      join public.practices p on p.id = pu.practice_id
      where pu.user_id = u.id
    ), '[]'::json)
  )
  into result
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where u.id = target_user_id;

  if result is null then
    raise exception 'User not found';
  end if;
  return result;
end;
$$;


-- ─── Allow updating via admin_update_user_profile ─────────────────────────
-- Adding a new optional arg (new_admin_notes) creates a new function
-- VARIANT — the old one with 5 args still exists in the catalog. To
-- prevent PostgREST from getting ambiguous overload resolution we
-- drop every prior variant explicitly. (DROP IF EXISTS is idempotent —
-- safe to keep around even after this is the only signature.)
drop function if exists public.admin_update_user_profile(uuid, text, boolean);
drop function if exists public.admin_update_user_profile(uuid, text, boolean, text, text);
drop function if exists public.admin_update_user_profile(uuid, text, boolean, text, text, text);

create or replace function public.admin_update_user_profile(
  target_user_id uuid,
  new_name text default null,
  new_is_platform_admin boolean default null,
  new_first_name text default null,
  new_last_name text default null,
  new_admin_notes text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  current_admin boolean;
  current_first text;
  current_last text;
  remaining_admins int;
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  select is_platform_admin, first_name, last_name
  into current_admin, current_first, current_last
  from public.profiles where id = target_user_id;

  if current_admin is null then
    raise exception 'Profile not found';
  end if;

  -- Lockout protection
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
    first_name = coalesce(new_first_name, first_name),
    last_name = coalesce(new_last_name, last_name),
    is_platform_admin = coalesce(new_is_platform_admin, is_platform_admin),
    -- admin_notes: pass null to leave unchanged, pass empty string to
    -- clear (we treat empty as null on the way in).
    admin_notes = case
      when new_admin_notes is null then admin_notes
      when trim(new_admin_notes) = '' then null
      else new_admin_notes
    end,
    name = case
      when new_name is not null then new_name
      else trim(coalesce(coalesce(new_first_name, first_name), '') || ' '
             || coalesce(coalesce(new_last_name, last_name), ''))
    end
  where id = target_user_id;

  select json_build_object(
    'id', id,
    'name', name,
    'first_name', first_name,
    'last_name', last_name,
    'is_platform_admin', is_platform_admin,
    'admin_notes', admin_notes
  ) into result
  from public.profiles where id = target_user_id;

  return result;
end;
$$;
revoke all on function public.admin_update_user_profile(uuid, text, boolean, text, text, text) from public;
grant execute on function public.admin_update_user_profile(uuid, text, boolean, text, text, text) to authenticated;


-- ─── Extend admin_list_users to surface email_confirmed_at ────────────────
-- Used by the new UserListTable's "Email unconfirmed" filter and the
-- per-row "unconfirmed" badge. Including admin_notes too so the future
-- list filter "users with notes" comes for free without another RPC change.
--
-- IMPORTANT: must DROP first. Adding columns to a TABLE-returning
-- function changes the return type, which CREATE OR REPLACE FUNCTION
-- can't do — Postgres throws "cannot change return type of existing
-- function". The DROP is idempotent (IF EXISTS).
drop function if exists public.admin_list_users(text);

create function public.admin_list_users(search_query text default null)
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  is_platform_admin boolean,
  has_admin_notes boolean,
  membership_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;
  return query
    select
      u.id,
      u.email::text,
      pr.name,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      coalesce(pr.is_platform_admin, false),
      (pr.admin_notes is not null and length(trim(pr.admin_notes)) > 0),
      (select count(*) from public.practice_users pu where pu.user_id = u.id)
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where (
      search_query is null
      or trim(search_query) = ''
      or u.email ilike '%' || search_query || '%'
      or pr.name ilike '%' || search_query || '%'
    )
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users(text) from public;
grant execute on function public.admin_list_users(text) to authenticated;
