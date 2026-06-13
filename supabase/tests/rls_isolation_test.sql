-- ============================================================================
-- RLS ISOLATION TEST  (run in the Supabase SQL editor)
-- ============================================================================
-- Proves one practice cannot read another practice's data, using your REAL
-- existing data — no synthetic users (inserting into auth.users directly is
-- fragile across Supabase versions). It picks two DIFFERENT practices that
-- each have at least one member, then acts AS a member of practice A and
-- checks they cannot see practice B's rows.
--
-- Read-only: SELECT-only, no writes, nothing to roll back. Safe on production.
--
-- Output: the Messages/Notices panel. Every check ends PASS or FAIL, with a
-- final verdict. A FAIL names the table with the isolation hole.
--
-- Requires: at least 2 practices, each with >=1 member in practice_users.
-- If you only have one practice so far, this will say so — that is fine, it
-- just means cross-practice isolation cannot be tested until a second
-- practice exists.
-- ============================================================================
do $$
declare
  pa uuid; pb uuid;          -- two distinct practices
  ua uuid;                   -- a member of practice A
  seen int;
  fails int := 0;
begin
  -- Pick practice A = the one with the most members (most realistic), and a
  -- member of it. Then practice B = any other practice.
  select pu.practice_id, pu.user_id
    into pa, ua
    from public.practice_users pu
    group by pu.practice_id, pu.user_id
    order by (select count(*) from public.practice_users x where x.practice_id = pu.practice_id) desc
    limit 1;

  select id into pb from public.practices where id <> pa limit 1;

  if pa is null then
    raise notice 'No practices with members found — nothing to test yet.'; return;
  end if;
  if pb is null then
    raise notice 'Only one practice exists — cross-practice isolation cannot be tested until a second practice is created. (Single-practice RLS is still enforced.)'; return;
  end if;

  raise notice 'Testing AS a member of practice % , trying to reach practice %', pa, pb;

  -- Become user A (RLS reads these JWT claims).
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  -- ---- Cross-practice READ checks: each must return 0 rows ----
  select count(*) into seen from public.clinicians where practice_id = pb;
  if seen = 0 then raise notice 'clinicians cross-read ........... PASS';
  else fails := fails+1; raise notice 'clinicians cross-read ........... FAIL (saw % rows of B)', seen; end if;

  select count(*) into seen from public.practice_settings where practice_id = pb;
  if seen = 0 then raise notice 'practice_settings cross-read .... PASS';
  else fails := fails+1; raise notice 'practice_settings cross-read .... FAIL (saw %)', seen; end if;

  select count(*) into seen from public.buddy_allocations where practice_id = pb;
  if seen = 0 then raise notice 'buddy_allocations cross-read .... PASS';
  else fails := fails+1; raise notice 'buddy_allocations cross-read .... FAIL (saw %)', seen; end if;

  select count(*) into seen from public.practice_users where practice_id = pb;
  if seen = 0 then raise notice 'practice_users cross-read ....... PASS';
  else fails := fails+1; raise notice 'practice_users cross-read ....... FAIL (saw %)', seen; end if;

  -- clinician-FK-path tables: count B's rows reachable via B's clinicians
  select count(*) into seen from public.absences a
    where a.clinician_id in (select id from public.clinicians where practice_id = pb);
  if seen = 0 then raise notice 'absences cross-read (FK path) ... PASS';
  else fails := fails+1; raise notice 'absences cross-read (FK path) ... FAIL (saw %)', seen; end if;

  select count(*) into seen from public.working_patterns w
    where w.clinician_id in (select id from public.clinicians where practice_id = pb);
  if seen = 0 then raise notice 'working_patterns cross-read ..... PASS';
  else fails := fails+1; raise notice 'working_patterns cross-read ..... FAIL (saw %)', seen; end if;

  select count(*) into seen from public.day_annotations where practice_id = pb;
  if seen = 0 then raise notice 'day_annotations cross-read ...... PASS';
  else fails := fails+1; raise notice 'day_annotations cross-read ...... FAIL (saw %)', seen; end if;

  select count(*) into seen from public.saved_reports where practice_id = pb;
  if seen = 0 then raise notice 'saved_reports cross-read ........ PASS';
  else fails := fails+1; raise notice 'saved_reports cross-read ........ FAIL (saw %)', seen; end if;

  -- ---- Helper-function checks ----
  select count(*) into seen from public.user_practice_ids() upi where upi = pb;
  if seen = 0 then raise notice 'user_practice_ids excludes B .... PASS';
  else fails := fails+1; raise notice 'user_practice_ids excludes B .... FAIL'; end if;

  if public.is_practice_admin(pb) then
    fails := fails+1; raise notice 'is_practice_admin(B) is false ... FAIL (A is admin of B!)';
  else raise notice 'is_practice_admin(B) is false ... PASS';
  end if;

  raise notice '----------------------------------------';
  if fails = 0 then raise notice 'RESULT: ALL CHECKS PASSED — isolation holds between these two practices.';
  else raise notice 'RESULT: % FAILURE(S) — see lines above.', fails; end if;
end $$;
