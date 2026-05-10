-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 025: admin_get_practice_detail RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Mirror of admin_get_user but in the other direction: returns one
-- practice's identity + every member with their email/name/role. Used by
-- the new /v4/admin/practices/[id] platform-admin practice detail page.
--
-- We could compose this from existing RPCs in the client, but doing it
-- in one round-trip is simpler and consistent with how admin_get_user
-- bundles its memberships.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_get_practice_detail(target_practice_id uuid)
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
    'id', p.id,
    'name', p.name,
    'slug', p.slug,
    'ods_code', p.ods_code,
    'postcode', p.postcode,
    'region', p.region,
    'list_size', p.list_size,
    'online_consult_tool', p.online_consult_tool,
    'setup_completed_at', p.setup_completed_at,
    'created_at', p.created_at,
    'clinician_count', (
      select count(*) from public.clinicians c
      where c.practice_id = p.id
        and (c.status is null or c.status not in ('left','administrative'))
    ),
    'members', coalesce((
      select json_agg(json_build_object(
        'user_id', pu.user_id,
        'email', u.email,
        'name', pr.name,
        'role', pu.role,
        'joined_at', pu.joined_at,
        'last_sign_in_at', u.last_sign_in_at,
        'is_platform_admin', coalesce(pr.is_platform_admin, false)
      ) order by pu.joined_at)
      from public.practice_users pu
      join auth.users u on u.id = pu.user_id
      left join public.profiles pr on pr.id = pu.user_id
      where pu.practice_id = p.id
    ), '[]'::json)
  )
  into result
  from public.practices p
  where p.id = target_practice_id;

  if result is null then
    raise exception 'Practice not found';
  end if;
  return result;
end;
$$;
revoke all on function public.admin_get_practice_detail(uuid) from public;
grant execute on function public.admin_get_practice_detail(uuid) to authenticated;
