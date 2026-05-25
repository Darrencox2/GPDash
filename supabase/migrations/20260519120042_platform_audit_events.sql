-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 042: platform_audit_events
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Audit trail for platform-level admin actions that don't belong to any
-- single practice. The existing audit_events table is keyed by practice_id
-- and works well for practice-scoped actions (membership changes, settings
-- changes, etc.). But several admin actions are platform-wide:
--
--   - Suspending or unsuspending a user
--   - Generating auth links for any email
--   - Uploading the monthly NHS OC baseline data
--   - Backfilling list sizes from NHS Digital
--   - Adding or removing other platform admins
--
-- These need their own home. impersonation_sessions already exists for
-- the most sensitive admin action (impersonating a user); this is the
-- general-purpose equivalent for everything else.
--
-- Same approach as impersonation_sessions:
--   - Dedicated table (not new audit_event_type enum values — Postgres
--     can't ALTER TYPE inside a transaction, which Supabase migrations are)
--   - Service-role writes only (RLS blocks user-token inserts; helper
--     RPC is the only sanctioned write path)
--   - Platform-admin-only reads
--   - Append-only (no UPDATE/DELETE)
-- ═══════════════════════════════════════════════════════════════════════════


create type public.platform_audit_action as enum (
  -- User account management
  'user_suspended',
  'user_unsuspended',
  'platform_admin_added',
  'platform_admin_removed',

  -- Auth link generation
  'admin_link_generated',

  -- Bulk data operations
  'nhs_baseline_uploaded',
  'list_sizes_backfilled',

  -- Catch-all
  'other'
);


create table public.platform_audit_events (
  id              uuid primary key default gen_random_uuid(),

  -- The platform admin who took the action. Captured from auth.uid()
  -- inside the helper RPC so callers can't forge actor identity.
  actor_user_id   uuid not null references auth.users(id),

  action          public.platform_audit_action not null,

  -- For user-targeted actions (suspend, link generation, admin role
  -- changes). Null for bulk-data actions that have no specific target.
  target_user_id  uuid references auth.users(id),
  target_email    text,                                    -- denormalised for searchability + reading after target user is deleted

  description     text,                                    -- human-readable summary
  details         jsonb,                                   -- structured detail

  -- Request fingerprint at the time of action
  ip_address      inet,
  user_agent      text,

  occurred_at     timestamptz not null default now()
);


create index platform_audit_events_actor_idx
  on public.platform_audit_events (actor_user_id, occurred_at desc);

create index platform_audit_events_target_idx
  on public.platform_audit_events (target_user_id, occurred_at desc)
  where target_user_id is not null;

create index platform_audit_events_action_idx
  on public.platform_audit_events (action, occurred_at desc);


-- ─── RLS — platform admins read; nobody writes directly ──────────────────
alter table public.platform_audit_events enable row level security;

drop policy if exists "platform admins read platform audit" on public.platform_audit_events;
create policy "platform admins read platform audit"
  on public.platform_audit_events
  for select
  using (public.is_platform_admin());

-- No INSERT/UPDATE/DELETE policies — only the helper RPC (security
-- definer) can write. No path for the table to be tampered with via
-- a user-token query, even by a platform admin.


-- ─── Helper: log_platform_audit_event() ──────────────────────────────────
-- The single sanctioned way to write to platform_audit_events.
-- security definer + auth.uid() capture means callers can't forge
-- the actor identity (you always log AS yourself).
--
-- ip_address and user_agent are passed in by the caller because
-- Postgres doesn't have direct access to the HTTP request headers
-- from inside an RPC. App code should pull them from the request
-- and pass them along.
create or replace function public.log_platform_audit_event(
  action public.platform_audit_action,
  target_user_id uuid default null,
  target_email text default null,
  description text default null,
  details jsonb default null,
  ip_address inet default null,
  user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Only platform admins can log platform-level events. Belt-and-braces
  -- on top of the API-route admin check.
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  insert into public.platform_audit_events (
    actor_user_id, action, target_user_id, target_email,
    description, details, ip_address, user_agent
  )
  values (
    caller_id, action, target_user_id, target_email,
    description, details, ip_address, user_agent
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_platform_audit_event(
  public.platform_audit_action, uuid, text, text, jsonb, inet, text
) from public;
grant execute on function public.log_platform_audit_event(
  public.platform_audit_action, uuid, text, text, jsonb, inet, text
) to authenticated;


-- ─── List recent platform audit events — for the admin UI later ──────────
create or replace function public.admin_list_platform_audit_events(
  for_action public.platform_audit_action default null,
  for_actor_id uuid default null,
  for_target_id uuid default null,
  limit_count int default 50
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  if limit_count is null or limit_count < 1 then limit_count := 50; end if;
  if limit_count > 200 then limit_count := 200; end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into result
  from (
    select
      e.id,
      e.actor_user_id,
      actor.email as actor_email,
      actor_pr.name as actor_name,
      e.action,
      e.target_user_id,
      tgt.email as target_user_email,
      e.target_email,
      e.description,
      e.details,
      host(e.ip_address) as ip_address,
      e.user_agent,
      e.occurred_at
    from public.platform_audit_events e
    join auth.users actor on actor.id = e.actor_user_id
    left join public.profiles actor_pr on actor_pr.id = e.actor_user_id
    left join auth.users tgt on tgt.id = e.target_user_id
    where (for_action is null or e.action = for_action)
      and (for_actor_id is null or e.actor_user_id = for_actor_id)
      and (for_target_id is null or e.target_user_id = for_target_id)
    order by e.occurred_at desc
    limit limit_count
  ) t;

  return result;
end;
$$;

revoke all on function public.admin_list_platform_audit_events(
  public.platform_audit_action, uuid, uuid, int
) from public;
grant execute on function public.admin_list_platform_audit_events(
  public.platform_audit_action, uuid, uuid, int
) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- App code (API routes for suspend-user, generate-link, upload-nhs-oc-
-- baseline, backfill-nhs-list-sizes) should call log_platform_audit_event
-- after a successful action.
-- ═══════════════════════════════════════════════════════════════════════════
