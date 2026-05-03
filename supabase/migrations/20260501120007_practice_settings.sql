-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 007: practice_settings
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces: data.huddleSettings, data.buddySettings, data.roomAllocation,
-- data.savedSlotFilters, data.expectedCapacity, etc.
--
-- One row per practice. Most settings are stored as JSONB for flexibility
-- (these settings change shape often during development). When the schema
-- stabilises we can promote frequently-queried fields to typed columns.
-- ═══════════════════════════════════════════════════════════════════════════


create table public.practice_settings (
  practice_id   uuid primary key references public.practices(id) on delete cascade,

  -- Huddle config: dutyDoctorSlot, savedSlotFilters, expectedCapacity, etc.
  huddle_settings jsonb not null default '{}'::jsonb,

  -- Buddy cover config: defaults, exclusions, etc.
  buddy_settings jsonb not null default '{}'::jsonb,

  -- Room allocation config: sites, room IDs, colour mapping
  room_allocation jsonb not null default '{}'::jsonb,

  -- Closed days: { '2026-12-25': 'Christmas Day', ... }
  closed_days jsonb not null default '{}'::jsonb,

  -- TeamNet integration URL (kept from v3)
  teamnet_url text,

  -- Catch-all for anything not covered above
  extras jsonb not null default '{}'::jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create trigger practice_settings_set_updated_at
  before update on public.practice_settings
  for each row execute function public.set_updated_at();


-- ─── Auto-create settings row when a practice is created ────────────────
create or replace function public.handle_new_practice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.practice_settings (practice_id)
  values (new.id);
  return new;
end;
$$;

create trigger on_practice_created
  after insert on public.practices
  for each row execute function public.handle_new_practice();


-- Backfill: any existing practices without settings get a default row
insert into public.practice_settings (practice_id)
select id from public.practices
where id not in (select practice_id from public.practice_settings);


-- ─── Row-level security ─────────────────────────────────────────────────
alter table public.practice_settings enable row level security;

-- All members can read settings of their practice
create policy practice_settings_select_member
  on public.practice_settings for select
  using (practice_id in (select public.user_practice_ids()));

-- Only admins can update settings
create policy practice_settings_update_admin
  on public.practice_settings for update
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

-- INSERT is handled by the trigger; DELETE happens via cascade when practice deleted.
-- No explicit INSERT/DELETE policies → blocked by default-deny.


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. Each practice gets a settings row automatically on creation.
-- App code reads/writes via standard Supabase queries; RLS enforces:
--   - any practice member can read
--   - only owners/admins can update
-- ═══════════════════════════════════════════════════════════════════════════
