-- ============================================================================
-- Tier helper functions for the new leadership roles
-- ============================================================================
-- Runs AFTER 20260613230000 committed the new enum values (Postgres requires
-- enum values to be committed before use in function bodies).
--
-- Two tiers, defined ONCE here so future changes happen in one place:
--   is_practice_admin()         — operational management or above. Now
--                                 includes the senior roles so they inherit
--                                 everything admin can do (fixes the
--                                 inversion where a partner would otherwise
--                                 have LESS access than a reception-manager
--                                 admin). Used by dozens of RLS policies and
--                                 by clinician_admin_check (which delegates
--                                 here), so this single change cascades.
--   is_practice_leadership()    — NEW. The confidential tier: owner, partner,
--                                 practice_manager only. Gates confidential
--                                 modules (Meetings). Admins are EXCLUDED.
-- ============================================================================

create or replace function public.is_practice_admin(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.practice_users
    where practice_id = target_practice_id
      and user_id = auth.uid()
      and role in ('owner', 'partner', 'practice_manager', 'admin')
  )
$$;

create or replace function public.is_practice_leadership(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.practice_users
    where practice_id = target_practice_id
      and user_id = auth.uid()
      and role in ('owner', 'partner', 'practice_manager')
  )
$$;

revoke all on function public.is_practice_leadership(uuid) from public;
grant execute on function public.is_practice_leadership(uuid) to authenticated;
