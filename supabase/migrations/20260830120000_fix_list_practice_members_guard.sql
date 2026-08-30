-- ═══════════════════════════════════════════════════════════════════════════
-- Restore the caller guard on list_practice_members
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The original definition (migration 20260501120003) scoped the result to
-- practices the caller actually belongs to:
--
--   where pu.practice_id = target_practice_id
--     and target_practice_id in (select public.user_practice_ids())
--
-- That second line was lost in 20260504120026, when the function was
-- DROP-then-CREATEd to add linked_clinician_id / linked_clinician_name. The
-- rewrite carried the new columns but not the guard, and 028 and 029 each
-- rebuilt from that copy, so it has been missing ever since.
--
-- The function is SECURITY DEFINER (so RLS on practice_users and profiles
-- does not apply) and is granted to `authenticated`. With no guard, any
-- signed-in user could pass any practice uuid and receive that practice's
-- entire staff list: email, name, role, joined_at, last_sign_in_at and
-- linked clinician. Cross-tenant personal data, readable by anyone with an
-- account.
--
-- Return shape is unchanged from 029, so CREATE OR REPLACE is safe here —
-- no DROP needed, and dependent grants survive.
--
-- Platform admins are deliberately NOT special-cased: they already have
-- admin_* RPCs for cross-practice work, and widening this function is what
-- caused the problem in the first place.

create or replace function public.list_practice_members(target_practice_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  role public.practice_role,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  linked_clinician_id uuid,
  linked_clinician_name text,
  marked_non_clinical boolean
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
    c.id as linked_clinician_id,
    c.name as linked_clinician_name,
    pu.marked_non_clinical
  from public.practice_users pu
  join public.profiles p on p.id = pu.user_id
  join auth.users u on u.id = pu.user_id
  left join public.clinicians c
    on c.linked_user_id = pu.user_id
    and c.practice_id = target_practice_id
  where pu.practice_id = target_practice_id
    -- THE GUARD. Without this the function is a cross-tenant read.
    and target_practice_id in (select public.user_practice_ids())
  order by
    case pu.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    coalesce(p.name, p.email);
$$;

revoke all on function public.list_practice_members(uuid) from public;
grant execute on function public.list_practice_members(uuid) to authenticated;

comment on function public.list_practice_members(uuid) is
  'Members of one practice. SECURITY DEFINER to see profiles/auth.users, but scoped to practices the caller belongs to via user_practice_ids(). Any future edit MUST keep that guard.';
