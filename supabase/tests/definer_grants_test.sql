-- ============================================================================
-- SECURITY DEFINER GRANTS TEST  (run in the Supabase SQL editor)
-- ============================================================================
-- Read-only. Proves that the anonymous role cannot execute the privileged
-- RPCs, and that the three functions that ARE public on purpose still are.
--
-- Why this exists: every migration up to 20260904120000 locked its RPCs down
-- with `revoke all on function ... from public`, which does not remove
-- Supabase's default-privilege grant to anon. 59 SECURITY DEFINER functions,
-- admin_delete_user among them, were callable unauthenticated over PostgREST.
-- Nothing was exploitable because each body carries its own guard, but there
-- was no second layer. If a future migration reintroduces the same mistake,
-- this script is what notices.
--
-- Run all statements together; read the results grid. Every row ends PASS or
-- FAIL, with a final verdict row.
-- ============================================================================

with expected_public as (
  -- Deliberate public API. Each documented at the point it was created.
  select unnest(array[
    'log_auth_event',
    'validate_public_token',
    'public_get_invite_summary'
  ]) as proname
),
expected_predicates as (
  -- RLS policy predicates. Every policy on this database was created without
  -- a TO clause, so it applies to role PUBLIC, and a policy expression is
  -- evaluated with the querying role's privileges. anon must be able to
  -- execute these or an anonymous SELECT raises 42501 instead of returning
  -- zero rows. They leak nothing: with no auth.uid() they return false, null
  -- or the empty set.
  select unnest(array[
    'is_platform_admin',
    'is_practice_admin',
    'is_practice_owner',
    'is_practice_leadership',
    'user_practice_ids',
    'clinician_in_my_practice',
    'clinician_admin_check',
    'caller_practice_role',
    'my_practice_role'
  ]) as proname
),
anon_executable as (
  select p.proname,
         p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and has_function_privilege('anon', p.oid, 'EXECUTE')
),
unexpected as (
  select sig from anon_executable
  where proname not in (select proname from expected_public)
    and proname not in (select proname from expected_predicates)
),
missing_public as (
  select e.proname from expected_public e
  where not exists (select 1 from anon_executable a where a.proname = e.proname)
),
missing_predicates as (
  select e.proname from expected_predicates e
  where not exists (select 1 from anon_executable a where a.proname = e.proname)
),
definer_views as (
  select c.relname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce((
      select option_value = 'true'
      from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'
    ), false)
),
mutable_search_path as (
  -- Every function in public, not only the SECURITY DEFINER ones. The six
  -- this caught were trigger functions running as the table owner, which is
  -- the same exposure without the prosecdef flag to advertise it.
  select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
      where cfg like 'search_path=%'
    )
)

-- ─── 1. No unexpected function is executable by anon ────────────────────────
select
  'anon cannot execute privileged RPCs' as check,
  case when (select count(*) from unexpected) = 0 then 'PASS' else 'FAIL' end as result,
  coalesce((select string_agg(sig, ', ' order by sig) from unexpected), 'none') as detail

union all
-- ─── 2. The three deliberate public entry points still work ────────────────
select
  'deliberate public RPCs kept their anon grant',
  case when (select count(*) from missing_public) = 0 then 'PASS' else 'FAIL' end,
  coalesce((select string_agg(proname, ', ') from missing_public), 'all three present')

union all
-- ─── 3. RLS predicates are still reachable by anon ─────────────────────────
-- Revoking these is the failure mode that turns quiet empty states on
-- pre-auth pages into hard 42501 errors.
select
  'RLS predicate helpers kept their anon grant',
  case when (select count(*) from missing_predicates) = 0 then 'PASS' else 'FAIL' end,
  coalesce((select string_agg(proname, ', ') from missing_predicates), 'all nine present')

union all
-- ─── 4. No view bypasses RLS ───────────────────────────────────────────────
-- demand_history_summary was the one that mattered: it groups demand_history
-- by practice_id with no filter of its own, so running as its owner exposed
-- every practice's row counts and date ranges to any signed-in user who
-- dropped the client-side .eq('practice_id') filter.
select
  'every public view honours RLS (security_invoker)',
  case when (select count(*) from definer_views) = 0 then 'PASS' else 'FAIL' end,
  coalesce((select string_agg(relname, ', ' order by relname) from definer_views), 'none')

union all
-- ─── 5. Every public function pins its search_path ────────────────────────
select
  'every public function pins search_path',
  case when (select count(*) from mutable_search_path) = 0 then 'PASS' else 'FAIL' end,
  coalesce((select string_agg(proname, ', ' order by proname) from mutable_search_path), 'none')

union all
-- ─── Verdict ───────────────────────────────────────────────────────────────
select
  'VERDICT',
  case when (select count(*) from unexpected) = 0
        and (select count(*) from missing_public) = 0
        and (select count(*) from missing_predicates) = 0
        and (select count(*) from definer_views) = 0
        and (select count(*) from mutable_search_path) = 0
       then 'PASS' else 'FAIL' end,
  'run after any migration that creates a function or a view';
