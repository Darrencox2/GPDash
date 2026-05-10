-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 027: practice creation — duplicate detection + richer fields
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two changes to support the new "what's your practice?" onboarding flow:
--
-- 1. check_practice_exists_by_ods(text) — lets the onboarding form check
--    "is this practice already on GPDash?" before the user fills in
--    anything else. Returns a tiny payload: { exists, practice_name }.
--    Bypasses RLS deliberately (security definer) — we WANT the user to
--    know that "Smith Surgery" is taken even when they're not a member,
--    so we can show "Contact your practice owner" instead of letting
--    them try to create a duplicate.
--
--    The function returns the existing practice's NAME but not its slug
--    or any other detail — minimum information for "yes, it exists".
--
-- 2. create_practice_with_owner — extended signature that accepts the
--    fields auto-filled from nhs_oc_baseline (postcode, list_size,
--    region, online_consult_tool) and refuses to create a duplicate
--    by ODS code. Defence-in-depth: even if the UI's check_exists
--    pass succeeded, the create RPC enforces the constraint.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. check_practice_exists_by_ods ─────────────────────────────────────
create or replace function public.check_practice_exists_by_ods(ods text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if ods is null or trim(ods) = '' then
    return json_build_object('exists', false);
  end if;

  -- Case-insensitive ODS match. Most ODS codes are uppercase but data
  -- entered manually might not be — be forgiving here.
  select id, name into found
  from public.practices
  where upper(ods_code) = upper(trim(ods))
  limit 1;

  if found.id is null then
    return json_build_object('exists', false);
  end if;

  return json_build_object(
    'exists', true,
    'practice_name', found.name
  );
end;
$$;
revoke all on function public.check_practice_exists_by_ods(text) from public;
grant execute on function public.check_practice_exists_by_ods(text) to authenticated;


-- ─── 2. create_practice_with_owner — richer signature ────────────────────
-- Drop the old narrow version explicitly (Postgres can keep it alongside
-- the new one if defaults differ, which would be confusing). Then create
-- the new one.
drop function if exists public.create_practice_with_owner(text, text, text);

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

  -- Defence-in-depth duplicate check. The UI is expected to call
  -- check_practice_exists_by_ods first and steer the user away from
  -- creating a duplicate, but enforcing it here means we can't be
  -- bypassed by a direct RPC call.
  if ods_code is not null and trim(ods_code) <> '' then
    select id into existing_id
    from public.practices
    where upper(ods_code) = upper(trim(create_practice_with_owner.ods_code))
    limit 1;
    if existing_id is not null then
      raise exception 'A practice with ODS code % already exists on GPDash. Ask the practice owner to invite you.', upper(trim(ods_code))
        using errcode = '23505'; -- unique_violation, useful for clients to detect
    end if;
  end if;

  -- Insert the practice with everything we know about it.
  insert into public.practices (
    name, ods_code, region, postcode, list_size, online_consult_tool,
    -- If we got auto-filled NHS data (ODS + postcode + list size),
    -- we can mark setup as effectively complete from the start. The
    -- user can still go to the setup wizard to fine-tune later.
    setup_completed_at
  )
  values (
    trim(practice_name),
    nullif(trim(ods_code), ''),
    nullif(trim(region), ''),
    nullif(trim(postcode), ''),
    list_size,
    nullif(trim(online_consult_tool), ''),
    case
      when ods_code is not null and postcode is not null and list_size is not null
        then now()
      else null
    end
  )
  returning id into new_practice_id;

  -- Add the caller as owner.
  insert into public.practice_users (practice_id, user_id, role)
  values (new_practice_id, caller_id, 'owner');

  return new_practice_id;
end;
$$;
revoke all on function public.create_practice_with_owner(text, text, text, text, integer, text) from public;
grant execute on function public.create_practice_with_owner(text, text, text, text, integer, text) to authenticated;
