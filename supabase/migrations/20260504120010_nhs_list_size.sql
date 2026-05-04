-- GPDash v4 — add list_size to nhs_oc_baseline + per-1000 normalisation
-- ─────────────────────────────────────────────────────────────────────
-- The NHS OC submissions data we ingest doesn't include practice list sizes,
-- so naive comparison ("you do 130 submissions/day vs PCN avg 116") penalises
-- bigger practices that just have more patients. Adding a list_size column
-- (populated separately, see /api/admin/backfill-nhs-list-sizes) lets the
-- summary views compute submissions per 1000 patients per reporting weekday
-- — a fair apples-to-apples comparison.
--
-- Practices where list_size is null are excluded from the per-1000 PCN /
-- national averages but still appear in the raw totals. As the backfill
-- progresses the per-1000 numbers become more accurate.

alter table public.nhs_oc_baseline
  add column if not exists list_size integer;

create index if not exists nhs_oc_baseline_list_size_idx
  on public.nhs_oc_baseline (list_size)
  where list_size is not null;

-- ─── Updated PCN summary view — adds avg_per_1000_per_day ───────────
drop view if exists public.nhs_oc_baseline_pcn_summary;
create view public.nhs_oc_baseline_pcn_summary as
  select
    month,
    pcn_code,
    pcn_name,
    count(*) as practice_count,
    count(list_size) as practices_with_list_size,
    sum(total) as pcn_total,
    avg(total) as avg_total_per_practice,
    avg(days_with_data) as avg_days_with_data,
    -- Per 1000 patients per reporting weekday — only practices where we know
    -- the list size are included in the average
    avg(
      case
        when list_size > 0 and days_with_data > 0
        then (total::numeric / days_with_data) / list_size * 1000
        else null
      end
    ) as avg_per_1000_per_day
  from public.nhs_oc_baseline
  where pcn_code is not null
  group by month, pcn_code, pcn_name;

-- ─── Updated national summary view ──────────────────────────────────
drop view if exists public.nhs_oc_baseline_national_summary;
create view public.nhs_oc_baseline_national_summary as
  select
    month,
    count(*) as practice_count,
    count(list_size) as practices_with_list_size,
    sum(total) as national_total,
    avg(total) as avg_total_per_practice,
    avg(days_with_data) as avg_days_with_data,
    sum(clinical) as national_clinical,
    sum(admin) as national_admin,
    sum(unknown_other) as national_unknown_other,
    avg(
      case
        when list_size > 0 and days_with_data > 0
        then (total::numeric / days_with_data) / list_size * 1000
        else null
      end
    ) as avg_per_1000_per_day
  from public.nhs_oc_baseline
  group by month;

grant select on public.nhs_oc_baseline_pcn_summary to authenticated;
grant select on public.nhs_oc_baseline_national_summary to authenticated;
