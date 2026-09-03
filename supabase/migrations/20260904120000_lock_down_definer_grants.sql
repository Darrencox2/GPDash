-- ═══════════════════════════════════════════════════════════════════════════
-- 20260904120000 — take EXECUTE away from anon on the SECURITY DEFINER RPCs
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE BUG THIS FIXES
--
-- Every migration that created an RPC locked it down like this:
--
--     revoke all on function public.admin_delete_user(uuid) from public;
--     grant execute on function public.admin_delete_user(uuid) to authenticated;
--
-- That revoke targets the wrong grantee and has been a no-op since the first
-- migration. Supabase ships ALTER DEFAULT PRIVILEGES in schema public that
-- grants EXECUTE on every new function *directly to anon*, not via PUBLIC, so
-- the ACL ends up as:
--
--     postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,...
--                         ^^^^^^^^^^^^^^ never removed
--
-- Revoking from PUBLIC does not touch an explicit grant to anon. The result:
-- 59 functions, including admin_delete_user, admin_delete_practice and
-- admin_set_user_membership, were callable unauthenticated over PostgREST.
--
-- Nothing was exploitable — every admin_* body opens with an
-- is_platform_admin() guard and every practice RPC with a role check, and
-- those guards are what has actually been holding the line. But the schema was
-- one forgotten guard away from a breach, with no second layer behind it.
-- This migration puts the second layer back.
--
--
-- WHAT KEEPS ITS anon GRANT, AND WHY
--
--   1. The three that are public API on purpose, each documented at the point
--      it was created: log_auth_event (the login and reset-password pages call
--      it before anyone is signed in), validate_public_token, and
--      public_get_invite_summary (bearer-token gated by a 128-bit invite UUID).
--
--   2. The nine predicates used inside RLS policy expressions. This is the
--      subtle one. Every policy on this database was created without a TO
--      clause, so they all apply to role PUBLIC — anon included. A policy
--      expression is evaluated with the *querying* role's privileges, so if
--      anon cannot execute user_practice_ids() then an anonymous SELECT on
--      clinicians raises 42501 instead of returning zero rows. That would turn
--      quiet empty states on pre-auth pages into hard errors. The predicates
--      leak nothing to anon anyway: with no auth.uid() they return false, null
--      or the empty set.
--
-- Trigger functions are revoked too. Firing a trigger does not check EXECUTE
-- on the trigger function, so this is free.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  fn record;
  keep_list text[] := array[
    -- Deliberate public API
    'log_auth_event',
    'validate_public_token',
    'public_get_invite_summary',
    -- RLS policy predicates — see note 2 above
    'is_platform_admin',
    'is_practice_admin',
    'is_practice_owner',
    'is_practice_leadership',
    'user_practice_ids',
    'clinician_in_my_practice',
    'clinician_admin_check',
    'caller_practice_role',
    'my_practice_role'
  ];
  revoked int := 0;
begin
  for fn in
    select p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> all (keep_list)
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    execute format(
      'revoke all on function public.%I(%s) from anon, public',
      fn.proname, fn.args
    );
    revoked := revoked + 1;
  end loop;

  raise notice 'Revoked anon EXECUTE on % function(s)', revoked;
end
$$;


-- ─── Pin search_path on the six functions that were missing it ────────────
--
-- All six are trigger functions written before `set search_path = public`
-- became the house style. A mutable search_path on a function that a
-- privileged role invokes is the classic route to having your own schema
-- shadow public. ALTER FUNCTION sets it without rewriting the bodies.
alter function public.prevent_last_owner_removal()        set search_path = public, pg_temp;
alter function public.set_updated_at()                    set search_path = public, pg_temp;
alter function public.touch_report_schedules_updated_at() set search_path = public, pg_temp;
alter function public.touch_day_annotations_updated_at()  set search_path = public, pg_temp;
alter function public.touch_saved_reports_updated_at()    set search_path = public, pg_temp;
alter function public.touch_meetings_updated_at()         set search_path = public, pg_temp;


-- ─── Stop the three summary views from bypassing RLS ──────────────────────
--
-- A view created without security_invoker runs as its owner (postgres), so
-- RLS on the base table is never consulted.
--
-- demand_history_summary is the one that mattered. It groups demand_history
-- BY practice_id with no filter of its own, and demand_history's own SELECT
-- policy restricts you to practices you belong to. Reading the view therefore
-- bypassed that policy: any signed-in user who dropped the .eq('practice_id')
-- filter the app happens to send could see row counts, date ranges and last
-- upload times for every practice on the platform. Cross-tenant, and the only
-- thing preventing it was client-side query shape.
--
-- With security_invoker the base-table policy applies and the caller sees only
-- their own practices. The app already filters by a practice the user is a
-- member of, so its two call sites are unaffected
-- (app/v4/practice/[id]/page.js, app/v4/onboarding/setup/[id]/SetupWizard.js).
alter view public.demand_history_summary set (security_invoker = on);

-- The other two are national NHS open data, not practice data, so there was no
-- leak here — but nhs_oc_baseline already carries an
-- "Authenticated can read NHS baseline" policy with qual `true`, so honouring
-- it costs nothing and stops the views being a way around it later.
alter view public.nhs_oc_baseline_pcn_summary      set (security_invoker = on);
alter view public.nhs_oc_baseline_national_summary set (security_invoker = on);
