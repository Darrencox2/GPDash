-- Fix: pending invites were invisible to EVERYONE, always.
--
-- The practice_invites_select_own policy (letting an invitee see their own
-- invite) contained a subquery on auth.users. The authenticated role has no
-- SELECT grant on auth.users, and Postgres evaluates every applicable policy
-- on every read - so the one broken policy poisoned ALL reads of
-- practice_invites with permission-denied. The page swallowed the error and
-- rendered an empty list, so the admin-facing pending-invites card never
-- showed anything either, despite rows existing.
--
-- Fix: read the caller's email from the session JWT claim instead of the
-- protected table. Applied directly to production 2026-06-18 during go-live;
-- this migration records it (drop-if-exists makes re-application a no-op).

drop policy if exists practice_invites_select_own on public.practice_invites;
create policy practice_invites_select_own on public.practice_invites
  for select using (
    lower(email) = lower(coalesce(auth.jwt()->>'email', ''))
  );
