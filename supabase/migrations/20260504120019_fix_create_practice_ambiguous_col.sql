-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 029: fix ambiguous column reference in create_practice_with_owner
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug introduced in migration 027 (practice_creation_v2):
--
--   if ods_code is not null and trim(ods_code) <> '' then
--     select id into existing_id
--     from public.practices
--     where upper(ods_code) = upper(trim(create_practice_with_owner.ods_code))
--           ^^^^^^^^^^^^^^^
--   The left side here matches BOTH:
--     - the function parameter ods_code
--     - public.practices.ods_code (the column)
--   Postgres throws "column reference 'ods_code' is ambiguous" at call time.
--
-- The right side was already qualified (create_practice_with_owner.ods_code)
-- but the left wasn't. Function-body ambiguities aren't caught at CREATE
-- time, only at runtime — so migration 027 applied silently and only
-- failed when an actual create-practice call hit the duplicate check.
--
-- Fix: qualify the left side too. Parameter name kept as ods_code so
-- existing JS callers using named arguments don't break.
-- ═══════════════════════════════════════════════════════════════════════════

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
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if practice_name is null or trim(practice_name) = '' then
    raise exception 'Practice name is required';
  end if;

  -- Defence-in-depth duplicate check. Both column and parameter are now
  -- qualified to avoid the ambiguous-reference error.
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

  insert into public.practices (
    name, ods_code, region, postcode, list_size, online_consult_tool,
    setup_completed_at
  )
  values (
    trim(practice_name),
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
