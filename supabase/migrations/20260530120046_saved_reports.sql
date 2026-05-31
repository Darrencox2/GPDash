-- Saved workload reports.
--
-- Named, reusable report configurations for the Workload Audit report
-- builder. A practice manager builds a custom report (measure, grouping,
-- filters, chart type, etc), names it, and it persists per-practice so it
-- appears alongside the built-in presets next session and is shared with
-- colleagues at the same practice.
--
-- The full builder config is stored as JSONB — the shape is owned by the
-- application (lib/workload-report.js / WorkloadReportBuilder), so we keep
-- the column schemaless rather than mirroring every field in columns.
--
-- Read:  any practice member can see their practice's saved reports.
-- Write: only practice admins (matches clinicians_metadata, demand_history,
--        day_annotations).
-- Deletion: explicit DELETE by an admin. ON DELETE CASCADE from practices.

-- ─── 1. Table ────────────────────────────────────────────────────────────
create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  config jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- One report name per practice. Re-saving the same name overwrites
  -- (handled via ON CONFLICT in the application code).
  unique (practice_id, name)
);

create index if not exists saved_reports_practice_idx
  on public.saved_reports (practice_id, created_at desc);

-- ─── 2. Updated-at trigger ───────────────────────────────────────────────
create or replace function public.touch_saved_reports_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists saved_reports_touch_updated_at on public.saved_reports;
create trigger saved_reports_touch_updated_at
  before update on public.saved_reports
  for each row execute function public.touch_saved_reports_updated_at();

-- ─── 3. RLS ──────────────────────────────────────────────────────────────
alter table public.saved_reports enable row level security;

-- Read: any practice member can see their practice's saved reports.
drop policy if exists saved_reports_select on public.saved_reports;
create policy saved_reports_select
  on public.saved_reports for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = saved_reports.practice_id
        and pu.user_id = auth.uid()
    )
  );

-- Write/update/delete: practice admin (or platform admin) only.
drop policy if exists saved_reports_modify on public.saved_reports;
create policy saved_reports_modify
  on public.saved_reports for all
  using (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  );

comment on table public.saved_reports is
  'Named, reusable workload report configurations for the report builder. Admin-write, member-read. config JSONB shape is owned by the application.';
