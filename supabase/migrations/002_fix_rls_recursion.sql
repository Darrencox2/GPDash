-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 002: fix RLS recursion on practice_users
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Problem in migration 001:
-- The policy on practice_users uses a subquery against practice_users itself:
--
--   USING (practice_id IN (SELECT practice_id FROM practice_users WHERE user_id = auth.uid()))
--
-- When PostgreSQL evaluates this, the subquery triggers RLS again on
-- practice_users, which evaluates the same policy, which triggers RLS again...
-- → "42P17: infinite recursion detected".
--
-- Fix: extract the membership lookup into a SECURITY DEFINER function. Such
-- functions run with the privileges of their owner (postgres) and bypass RLS
-- on the tables they query. We control exactly what the function returns
-- (a list of practice_ids), so this is safe — there's no SQL injection
-- surface and the function only reads, never writes.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Helper function: which practices does the current user belong to? ──
-- Returns a setof uuid (the practice_ids the user is a member of).
-- Marked stable (same result within a single statement) and security definer
-- (runs as the function owner, bypassing RLS on practice_users).
create or replace function public.user_practice_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select practice_id
  from public.practice_users
  where user_id = auth.uid()
$$;

-- Lock down: revoke from public, grant only to authenticated users.
revoke all on function public.user_practice_ids() from public;
grant execute on function public.user_practice_ids() to authenticated;


-- ─── 2. Drop the old recursive policies ───────────────────────────────────
drop policy if exists practices_select_member        on public.practices;
drop policy if exists profiles_select_same_practice  on public.profiles;
drop policy if exists practice_users_select_member   on public.practice_users;


-- ─── 3. Recreate using the helper function ───────────────────────────────

-- A user can SELECT a practice if its id is in the set of their practice_ids.
create policy practices_select_member
  on public.practices for select
  using (id in (select public.user_practice_ids()));

-- A user can SELECT profiles of others in the same practice.
create policy profiles_select_same_practice
  on public.profiles for select
  using (
    id in (
      select pu.user_id from public.practice_users pu
      where pu.practice_id in (select public.user_practice_ids())
    )
  );

-- A user can SELECT practice_users rows for practices they're a member of.
-- This is the key fix — the policy now calls a SECURITY DEFINER function
-- instead of querying practice_users directly, breaking the recursion.
create policy practice_users_select_member
  on public.practice_users for select
  using (practice_id in (select public.user_practice_ids()));


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. After running, the v4-test page should show:
--   Database (practices table) → ok, 0 rows (RLS working — no user signed in)
--
-- This pattern (helper function → policies query helper, never the table
-- they protect) is how we'll write all future RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════
