-- Per-user report favourites.
--
-- Lets each user star reports (built-in presets or their practice's saved
-- reports) so their favourites pin to the top of the Reporting gallery.
-- Favourites are personal — each user curates their own top row — but
-- scoped to a practice so the same user in two practices keeps them apart.
--
-- ref encodes what was favourited:
--   'preset:<preset-id>'  — a built-in preset (e.g. preset:busiest-load)
--   'saved:<uuid>'        — a saved_reports row
-- We keep ref as opaque text so the app owns the scheme and we do not need
-- a migration when presets change.
--
-- Read/write: a user sees and manages only their own favourites.

create table if not exists public.report_favourites (
  user_id uuid not null references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  ref text not null check (char_length(ref) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (user_id, practice_id, ref)
);

create index if not exists report_favourites_user_practice_idx
  on public.report_favourites (user_id, practice_id);

alter table public.report_favourites enable row level security;

-- A user can only see their own favourites.
drop policy if exists report_favourites_select on public.report_favourites;
create policy report_favourites_select
  on public.report_favourites for select
  using (user_id = auth.uid());

-- A user can only add/remove their own favourites, and only for a practice
-- they belong to.
drop policy if exists report_favourites_modify on public.report_favourites;
create policy report_favourites_modify
  on public.report_favourites for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.practice_users pu
      where pu.practice_id = report_favourites.practice_id
        and pu.user_id = auth.uid()
    )
  );

comment on table public.report_favourites is
  'Per-user starred reports (preset:<id> or saved:<uuid>) that pin to the top of the Reporting gallery. Each user sees only their own.';
