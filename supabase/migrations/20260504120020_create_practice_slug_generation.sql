-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 030: generate slug inside create_practice_with_owner
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug introduced in v4.5.44 — the new create_practice_with_owner doesn't
-- populate practices.slug, but slug is NOT NULL with a unique index
-- and a format check (lowercase a-z, 0-9, dashes; 1-50 chars; no
-- leading/trailing dash). Inserts therefore fail with
-- "null value in column 'slug' of relation 'practices' violates
-- not-null constraint".
--
-- The slug is derived from the practice name using the same transform
-- as the original migration 012 backfill:
--   lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')) trim '-'
--
-- Two extra cases the backfill didn't have to worry about:
--
--   1. Length: practice names like "The Doctors at Castle Vale Primary
--      Care Centre" produce slugs > 50 chars, which violates the format
--      check. We truncate to 50.
--
--   2. Uniqueness: the user might be creating a practice with a name
--      that's already in use (different ODS, different practice). The
--      slug needs to be unique. We try the base slug; if it's taken,
--      append -2, -3, etc. until we find a free one. Capped at -50
--      attempts to avoid pathological loops.
--
-- Pulled out into a small SQL helper (generate_unique_practice_slug)
-- so future code can reuse it (e.g. when admins rename a practice
-- and want a matching slug).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Helper: generate_unique_practice_slug ────────────────────────────
create or replace function public.generate_unique_practice_slug(source_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_slug text;
  candidate text;
  attempt int := 1;
begin
  -- Strip non-alphanumerics → dashes; lowercase; trim dashes.
  base_slug := lower(regexp_replace(source_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);

  -- Empty after stripping (e.g. name was "...") → fall back on a
  -- UUID-style placeholder. The caller can rename later.
  if base_slug is null or base_slug = '' then
    base_slug := 'practice-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  -- Truncate to 50 chars to satisfy the format check.
  base_slug := left(base_slug, 50);

  -- Trim again in case truncation left a trailing dash.
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then
    base_slug := 'practice-' || substr(gen_random_uuid()::text, 1, 8);
  end if;

  -- Try base, then base-2, base-3, ... up to base-50.
  candidate := base_slug;
  while attempt <= 50 loop
    if not exists (select 1 from public.practices where slug = candidate) then
      return candidate;
    end if;
    attempt := attempt + 1;
    -- Reserve room for the suffix so the result still fits in 50 chars.
    candidate := left(base_slug, 50 - length('-' || attempt::text)) || '-' || attempt::text;
  end loop;

  -- Pathological case: 50 practices with the same base name. Use a UUID.
  return 'practice-' || substr(gen_random_uuid()::text, 1, 8);
end;
$$;
revoke all on function public.generate_unique_practice_slug(text) from public;
grant execute on function public.generate_unique_practice_slug(text) to authenticated;


-- ─── 2. Replace create_practice_with_owner to use the helper ─────────────
create or replace function public.create_practice_with_owner(
  practice_name text,
  ods_code text default null,
  region text default null,
  postcode text default null,
  list_size integer default null,
  online_consult_tool text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_practice_id uuid;
  caller_id uuid := auth.uid();
  existing_id uuid;
  new_slug text;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if practice_name is null or trim(practice_name) = '' then
    raise exception 'Practice name is required';
  end if;

  -- Defence-in-depth duplicate check.
  if ods_code is not null and trim(ods_code) <> '' then
    select p.id into existing_id
    from public.practices p
    where upper(p.ods_code) = upper(trim(create_practice_with_owner.ods_code))
    limit 1;
    if existing_id is not null then
      raise exception 'A practice with ODS code % already exists on GPDash. Ask the practice owner to invite you.', upper(trim(create_practice_with_owner.ods_code))
        using errcode = '23505';
    end if;
  end if;

  -- Generate a unique slug from the name.
  new_slug := public.generate_unique_practice_slug(practice_name);

  insert into public.practices (
    name, slug, ods_code, region, postcode, list_size, online_consult_tool,
    setup_completed_at
  )
  values (
    trim(practice_name),
    new_slug,
    nullif(trim(create_practice_with_owner.ods_code), ''),
    nullif(trim(create_practice_with_owner.region), ''),
    nullif(trim(create_practice_with_owner.postcode), ''),
    create_practice_with_owner.list_size,
    nullif(trim(create_practice_with_owner.online_consult_tool), ''),
    case
      when create_practice_with_owner.ods_code is not null
       and create_practice_with_owner.postcode is not null
       and create_practice_with_owner.list_size is not null
        then now()
      else null
    end
  )
  returning id into new_practice_id;

  insert into public.practice_users (practice_id, user_id, role)
  values (new_practice_id, caller_id, 'owner');

  return new_practice_id;
end;
$$;
