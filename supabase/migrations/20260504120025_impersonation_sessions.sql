-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 035: impersonation_sessions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Records every "platform admin signs in as another user for support
-- debugging" event. This is a powerful capability — used to reproduce
-- bugs the user is reporting, see exactly what they see — and it's
-- also a privacy-sensitive one. Two safeguards:
--
--   1. Every session is logged: admin_user_id, target_user_id, when it
--      started, when it ended, why (reason field), the admin's IP and
--      user-agent at start time.
--
--   2. Time-limited: each session has expires_at = started_at + 1 hour
--      by default. After expiry, end-of-impersonation flow can no
--      longer be used to verify the session as valid (the banner
--      stops showing). The actual auth session is enforced by
--      Supabase's normal token expiry.
--
-- ─── Why no enum changes? ────────────────────────────────────────────────
-- We considered adding 'impersonation_started' / '_ended' to the
-- audit_event_type or auth_event_type enums, but adding enum values in
-- Postgres requires running OUTSIDE a transaction (which Supabase
-- migrations don't do). So instead we record all impersonation events
-- in this dedicated table — start and end on the same row, plus
-- structured columns for the things we actually want to query.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references auth.users(id) on delete cascade,
  target_user_id  uuid not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  expires_at      timestamptz not null default (now() + interval '1 hour'),
  reason          text,
  admin_ip        inet,
  admin_user_agent text,

  -- ended_at must be after or equal to started_at if set
  constraint impersonation_sessions_end_after_start
    check (ended_at is null or ended_at >= started_at)
);

create index if not exists impersonation_sessions_admin_idx
  on public.impersonation_sessions (admin_user_id, started_at desc);
create index if not exists impersonation_sessions_target_idx
  on public.impersonation_sessions (target_user_id, started_at desc);
create index if not exists impersonation_sessions_active_idx
  on public.impersonation_sessions (expires_at)
  where ended_at is null;


-- ─── RLS — platform admins read all; nobody writes directly ──────────────
-- Writes go through service-role API routes only. RLS enforces this for
-- any user-token query.
alter table public.impersonation_sessions enable row level security;

drop policy if exists "platform admins read impersonation sessions" on public.impersonation_sessions;
create policy "platform admins read impersonation sessions"
  on public.impersonation_sessions
  for select
  using (public.is_platform_admin());

-- The target user can also read their own sessions (so the banner-check
-- RPC works when called as the impersonated user).
drop policy if exists "target user reads own impersonation sessions" on public.impersonation_sessions;
create policy "target user reads own impersonation sessions"
  on public.impersonation_sessions
  for select
  using (target_user_id = auth.uid());


-- ─── admin_check_impersonation — validate active session for banner ──────
-- Called as the IMPERSONATED user (the target) to ask "am I currently
-- being impersonated, and if so what should the banner say". Only
-- returns rows that:
--   - belong to the calling user as the target
--   - haven't ended
--   - haven't expired
-- The session_id is passed in from a cookie set when impersonation
-- starts, so an attacker who knows their own user_id can't enumerate
-- other people's sessions via this RPC.
create or replace function public.admin_check_impersonation(session_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if auth.uid() is null then
    return null;
  end if;

  select json_build_object(
    'session_id', s.id,
    'admin_user_id', s.admin_user_id,
    'admin_email', adm.email,
    'admin_name', adm_pr.name,
    'target_user_id', s.target_user_id,
    'target_email', tgt.email,
    'started_at', s.started_at,
    'expires_at', s.expires_at,
    'reason', s.reason
  )
  into result
  from public.impersonation_sessions s
  join auth.users adm on adm.id = s.admin_user_id
  left join public.profiles adm_pr on adm_pr.id = s.admin_user_id
  join auth.users tgt on tgt.id = s.target_user_id
  where s.id = session_id
    and s.target_user_id = auth.uid()    -- caller IS the target
    and s.ended_at is null               -- still active
    and s.expires_at > now();            -- not expired

  return result;
end;
$$;
revoke all on function public.admin_check_impersonation(uuid) from public;
grant execute on function public.admin_check_impersonation(uuid) to authenticated;


-- ─── admin_end_impersonation — caller (target) marks session ended ───────
-- Called when the user (currently signed in as the target) clicks
-- "End impersonation" in the banner. Only the target can end their
-- own impersonation session — keeps things tidy.
create or replace function public.admin_end_impersonation(session_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.impersonation_sessions
  set ended_at = now()
  where id = session_id
    and target_user_id = auth.uid()  -- only the target can end it
    and ended_at is null;

  return json_build_object('ok', true);
end;
$$;
revoke all on function public.admin_end_impersonation(uuid) from public;
grant execute on function public.admin_end_impersonation(uuid) to authenticated;


-- ─── admin_list_impersonation_sessions — for an audit screen later ───────
-- Returns recent impersonation sessions. Platform-admin only.
create or replace function public.admin_list_impersonation_sessions(
  for_user_id uuid default null,
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
      s.id,
      s.admin_user_id,
      adm.email as admin_email,
      adm_pr.name as admin_name,
      s.target_user_id,
      tgt.email as target_email,
      tgt_pr.name as target_name,
      s.started_at,
      s.ended_at,
      s.expires_at,
      s.reason,
      host(s.admin_ip) as admin_ip
    from public.impersonation_sessions s
    join auth.users adm on adm.id = s.admin_user_id
    left join public.profiles adm_pr on adm_pr.id = s.admin_user_id
    join auth.users tgt on tgt.id = s.target_user_id
    left join public.profiles tgt_pr on tgt_pr.id = s.target_user_id
    where (for_user_id is null
      or s.admin_user_id = for_user_id
      or s.target_user_id = for_user_id)
    order by s.started_at desc
    limit limit_count
  ) t;

  return result;
end;
$$;
revoke all on function public.admin_list_impersonation_sessions(uuid, int) from public;
grant execute on function public.admin_list_impersonation_sessions(uuid, int) to authenticated;
