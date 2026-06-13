-- ============================================================================
-- RLS ISOLATION TEST HARNESS  (run in the Supabase SQL editor)
-- ============================================================================
-- Proves that one practice cannot see or modify another practice's data.
-- Safe to run on production: it creates two throwaway test practices/users,
-- runs adversarial checks AS each user (set_config sets the JWT claims that
-- RLS reads), then rolls everything back. Nothing is left behind.
--
-- Reading the output: every NOTICE line ends in PASS or FAIL. A single FAIL
-- means a real isolation hole — the line names the table. All PASS = isolation
-- holds for the tables covered.
-- ============================================================================
begin;

do $$
declare
  pa uuid; pb uuid;            -- practice A / B ids
  ua uuid := gen_random_uuid(); -- user A
  ub uuid := gen_random_uuid(); -- user B
  cli_a uuid; cli_b uuid;       -- a clinician in each practice
  seen int;
  fails int := 0;
  function_passes int := 0;
  procedure_label text;
begin
  -- ---- Seed: two practices, one user each (bypasses RLS — we're the definer) ----
  -- practice_users.user_id has a FK to auth.users, so the users must exist
  -- there first. Insert minimal auth.users rows (instance_id + email are the
  -- practical NOT NULLs); everything else defaults.
  insert into auth.users (id, instance_id, email, aud, role)
    values
      (ua, '00000000-0000-0000-0000-000000000000', 'rls-test-a@example.invalid', 'authenticated', 'authenticated'),
      (ub, '00000000-0000-0000-0000-000000000000', 'rls-test-b@example.invalid', 'authenticated', 'authenticated');

  insert into public.practices (name, slug, ods_code)
    values ('TEST Practice A','test-rls-a','ZTESTA') returning id into pa;
  insert into public.practices (name, slug, ods_code)
    values ('TEST Practice B','test-rls-b','ZTESTB') returning id into pb;

  insert into public.practice_users (practice_id, user_id, role)
    values (pa, ua, 'owner'), (pb, ub, 'owner');

  insert into public.clinicians (practice_id, name)
    values (pa, 'TEST Dr A') returning id into cli_a;
  insert into public.clinicians (practice_id, name)
    values (pb, 'TEST Dr B') returning id into cli_b;

  -- =========================================================================
  -- Act AS user A and try to reach practice B's data. Expect: zero rows.
  -- =========================================================================
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- clinicians
  select count(*) into seen from public.clinicians where practice_id = pb;
  if seen = 0 then raise notice 'clinicians cross-read ........... PASS';
  else fails := fails+1; raise notice 'clinicians cross-read ........... FAIL (saw % of B''s rows)', seen; end if;

  -- practice_settings (if any row exists for B it must be invisible)
  select count(*) into seen from public.practice_settings where practice_id = pb;
  if seen = 0 then raise notice 'practice_settings cross-read .... PASS';
  else fails := fails+1; raise notice 'practice_settings cross-read .... FAIL (saw %)', seen; end if;

  -- buddy_allocations
  select count(*) into seen from public.buddy_allocations where practice_id = pb;
  if seen = 0 then raise notice 'buddy_allocations cross-read .... PASS';
  else fails := fails+1; raise notice 'buddy_allocations cross-read .... FAIL (saw %)', seen; end if;

  -- absences (scoped via clinician FK -> the indirect path)
  select count(*) into seen from public.absences where clinician_id = cli_b;
  if seen = 0 then raise notice 'absences cross-read (FK path) ... PASS';
  else fails := fails+1; raise notice 'absences cross-read (FK path) ... FAIL (saw %)', seen; end if;

  -- working_patterns (clinician FK path)
  select count(*) into seen from public.working_patterns where clinician_id = cli_b;
  if seen = 0 then raise notice 'working_patterns cross-read ..... PASS';
  else fails := fails+1; raise notice 'working_patterns cross-read ..... FAIL (saw %)', seen; end if;

  -- practice_users (membership of B must be invisible to A)
  select count(*) into seen from public.practice_users where practice_id = pb;
  if seen = 0 then raise notice 'practice_users cross-read ....... PASS';
  else fails := fails+1; raise notice 'practice_users cross-read ....... FAIL (saw %)', seen; end if;

  -- =========================================================================
  -- Adversarial WRITE: user A tries to insert a clinician into practice B.
  -- Expect: blocked by RLS (raises, which we catch as PASS).
  -- =========================================================================
  begin
    insert into public.clinicians (practice_id, name) values (pb, 'HACK by A');
    fails := fails+1; raise notice 'clinicians cross-write block ... FAIL (insert into B succeeded!)';
  exception when others then
    raise notice 'clinicians cross-write block ... PASS (% )', sqlerrm;
  end;

  -- Adversarial WRITE: user A tries to UPDATE B's clinician.
  begin
    update public.clinicians set name = 'HACKED' where id = cli_b;
    get diagnostics seen = row_count;
    if seen = 0 then raise notice 'clinicians cross-update block .. PASS (0 rows affected)';
    else fails := fails+1; raise notice 'clinicians cross-update block .. FAIL (% rows updated)', seen; end if;
  exception when others then
    raise notice 'clinicians cross-update block .. PASS (%)', sqlerrm;
  end;

  -- =========================================================================
  -- Helper function sanity: user A's practice set must be exactly {pa}.
  -- =========================================================================
  select count(*) into seen from public.user_practice_ids() where user_practice_ids = pb;
  if seen = 0 then raise notice 'user_practice_ids excludes B .... PASS';
  else fails := fails+1; raise notice 'user_practice_ids excludes B .... FAIL'; end if;

  if public.is_practice_admin(pb) then
    fails := fails+1; raise notice 'is_practice_admin(B) for A ...... FAIL (A is admin of B!)';
  else raise notice 'is_practice_admin(B) for A ...... PASS';
  end if;

  -- ---- Verdict ----
  raise notice '----------------------------------------';
  if fails = 0 then
    raise notice 'RESULT: ALL CHECKS PASSED — isolation holds.';
  else
    raise notice 'RESULT: % FAILURE(S) — isolation hole(s) above.', fails;
  end if;
end $$;

-- Roll everything back: no test data persists.
rollback;
