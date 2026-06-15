-- ============================================================================
-- Practice ingest tokens — scoped service tokens for automated CSV ingest
-- ============================================================================
-- Lets an external automation (e.g. Power Automate) POST an EMIS/demand CSV to
-- the ingest endpoint, authenticated by a per-practice token. Tokens are stored
-- HASHED (sha-256), never in plaintext. Each token is scoped to exactly one
-- practice and only grants the demand-ingest endpoint — never confidential
-- data (meetings RLS is untouched; ingest uses service role server-side and
-- filters strictly by the token's practice_id).
--
-- Replication: each practice gets its own token row + its own Power Automate
-- flow. Same endpoint, different token.
-- ============================================================================

create table if not exists public.practice_ingest_tokens (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  token_hash text not null unique,           -- sha-256 hex of the raw token
  label text check (char_length(label) <= 120),
  scope text not null default 'demand_ingest'
    check (scope in ('demand_ingest')),       -- only this scope for now
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_used_count int
);
create index if not exists practice_ingest_tokens_practice_idx
  on public.practice_ingest_tokens (practice_id);

-- RLS: only leadership of the practice can see/manage its tokens (creating a
-- token is a sensitive, access-granting action). The ingest endpoint itself
-- uses the service-role key, which bypasses RLS, so it can verify tokens
-- without a user session.
alter table public.practice_ingest_tokens enable row level security;

drop policy if exists ingest_tokens_select on public.practice_ingest_tokens;
create policy ingest_tokens_select on public.practice_ingest_tokens for select
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id));

drop policy if exists ingest_tokens_insert on public.practice_ingest_tokens;
create policy ingest_tokens_insert on public.practice_ingest_tokens for insert
  with check (public.is_platform_admin() or public.is_practice_leadership(practice_id));

drop policy if exists ingest_tokens_update on public.practice_ingest_tokens;
create policy ingest_tokens_update on public.practice_ingest_tokens for update
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id))
  with check (public.is_platform_admin() or public.is_practice_leadership(practice_id));

drop policy if exists ingest_tokens_delete on public.practice_ingest_tokens;
create policy ingest_tokens_delete on public.practice_ingest_tokens for delete
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id));

-- Ingest log: a lightweight audit of each automated import so the UI can show
-- "last import: 07:02, 412 rows" and failures are visible.
create table if not exists public.demand_ingest_log (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  token_id uuid references public.practice_ingest_tokens(id) on delete set null,
  source text,                               -- detected parser (anima/askmygp/...)
  status text not null check (status in ('ok', 'rejected', 'error')),
  rows_ingested int,
  message text check (char_length(message) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists demand_ingest_log_practice_idx
  on public.demand_ingest_log (practice_id, created_at desc);

alter table public.demand_ingest_log enable row level security;
drop policy if exists ingest_log_select on public.demand_ingest_log;
create policy ingest_log_select on public.demand_ingest_log for select
  using (public.is_platform_admin() or public.is_practice_leadership(practice_id));
