-- ═══════════════════════════════════════════════════════════════════════════
-- app_errors — client-side crash capture
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now a crash surfaced as "Please screenshot this box for Darren" in
-- SectionErrorBoundary, and everything else (a failed retention run, a
-- swallowed query error) went to console.warn in a Vercel log nobody reads.
-- The retention-cleanup bug found in the v4.117.2 review had been silently
-- reporting success; nothing would have raised a hand.
--
-- This is deliberately small: one table, written by one API route, read only
-- by platform admins. No third-party service, no DSN, no data leaving the
-- estate — which for a clinical tool is a feature, not a limitation.
--
-- No PII by design: the route stores the error message, stack and the path
-- it happened on. It records user_id and practice_id as foreign keys so a
-- report can be traced, but never names, emails or patient data.

create table if not exists public.app_errors (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  -- Nullable: an error can happen before we know who or where.
  user_id         uuid references auth.users(id) on delete set null,
  practice_id     uuid references public.practices(id) on delete set null,
  source          text not null default 'client',   -- client | boundary | unhandled
  message         text not null,
  stack           text,
  component_stack text,
  path            text,
  app_version     text,
  user_agent      text
);

comment on table public.app_errors is
  'Client-side crash reports. Written by /api/v4/client-error, read by platform admins only. Never store names, emails or patient data here.';

create index if not exists app_errors_created_at_idx on public.app_errors (created_at desc);
create index if not exists app_errors_practice_idx   on public.app_errors (practice_id, created_at desc);

alter table public.app_errors enable row level security;

-- Nobody reads this through the client. The API route writes with the
-- service role; platform admins read through the RPC below. No broad
-- select policy, so a signed-in user cannot enumerate other practices'
-- crashes - the mistake this whole release is cleaning up after.
drop policy if exists app_errors_admin_select on public.app_errors;
create policy app_errors_admin_select on public.app_errors
  for select using (public.is_platform_admin());

-- Recent errors, newest first, for the admin screen.
create or replace function public.list_app_errors(limit_count int default 100)
returns setof public.app_errors
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.app_errors
  where public.is_platform_admin()   -- guard lives INSIDE the query
  order by created_at desc
  limit least(coalesce(limit_count, 100), 500);
$$;

revoke all on function public.list_app_errors(int) from public;
grant execute on function public.list_app_errors(int) to authenticated;

comment on function public.list_app_errors(int) is
  'Recent client crash reports for the platform admin screen. SECURITY DEFINER but gated on is_platform_admin() inside the query - keep that guard.';
