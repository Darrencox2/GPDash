-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Allow practice admins to INSERT into practice_settings
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Migration 007 originally created practice_settings with no INSERT policy
-- on the assumption that the on_practice_created trigger would always
-- create the row on practice creation. This is true — but it broke any
-- code path using `.upsert()` (e.g. DemandUpload, seed-demand-from-nhs):
--
--   PostgreSQL evaluates the INSERT policy on `INSERT ... ON CONFLICT DO
--   UPDATE` even when the row already exists and only the UPDATE branch
--   actually runs. With no INSERT policy + default deny, the upsert is
--   refused with "new row violates row-level security policy".
--
-- The fix: explicitly allow admins to INSERT for their own practice. The
-- existing primary-key constraint on practice_id prevents creating a
-- duplicate row, and is_practice_admin() restricts to authorised members.
-- ═══════════════════════════════════════════════════════════════════════════

create policy practice_settings_insert_admin
  on public.practice_settings for insert
  with check (public.is_practice_admin(practice_id));
