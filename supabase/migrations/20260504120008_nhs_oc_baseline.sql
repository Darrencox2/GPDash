-- NHS England's "Submissions via Online Consultation Systems" monthly
-- dataset, aggregated per practice. We use this to:
--   1. Pre-seed demand predictions during practice setup (so a new practice
--      gets useful predictions on day one, before they upload their own data)
--   2. Provide PCN / ICB / national benchmarking
--
-- Source: https://digital.nhs.uk/data-and-information/publications/statistical/submissions-via-online-consultation-systems-in-general-practice/
--
-- Refresh cadence: monthly. Each month is a separate row keyed by
-- (ods_code, month). Future cron will scrape the NHS publication page,
-- download the new ZIP, and upsert.

create table public.nhs_oc_baseline (
  id              bigserial primary key,
  ods_code        text not null,
  month           date not null,                 -- e.g. '2026-03-01' = March 2026
  practice_name   text,
  supplier        text,
  pcn_code        text,
  pcn_name        text,
  icb_code        text,
  icb_name        text,
  region_code     text,
  region_name     text,
  total           int not null default 0,        -- total submissions in month
  days_with_data  int not null default 0,
  clinical        int not null default 0,
  admin           int not null default 0,
  unknown_other   int not null default 0,
  by_weekday      jsonb not null default '{}',   -- { "Mon": 989, "Tue": 560, ... }
  by_hour         jsonb not null default '{}',   -- { "8": 659, "9": 450, ... }
  days_per_weekday jsonb not null default '{}',  -- { "Mon": 4, "Tue": 5, ... } — used to derive per-weekday averages
  ingested_at     timestamptz not null default now(),

  unique (ods_code, month)
);

create index idx_nhs_oc_baseline_ods on public.nhs_oc_baseline (ods_code);
create index idx_nhs_oc_baseline_month on public.nhs_oc_baseline (month);
create index idx_nhs_oc_baseline_pcn_code on public.nhs_oc_baseline (pcn_code);
create index idx_nhs_oc_baseline_icb_code on public.nhs_oc_baseline (icb_code);

-- RLS: anyone authenticated can read (this is national reference data,
-- no privacy concerns). Only platform admins can write.
alter table public.nhs_oc_baseline enable row level security;

create policy "Authenticated can read NHS baseline"
  on public.nhs_oc_baseline for select
  to authenticated
  using (true);

create policy "Platform admins can insert NHS baseline"
  on public.nhs_oc_baseline for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "Platform admins can update NHS baseline"
  on public.nhs_oc_baseline for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Platform admins can delete NHS baseline"
  on public.nhs_oc_baseline for delete
  to authenticated
  using (public.is_platform_admin());

-- Helper view: PCN-level aggregates (useful for benchmarking "your practice
-- vs PCN average"). Computed on demand — small enough to be fine.
create or replace view public.nhs_oc_baseline_pcn_summary as
  select
    month,
    pcn_code,
    pcn_name,
    count(*) as practice_count,
    sum(total) as pcn_total,
    avg(total) as avg_total_per_practice,
    avg(days_with_data) as avg_days_with_data
  from public.nhs_oc_baseline
  where pcn_code is not null
  group by month, pcn_code, pcn_name;

-- Helper view: national aggregates per month
create or replace view public.nhs_oc_baseline_national_summary as
  select
    month,
    count(*) as practice_count,
    sum(total) as national_total,
    avg(total) as avg_total_per_practice,
    sum(clinical) as national_clinical,
    sum(admin) as national_admin,
    sum(unknown_other) as national_unknown_other
  from public.nhs_oc_baseline
  group by month;

grant select on public.nhs_oc_baseline_pcn_summary to authenticated;
grant select on public.nhs_oc_baseline_national_summary to authenticated;
