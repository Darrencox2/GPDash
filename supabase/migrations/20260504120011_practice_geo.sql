-- GPDash v4 — store practice geographic context derived from postcode.
-- ─────────────────────────────────────────────────────────────────────
-- The demand predictor needs:
--   - latitude/longitude for the per-practice weather forecast
--   - admin_district to pick the correct school holiday calendar
-- These are derived once during practice setup (via postcodes.io lookup
-- on the postcode) and stored here to avoid re-querying on every dashboard
-- load.

alter table public.practices
  add column if not exists latitude  numeric(8, 5),
  add column if not exists longitude numeric(8, 5),
  add column if not exists admin_district text;

-- No index needed — these are read together with the practice row.
