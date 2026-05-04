-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 016: Platform admin RPCs
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SECURITY DEFINER functions for the platform admin UI. Each function
-- checks is_platform_admin() at the top and raises if the caller isn't
-- one. This keeps the admin queries simple while still preventing
-- escalation: an ordinary user calling these gets an exception, not data.
--
-- Why RPCs instead of direct queries? auth.users is in the auth schema
-- and isn't directly readable from PostgREST. SECURITY DEFINER lets us
-- pull email, last_sign_in_at, etc. while still gating on the caller.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. admin_list_practices() — every practice with stats ───────────────
create or replace function public.admin_list_practices()
returns table (
  id uuid,
  name text,
  slug text,
  ods_code text,
  region text,
  created_at timestamptz,
  member_count bigint,
  clinician_count bigint
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
      p.id,
      p.name,
      p.slug,
      p.ods_code,
      p.region,
      p.created_at,
      (select count(*) from public.practice_users pu where pu.practice_id = p.id),
      (select count(*) from public.clinicians c where c.practice_id = p.id and c.status = 'active')
    from public.practices p
    order by p.name;
end;
$$;
revoke all on function public.admin_list_practices() from public;
grant execute on function public.admin_list_practices() to authenticated;


-- ─── 2. admin_list_users() — every user with membership count ────────────
create or replace function public.admin_list_users(search_query text default null)
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  is_platform_admin boolean,
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
      coalesce(pr.is_platform_admin, false),
      (select count(*) from public.practice_users pu where pu.user_id = u.id)
    from auth.users u
    left join public.profiles pr on pr.id = u.id
    where (
      search_query is null
      or search_query = ''
      or u.email ilike '%' || search_query || '%'
      or pr.name ilike '%' || search_query || '%'
    )
    order by u.created_at desc;
end;
$$;
revoke all on function public.admin_list_users(text) from public;
grant execute on function public.admin_list_users(text) to authenticated;


-- ─── 3. admin_get_user(uuid) — user detail + memberships ─────────────────
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
    'is_platform_admin', coalesce(pr.is_platform_admin, false),
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
revoke all on function public.admin_get_user(uuid) from public;
grant execute on function public.admin_get_user(uuid) to authenticated;
