-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 028: include owner name in check_practice_exists_by_ods
-- ═══════════════════════════════════════════════════════════════════════════
--
-- When a user tries to create a practice that's already on GPDash, the
-- onboarding form previously said "Ask whoever set it up to invite you" —
-- not very helpful when the user doesn't know who that is.
--
-- This adds the original owner's display name to the response so the form
-- can say "Ask [Name] to invite you". Concrete name → easier action.
--
-- Privacy stance: practice owners are typically GPs whose names appear on
-- the practice's NHS website, CQC listings, etc. — already public. The
-- owner's email is NOT exposed; only their display name. Anyone with a
-- GPDash account can already enumerate practices via /v4/admin if they're
-- a platform admin, so this RPC isn't a meaningful new attack surface.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_practice_exists_by_ods(ods text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found_practice record;
  owner_record record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if ods is null or trim(ods) = '' then
    return json_build_object('exists', false);
  end if;

  select id, name into found_practice
  from public.practices
  where upper(ods_code) = upper(trim(ods))
  limit 1;

  if found_practice.id is null then
    return json_build_object('exists', false);
  end if;

  -- Fetch the FIRST owner (by joined_at ascending — i.e. the original
  -- creator) for the "ask X to invite you" message. If for some reason
  -- there's no owner (shouldn't happen — admin_remove_user_membership
  -- refuses to remove the last owner), fall back to a member.
  select coalesce(pr.name, pr.first_name, u.email) as owner_name
  into owner_record
  from public.practice_users pu
  join auth.users u on u.id = pu.user_id
  left join public.profiles pr on pr.id = pu.user_id
  where pu.practice_id = found_practice.id
    and pu.role = 'owner'
  order by pu.joined_at asc
  limit 1;

  return json_build_object(
    'exists', true,
    'practice_name', found_practice.name,
    -- owner_name is null when the practice somehow has no owner
    'owner_name', owner_record.owner_name
  );
end;
$$;
