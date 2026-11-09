-- Week in review: one sign-off per practice per week.
--
-- The Week in review page lists what must be right before a week goes
-- live on EMIS (urgent capacity against target, clinicians per site,
-- duty doctor, ward rounds, plan against EMIS). When someone has been
-- through it they mark the week reviewed; that record is this row. Flags
-- the reviewer looked at and decided were fine are acknowledged here too,
-- with a reason, so the next person sees why.
--
-- Read: any practice member. Write: practice admins (owner, partner,
-- practice manager, admin) or platform admin - the same rule as
-- day_annotations.

create table if not exists public.week_reviews (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  week_start date not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  note text check (note is null or char_length(note) <= 2000),
  -- { "<flag id>": { "by": "<name>", "at": "<iso>", "reason": "<text>" } }
  acknowledged jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, week_start)
);

create index if not exists week_reviews_practice_week_idx
  on public.week_reviews (practice_id, week_start);

create or replace function public.touch_week_reviews_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists week_reviews_touch_updated_at on public.week_reviews;
create trigger week_reviews_touch_updated_at
  before update on public.week_reviews
  for each row execute function public.touch_week_reviews_updated_at();

alter table public.week_reviews enable row level security;

drop policy if exists week_reviews_select on public.week_reviews;
create policy week_reviews_select
  on public.week_reviews for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.practice_users pu
      where pu.practice_id = week_reviews.practice_id
        and pu.user_id = auth.uid()
    )
  );

drop policy if exists week_reviews_modify on public.week_reviews;
create policy week_reviews_modify
  on public.week_reviews for all
  using (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_practice_admin(practice_id)
  );

comment on table public.week_reviews is
  'Week in review sign-off: who reviewed a week and when, plus flags they acknowledged with a reason. Admin-write, member-read.';
