-- Migration 013: practices update policy
-- Without an UPDATE policy, owners/admins editing the practice slug or
-- name silently failed (RLS blocked the write but didn't raise an
-- error). This adds a policy that lets users with role 'owner' or
-- 'admin' update their own practice rows.

drop policy if exists practices_update_admin on public.practices;

create policy practices_update_admin
  on public.practices for update
  using (
    id in (
      select practice_id from public.practice_users
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  )
  with check (
    id in (
      select practice_id from public.practice_users
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );
