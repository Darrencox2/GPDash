-- Day annotations for the Capacity Planning page.
--
-- One sticky note per practice per date. Lets practice managers capture
-- the context that lives in their head (or in WhatsApp) — e.g.
-- "Dr X locum AM", "training afternoon", "winter pressure surge expected"
-- — directly on the relevant day in the 6-week capacity view. Shows as
-- a small 📝 icon on the cell when present; full text is editable inside
-- the day detail drawer.
--
-- Read: any practice member can see annotations for their practice.
-- Write: only practice admins (matches the existing pattern for
--        clinicians_metadata, demand_history etc).
-- Deletion: handled by setting note to empty string, OR explicit DELETE
--           by an admin. ON DELETE CASCADE from practices means a
--           deleted practice cleans up its annotations.

-- ─── 1. Table ────────────────────────────────────────────────────────────
create table if not exists public.day_annotations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  date date not null,
  note text not null check (char_length(note) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- One annotation per practice per date. Re-saving overwrites (handled
  -- via ON CONFLICT in the application code).
  unique (practice_id, date)
);

create index if not exists day_annotations_practice_date_idx
  on public.day_annotations (practice_id, date);

-- ─── 2. Updated-at trigger ───────────────────────────────────────────────
create or replace function public.touch_day_annotations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists day_annotations_touch_updated_at on public.day_annotations;
create trigger day_annotations_touch_updated_at
  before update on public.day_annotations
  for each row execute function public.touch_day_annotations_updated_at();

-- ─── 3. RLS ──────────────────────────────────────────────────────────────
alter table public.day_annotations enable row level security;

-- Read: any practice member can see their practice's annotations.
drop policy if exists day_annotations_select on public.day_annotations;
create policy day_annotations_select
  on public.day_annotations for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = day_annotations.practice_id
        and pu.user_id = auth.uid()
    )
  );

-- Write/update/delete: practice admin (or platform admin) only.
drop policy if exists day_annotations_modify on public.day_annotations;
create policy day_annotations_modify
  on public.day_annotations for all
  using (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  );

comment on table public.day_annotations is
  'Practice-manager sticky notes against specific dates on the Capacity Planning page. Admin-write, member-read.';
