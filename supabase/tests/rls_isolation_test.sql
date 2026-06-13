-- ============================================================================
-- RLS ISOLATION TEST  (run in the Supabase SQL editor)
-- ============================================================================
-- Read-only. Proves a member of one practice cannot see another practice's
-- data, using your real existing data. Returns a results table of PASS/FAIL
-- rows — no DO block, no dollar-quoting (the SQL editor was auto-appending
-- ALTER TABLE lines into the DO block and breaking it).
--
-- Run all three statements together (the editor runs the whole script).
-- The first two set the "logged-in user" to a real member of the busiest
-- practice; the third is the actual test and shows the results grid.
-- ============================================================================

-- 1. Become a real member of the practice that has the most members.
select set_config('request.jwt.claims',
  json_build_object('sub',
    (select pu.user_id
       from public.practice_users pu
       order by (select count(*) from public.practice_users x where x.practice_id = pu.practice_id) desc
       limit 1),
    'role','authenticated')::text, true);

-- 2. Switch role to authenticated so RLS applies.
select set_config('role','authenticated', true);

-- 3. The test: for the "other" practice (any practice the current user is NOT
--    a member of), every count below must be 0. result column says PASS/FAIL.
with other as (
  select id as bid
  from public.practices
  where id not in (select public.user_practice_ids())
  limit 1
)
select check_name,
       n_visible,
       case when n_visible = 0 then 'PASS' else 'FAIL' end as result
from (
  select 'clinicians'        as check_name, (select count(*) from public.clinicians        where practice_id = (select bid from other)) as n_visible
  union all select 'practice_settings',  (select count(*) from public.practice_settings  where practice_id = (select bid from other))
  union all select 'buddy_allocations',  (select count(*) from public.buddy_allocations  where practice_id = (select bid from other))
  union all select 'practice_users',     (select count(*) from public.practice_users     where practice_id = (select bid from other))
  union all select 'day_annotations',    (select count(*) from public.day_annotations    where practice_id = (select bid from other))
  union all select 'saved_reports',      (select count(*) from public.saved_reports      where practice_id = (select bid from other))
  union all select 'absences (FK path)', (select count(*) from public.absences where clinician_id in (select id from public.clinicians where practice_id = (select bid from other)))
  union all select 'working_patterns',   (select count(*) from public.working_patterns where clinician_id in (select id from public.clinicians where practice_id = (select bid from other)))
  union all select 'is_practice_admin(other)', (case when (select bid from other) is null then 0 when public.is_practice_admin((select bid from other)) then 1 else 0 end)
  union all select 'NO OTHER PRACTICE (info only)', (case when (select bid from other) is null then 1 else 0 end)
) checks
order by result desc, check_name;
