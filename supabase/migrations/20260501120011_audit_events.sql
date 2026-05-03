-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 011: audit_events + auth_events
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Critical for IG / DCB0129 / GDPR. Append-only audit log of significant
-- events with the actor (user_id) recorded alongside.
--
-- Two tables:
--   audit_events — application-level events (CSV uploaded, settings changed,
--                  invite sent, etc.) scoped per practice
--   auth_events  — authentication events (login, logout, password reset,
--                  failed login) scoped per user
--
-- Both are append-only — no UPDATE/DELETE policies.
-- Audit data has a retention policy (TBD — likely 7 years per NHS guidance,
-- but configurable per practice for non-NHS users).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. audit_events ────────────────────────────────────────────────────
create type public.audit_event_type as enum (
  -- Practice management
  'practice_created',
  'practice_updated',
  'user_invited',
  'invite_accepted',
  'invite_revoked',
  'user_role_changed',
  'user_removed',

  -- Clinician management
  'clinician_added',
  'clinician_updated',
  'clinician_status_changed',
  'clinician_deleted',

  -- Working pattern / absence
  'working_pattern_changed',
  'absence_added',
  'absence_updated',
  'absence_deleted',
  'daily_override_set',

  -- CSV upload
  'csv_uploaded',

  -- Buddy / rota
  'buddy_allocations_generated',
  'buddy_allocations_edited',
  'rota_note_added',
  'rota_note_updated',
  'rota_note_deleted',

  -- Settings
  'settings_changed',

  -- Catch-all
  'other'
);


create table public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  user_id       uuid references auth.users(id),                 -- the actor (null = system)
  event_type    public.audit_event_type not null,
  description   text,                                            -- human-readable
  details       jsonb,                                           -- structured event details
  ip_address    inet,
  user_agent    text,
  occurred_at   timestamptz not null default now()
);

create index audit_events_practice_time_idx
  on public.audit_events (practice_id, occurred_at desc);

create index audit_events_user_idx
  on public.audit_events (user_id, occurred_at desc)
  where user_id is not null;


-- ─── 2. auth_events ─────────────────────────────────────────────────────
-- Note: Supabase Auth has its own logs for login attempts (visible in the
-- dashboard). We keep this separate table for app-level visibility
-- (e.g. an admin reviewing "who logged into our practice this week").
create type public.auth_event_type as enum (
  'signup',
  'login',
  'logout',
  'password_reset_requested',
  'password_changed',
  'mfa_enrolled',
  'mfa_challenged',
  'mfa_failed',
  'failed_login',
  'account_locked'
);


create table public.auth_events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id),                 -- null on failed_login (no user yet)
  email         text,                                            -- for failed_login when no user_id
  event_type    public.auth_event_type not null,
  details       jsonb,
  ip_address    inet,
  user_agent    text,
  occurred_at   timestamptz not null default now()
);

create index auth_events_user_idx
  on public.auth_events (user_id, occurred_at desc)
  where user_id is not null;

create index auth_events_email_idx
  on public.auth_events (lower(email), occurred_at desc)
  where email is not null;


-- ─── Row-level security ─────────────────────────────────────────────────
alter table public.audit_events enable row level security;
alter table public.auth_events enable row level security;

-- audit_events: practice members can read events for their practice
-- (admins might want all; for now everyone in the practice can see — tighten later)
create policy audit_events_select_member
  on public.audit_events for select
  using (practice_id in (select public.user_practice_ids()));

-- INSERT goes through SECURITY DEFINER functions only — block direct insert
-- (function-based inserts ensure user_id is set correctly from auth.uid())
-- No INSERT policy → default deny.

-- No UPDATE/DELETE policies → audit log is immutable.


-- auth_events: user can read their own auth events.
create policy auth_events_select_own
  on public.auth_events for select
  using (user_id = (select auth.uid()));

-- INSERT also via function only.
-- No UPDATE/DELETE.


-- ─── Helper: log_audit_event() ──────────────────────────────────────────
-- The single sanctioned way to write to audit_events. App code calls this RPC.
-- It captures auth.uid() automatically so callers can't forge actor identity.
create or replace function public.log_audit_event(
  target_practice_id uuid,
  event_type public.audit_event_type,
  description text default null,
  details jsonb default null
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
  -- Caller must be a member of the practice (otherwise you could log noise
  -- in someone else's audit trail)
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.practice_users
    where practice_id = target_practice_id and user_id = caller_id
  ) then
    raise exception 'You are not a member of this practice';
  end if;

  insert into public.audit_events (practice_id, user_id, event_type, description, details)
  values (target_practice_id, caller_id, event_type, description, details)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.log_audit_event(uuid, public.audit_event_type, text, jsonb) from public;
grant execute on function public.log_audit_event(uuid, public.audit_event_type, text, jsonb) to authenticated;


-- ─── Helper: log_auth_event() ───────────────────────────────────────────
create or replace function public.log_auth_event(
  event_type public.auth_event_type,
  email text default null,
  details jsonb default null
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
  insert into public.auth_events (user_id, email, event_type, details)
  values (caller_id, email, event_type, details)
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.log_auth_event(public.auth_event_type, text, jsonb) from public;
grant execute on function public.log_auth_event(public.auth_event_type, text, jsonb) to authenticated;
-- Allow anonymous users to log certain auth events (failed login attempts)
grant execute on function public.log_auth_event(public.auth_event_type, text, jsonb) to anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- App code calls log_audit_event() from server actions / API routes after
-- successful mutations. Auth events can be logged from the auth callbacks
-- on both server and client.
--
-- Integrity properties:
--   - user_id is captured from auth.uid() inside the function — clients cannot forge
--   - No UPDATE/DELETE policies — append-only
--   - Membership check in log_audit_event prevents cross-practice noise
-- ═══════════════════════════════════════════════════════════════════════════
