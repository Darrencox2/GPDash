-- Ensure the Workforce planner config column exists.
--
-- Idempotent safety migration: the original add (20260601120000) may not have
-- applied cleanly, and the planner persists all of its state (selected roles,
-- the planned allocation, and activities) into this single column. Without it,
-- nothing the user does in the planner is remembered.

ALTER TABLE public.practice_settings
  ADD COLUMN IF NOT EXISTS workforce jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.practice_settings.workforce IS
  'Workforce planner state: { includedRoles, allocation, activities }.';
