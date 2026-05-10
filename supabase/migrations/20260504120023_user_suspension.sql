-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 033: user suspension (suspended_at + suspended_reason)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds metadata columns for "this user is temporarily suspended" without
-- being deleted. The actual sign-in block is enforced by Supabase auth
-- via auth.users.banned_until (set through the admin API in our API
-- routes); these columns are app-level metadata so the admin UI can
-- show "suspended" badges, the reason, and the date.
--
-- Why two layers?
--   - Supabase's banned_until is the source of truth for "can this user
--     log in" — set in the auth admin API, enforced by Supabase itself
--     on every sign-in attempt. We don't have to add middleware.
--   - profiles.suspended_at + suspended_reason hold our own metadata:
--     the human-readable reason ("filed complaint, investigating"), and
--     a UI-friendly date stamp. We don't read banned_until directly
--     because it's in auth.users which has tighter access controls.
--
-- The two layers can drift in theory (admin manually sets banned_until
-- via dashboard without going through our API). In practice we always
-- write both together via /api/v4/admin/suspend-user.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;


-- ─── Surface suspension state in admin RPCs ──────────────────────────────
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
    'suspended_at', pr.suspended_at,
    'suspended_reason', pr.suspended_reason,
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


-- admin_list_users — add is_suspended boolean for the list filter chips
-- and per-row badge. We keep boolean rather than the timestamp because
-- the list view doesn't need the precise timestamp, and a bool is the
-- minimal cardinality the table needs.
create or replace function public.admin_list_users(search_query text default null)
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz,
  is_platform_admin boolean,
  is_suspended boolean,
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
      pr.suspended_at is not null,
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
