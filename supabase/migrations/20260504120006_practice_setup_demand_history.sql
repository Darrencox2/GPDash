-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 017: Practice setup + demand history
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds the columns needed to make the demand model practice-specific:
--
--   * practices.postcode          — used to look up LEA / region
--   * practices.list_size         — registered patients (for cold-start scaling)
--   * practices.online_consult_tool — 'askmygp' | 'anima' | 'klinik' | 'patchs' | 'other' | null
--   * practices.setup_completed_at — null until admin finishes the setup wizard
--
-- Plus a new table demand_history that stores per-day request counts uploaded
-- from the practice's online-consultation tool. We deliberately make this a
-- table (not a JSONB blob in practice_settings) because:
--   - We expect re-uploads from different tools (e.g. AskMyGP → Anima) and
--     need to combine them on date
--   - We want fast queries by date range for recalibration
--   - We want a clear audit trail of which source provided which data point
--
-- Demand model coefficients live in practice_settings.demand_settings (JSONB,
-- updated atomically on upload). Adding that key is a no-op DDL since
-- demand_settings doesn't exist yet — we extend the existing extras column or
-- add it. Choosing to add a dedicated column for clarity.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. practices: setup fields ──────────────────────────────────────────
alter table public.practices
  add column if not exists postcode text,
  add column if not exists list_size integer,
  add column if not exists online_consult_tool text,
  add column if not exists setup_completed_at timestamptz;

-- Postcode validation: keep it loose; UK postcodes have many variants and we
-- normalise on input. Just check it's not absurdly long.
alter table public.practices
  drop constraint if exists practices_postcode_length;
alter table public.practices
  add constraint practices_postcode_length check (postcode is null or char_length(postcode) <= 10);

-- list_size sanity: 0 < x < 200,000 (largest UK practice is ~80K)
alter table public.practices
  drop constraint if exists practices_list_size_range;
alter table public.practices
  add constraint practices_list_size_range check (list_size is null or (list_size > 0 and list_size < 200000));

-- online_consult_tool whitelist
alter table public.practices
  drop constraint if exists practices_online_consult_tool_values;
alter table public.practices
  add constraint practices_online_consult_tool_values check (
    online_consult_tool is null
    or online_consult_tool in ('askmygp', 'anima', 'klinik', 'patchs', 'accurx', 'other')
  );


-- ─── 2. practice_settings: demand_settings column ────────────────────────
-- This holds the per-practice calibrated model. Shape:
--   {
--     baseline: number,              -- mean daily requests (Mon-Fri)
--     dowEffects: [n,n,n,n,n],       -- deviation from baseline by weekday
--     monthEffects: [n,n,n,n,n,n,n,n,n,n,n,n],
--     schoolHolidayRanges: [[start,end], ...],  -- null = use LEA default
--     lea: text,                     -- e.g. 'North Somerset'
--     lastCalibratedAt: timestamptz,
--     sampleSize: integer,           -- total weekday data points used
--     listSizeAtCalibration: integer -- to detect drift
--   }
-- A practice with no demand_settings uses Winscombe's hardcoded model scaled
-- by listSize ratio.
alter table public.practice_settings
  add column if not exists demand_settings jsonb;


-- ─── 3. demand_history table ─────────────────────────────────────────────
create table if not exists public.demand_history (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  date date not null,
  request_count integer not null check (request_count >= 0),
  source text not null check (source in ('askmygp','anima','klinik','patchs','accurx','manual','other')),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  -- One value per practice per date. Re-uploads overwrite (handled via
  -- ON CONFLICT in the application code).
  unique (practice_id, date)
);

create index if not exists demand_history_practice_date_idx
  on public.demand_history (practice_id, date desc);


-- ─── 4. RLS for demand_history ───────────────────────────────────────────
alter table public.demand_history enable row level security;

-- Read: any practice member can see their practice's demand history
drop policy if exists demand_history_select on public.demand_history;
create policy demand_history_select
  on public.demand_history for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = demand_history.practice_id
        and pu.user_id = auth.uid()
    )
  );

-- Write/update/delete: practice admin or owner only
drop policy if exists demand_history_modify on public.demand_history;
create policy demand_history_modify
  on public.demand_history for all
  using (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  );


-- ─── 5. Audit-log helper view (optional, but useful) ─────────────────────
-- Last upload per source per practice — handy for the settings UI.
create or replace view public.demand_history_summary as
select
  practice_id,
  source,
  count(*) as row_count,
  min(date) as earliest_date,
  max(date) as latest_date,
  max(uploaded_at) as last_uploaded_at
from public.demand_history
group by practice_id, source;
-- (Views inherit RLS from underlying tables.)
