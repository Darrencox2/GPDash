-- ============================================================================
-- Add senior leadership roles: 'partner' and 'practice_manager'
-- ============================================================================
-- These sit ABOVE 'admin' in the hierarchy. The distinction:
--   owner / partner / practice_manager  = leadership / confidential tier
--                                          (full management access, plus
--                                          confidential modules like Meetings)
--   admin                                = operational (e.g. reception
--                                          manager): runs the practice day to
--                                          day, but NOT confidential partner
--                                          business
--   clinician / receptionist / user      = day-to-day staff
--
-- partner and practice_manager are EQUIVALENT in access at this stage.
--
-- Enum values must be committed before they can be used in function bodies,
-- so this migration only adds the values + a tier helper. The functions that
-- reference them are safe because Postgres resolves the literals at call time,
-- not at definition time — but to be safe we add values with IF NOT EXISTS so
-- re-running is harmless.
-- ============================================================================

alter type public.practice_role add value if not exists 'partner';
alter type public.practice_role add value if not exists 'practice_manager';
