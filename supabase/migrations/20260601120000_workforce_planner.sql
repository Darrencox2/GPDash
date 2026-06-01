-- Workforce planner configuration.
--
-- Stores the per-practice configuration for the Workforce planner in a single
-- jsonb blob on practice_settings (which already has practice-scoped RLS).
-- Keeping it in one column means the planner loads and saves its whole state
-- in a single read/upsert rather than juggling a separate table + policies —
-- adequate for a per-practice list of named activities and a handful of flags.
--
-- Shape:
-- {
--   "maxOff": 2,                 -- max clinicians the practice allows off per session
--   "holidayOn": true,           -- whether to subtract the holiday allowance
--   "weeklyTotal": null,         -- override total weekly demand (null = use the model)
--   "dutyEligibleIds": ["<clinician_id>", ...],
--   "deductions": [
--     { "id": "...", "clinicianId": "...", "day": "mon",
--       "session": "am"|"pm"|"both", "amount": 1, "label": "Teaching" }
--   ]
-- }

ALTER TABLE practice_settings
  ADD COLUMN IF NOT EXISTS workforce jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN practice_settings.workforce IS
  'Workforce planner config: maxOff, holidayOn, weeklyTotal, dutyEligibleIds[], deductions[]. See migration 20260601120000.';
