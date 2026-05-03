-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 012: public_access_tokens
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Replaces: anonymous /buddy and /#rota links in v3.
--
-- v3 had public links anyone could view without login (buddy cover, personal
-- rotas). For v4, we make these explicit: each public link is a generated
-- token tied to a practice + scope. Tokens can be revoked.
--
-- Three scopes initially:
--   buddy_today       — public buddy cover for today (the wall display)
--   rota_clinician    — single clinician's rota (the My Rota share link)
--   ical_clinician    — calendar subscription URL (future)
--
-- Each token is a long random string in the URL. No login required, but the
-- token can be revoked or rotated by an admin. RLS enforces that only admins
-- of the practice can manage tokens.
-- ═══════════════════════════════════════════════════════════════════════════


create type public.token_scope as enum (
  'buddy_today',         -- /buddy/{token} — public buddy cover wall display
  'rota_clinician',      -- /rota/{token} — share link for one clinician
  'ical_clinician'       -- /ical/{token} — iCal subscription
);


create table public.public_access_tokens (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  scope         public.token_scope not null,
  token         text not null unique,                       -- long random string in URL

  -- For scoped tokens (rota_clinician, ical_clinician)
  clinician_id  uuid references public.clinicians(id) on delete cascade,

  -- Lifecycle
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id),
  last_accessed_at timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid references auth.users(id),

  -- Optional rate-limiting / abuse tracking — populated on each access
  access_count  bigint not null default 0
);

create index public_access_tokens_practice_idx on public.public_access_tokens (practice_id);
create unique index public_access_tokens_token_active_uidx
  on public.public_access_tokens (token)
  where revoked_at is null;


-- ─── Row-level security ─────────────────────────────────────────────────
alter table public.public_access_tokens enable row level security;

-- Admins can manage tokens for their practice
create policy public_access_tokens_select_admin
  on public.public_access_tokens for select
  using (public.is_practice_admin(practice_id));

create policy public_access_tokens_insert_admin
  on public.public_access_tokens for insert
  with check (public.is_practice_admin(practice_id));

create policy public_access_tokens_update_admin
  on public.public_access_tokens for update
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

create policy public_access_tokens_delete_admin
  on public.public_access_tokens for delete
  using (public.is_practice_admin(practice_id));


-- ─── Token validation function ─────────────────────────────────────────
-- Used by the public-facing routes. Returns the practice_id + scope +
-- clinician_id (if scoped) for a valid token, or NULL if revoked/missing.
-- Updates last_accessed_at + increments access_count.
-- This function is callable from anonymous (anon) users.
create or replace function public.validate_public_token(t text)
returns table (
  practice_id uuid,
  scope public.token_scope,
  clinician_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  tok public.public_access_tokens;
begin
  select * into tok
  from public.public_access_tokens
  where token = t and revoked_at is null;

  if tok.id is null then
    return;
  end if;

  -- Touch last_accessed_at + access_count
  update public.public_access_tokens
  set last_accessed_at = now(), access_count = access_count + 1
  where id = tok.id;

  return query select tok.practice_id, tok.scope, tok.clinician_id;
end;
$$;

revoke all on function public.validate_public_token(text) from public;
grant execute on function public.validate_public_token(text) to anon, authenticated;


-- ─── Token generation function (admin only) ────────────────────────────
-- Creates a new token. Returns the generated token string (caller stores
-- this in the URL it shares). Token is generated as 32 chars of base64.
create or replace function public.generate_public_token(
  target_practice_id uuid,
  target_scope public.token_scope,
  target_clinician_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  new_token text;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_practice_admin(target_practice_id) then
    raise exception 'Only practice admins can generate tokens';
  end if;

  -- For clinician-scoped tokens, the clinician must be in this practice
  if target_scope in ('rota_clinician', 'ical_clinician') then
    if target_clinician_id is null then
      raise exception 'clinician_id is required for this token scope';
    end if;
    if not exists (
      select 1 from public.clinicians
      where id = target_clinician_id and practice_id = target_practice_id
    ) then
      raise exception 'Clinician does not belong to this practice';
    end if;
  end if;

  -- Generate token: 24 random bytes → base64 (~32 chars, URL-safe)
  new_token := replace(replace(replace(encode(gen_random_bytes(24), 'base64'), '/', '_'), '+', '-'), '=', '');

  insert into public.public_access_tokens
    (practice_id, scope, clinician_id, token, created_by)
  values
    (target_practice_id, target_scope, target_clinician_id, new_token, caller_id);

  return new_token;
end;
$$;

revoke all on function public.generate_public_token(uuid, public.token_scope, uuid) from public;
grant execute on function public.generate_public_token(uuid, public.token_scope, uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- The app exposes /api/public/{token} routes that call validate_public_token
-- to look up which practice + clinician the token belongs to, then return
-- the appropriate read-only data (with RLS bypassed via SECURITY DEFINER
-- inside dedicated read functions written later).
--
-- Admins manage tokens via /v4/practice/[id]/sharing — generate, revoke,
-- view access stats.
-- ═══════════════════════════════════════════════════════════════════════════
