-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 008: csv_uploads + huddle_csv_data
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces: data.huddleCsvData (single blob, overwritten each upload)
--           data.huddleCsvUploadedAt (timestamp only)
--
-- Two tables:
--   csv_uploads      — one row per upload event (audit trail)
--   huddle_csv_data  — the latest parsed CSV data per practice
--
-- We keep csv_uploads forever (audit + ability to look at history) but
-- huddle_csv_data only stores the current state (overwritten each upload).
-- This matches v3 behaviour but adds the audit log.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. csv_uploads — audit trail ───────────────────────────────────────
create table public.csv_uploads (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null references public.practices(id) on delete cascade,

  uploaded_by     uuid references auth.users(id),
  uploaded_at     timestamptz not null default now(),

  filename        text,
  rows_count      integer,
  date_range_start date,
  date_range_end   date,
  new_staff_count integer default 0,

  -- Don't store the raw CSV permanently — it's huge and could contain
  -- patient-adjacent data. Instead, track metadata only. The parsed
  -- structured data lives in huddle_csv_data.
  notes           text
);

create index csv_uploads_practice_idx
  on public.csv_uploads (practice_id, uploaded_at desc);


-- ─── 2. huddle_csv_data — current parsed data ───────────────────────────
-- One row per practice. The 'data' jsonb is the parsed structure used by
-- the Huddle pages. Schema of that JSONB is defined by the app and may
-- change — promoting frequently-queried fields to columns later is fine.
create table public.huddle_csv_data (
  practice_id   uuid primary key references public.practices(id) on delete cascade,
  data          jsonb not null,
  upload_id     uuid references public.csv_uploads(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id)
);

create trigger huddle_csv_data_set_updated_at
  before update on public.huddle_csv_data
  for each row execute function public.set_updated_at();


-- ─── Row-level security ─────────────────────────────────────────────────
alter table public.csv_uploads enable row level security;
alter table public.huddle_csv_data enable row level security;

-- csv_uploads: members can read, admins can insert (delete blocked — audit immutability)
create policy csv_uploads_select_member
  on public.csv_uploads for select
  using (practice_id in (select public.user_practice_ids()));

create policy csv_uploads_insert_admin
  on public.csv_uploads for insert
  with check (public.is_practice_admin(practice_id));

-- No UPDATE/DELETE — audit log is append-only.

-- huddle_csv_data: members can read, admins can insert/update
create policy huddle_csv_data_select_member
  on public.huddle_csv_data for select
  using (practice_id in (select public.user_practice_ids()));

create policy huddle_csv_data_insert_admin
  on public.huddle_csv_data for insert
  with check (public.is_practice_admin(practice_id));

create policy huddle_csv_data_update_admin
  on public.huddle_csv_data for update
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- App flow on CSV upload:
--   1. Parse CSV → produce metadata (rows, date range, new staff)
--   2. Insert csv_uploads row (audit)
--   3. Upsert huddle_csv_data with the parsed jsonb + upload_id reference
-- ═══════════════════════════════════════════════════════════════════════════
