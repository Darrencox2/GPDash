-- ============================================================================
-- Meeting schedules — "nth weekday of month" support
-- ============================================================================
-- Adds the common pattern "2nd Wednesday of the month" (and "last Friday").
-- New cadence value 'monthly_nth' uses:
--   week_of_month  1..5  (5 = last occurrence of that weekday in the month)
--   day_of_week    0..6  (already exists)
-- Additive; existing weekly/fortnightly/monthly schedules are unaffected.
--
-- The cadence column is a free-text check constraint, so we widen it to allow
-- the new value. Drop + re-add the constraint (cannot alter a check in place).
-- ============================================================================

alter table public.meeting_schedules
  add column if not exists week_of_month int check (week_of_month between 1 and 5);

alter table public.meeting_schedules
  drop constraint if exists meeting_schedules_cadence_check;
alter table public.meeting_schedules
  add constraint meeting_schedules_cadence_check
  check (cadence in ('weekly', 'fortnightly', 'monthly', 'monthly_nth'));
