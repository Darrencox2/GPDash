-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 009: buddy_allocations
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces: data.allocationHistory (object keyed by date in Redis blob)
--
-- One row per (practice, date) representing the buddy cover allocations for
-- that day. The allocations themselves are stored as JSONB because they
-- reference clinician IDs and the structure varies (covering whom, file vs
-- view-only, etc.). Could be normalised into a per-allocation row later if
-- queries demand it; for now JSONB matches v3 behaviour.
-- ═══════════════════════════════════════════════════════════════════════════


create table public.buddy_allocations (
  practice_id   uuid not null references public.practices(id) on delete cascade,
  date          date not null,

  -- The full allocation structure: { allocations: {...}, dayOffAllocations: {...},
  -- presentIds: [...], etc. } — same shape as v3's data.allocationHistory[date].
  allocations   jsonb not null,

  generated_at  timestamptz not null default now(),
  generated_by  uuid references auth.users(id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users(id),

  primary key (practice_id, date)
);

create index buddy_allocations_practice_date_idx
  on public.buddy_allocations (practice_id, date desc);

create trigger buddy_allocations_set_updated_at
  before update on public.buddy_allocations
  for each row execute function public.set_updated_at();


-- ─── Row-level security ─────────────────────────────────────────────────
alter table public.buddy_allocations enable row level security;

-- Members can read (so the public buddy page works for all members)
create policy buddy_allocations_select_member
  on public.buddy_allocations for select
  using (practice_id in (select public.user_practice_ids()));

-- Admins can write
create policy buddy_allocations_insert_admin
  on public.buddy_allocations for insert
  with check (public.is_practice_admin(practice_id));

create policy buddy_allocations_update_admin
  on public.buddy_allocations for update
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

create policy buddy_allocations_delete_admin
  on public.buddy_allocations for delete
  using (public.is_practice_admin(practice_id));


-- ═══════════════════════════════════════════════════════════════════════════
-- NOTE on the public buddy link:
-- v3 has a public /buddy page that anyone can view without logging in. In
-- v4, we'll handle this via:
--   - Either a separate read-only token (similar to calendar_subscriptions)
--   - Or a per-practice "public buddy enabled" flag + token
-- This is deferred to a later migration once we wire up the v4 buddy page.
-- For now, RLS is strict — only members can read. The public flow becomes
-- a deliberate opt-in feature with its own token.
-- ═══════════════════════════════════════════════════════════════════════════
