-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 042: create_practice_with_owner never auto-marks setup complete
-- ═══════════════════════════════════════════════════════════════════════════
--
-- BUG: v4.7.0 introduced a guided setup wizard at /v4/onboarding/setup/[id]
-- as the new entry point after creating a practice. The wizard's server
-- component checks setup_completed_at — if it's set, it redirects straight
-- to /p/<slug> on the assumption that there's nothing left to do.
--
-- But the existing create_practice_with_owner RPC has an inherited
-- shortcut from before the wizard existed: if ODS code + postcode + list
-- size are all provided at create time (which they are, because we look
-- them up automatically from the NHS practice picker), it auto-marks
-- setup_completed_at = now() in the same INSERT.
--
-- Result: every new practice landed in the wizard, the wizard immediately
-- redirected to /p/<slug>, and the user got their first dashboard
-- experience as an empty Today page with no clinicians, no demand data,
-- no TeamNet — exactly what the wizard was designed to prevent.
--
-- Fix: the RPC no longer auto-marks setup_completed_at, ever. The
-- wizard is now the single source of truth for "setup is complete" — the
-- user explicitly clicks "Complete setup" on the final step, which sets
-- the timestamp. Nothing else does.
--
-- We keep the column in the INSERT (as null) rather than dropping it from
-- the column list because that would be a more invasive change and the
-- column has a NULL default anyway. Explicit null is clearer to read.
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
  new_slug text;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if practice_name is null or trim(practice_name) = '' then
    raise exception 'Practice name is required';
  end if;

  -- Defence-in-depth duplicate check (same as before — unchanged).
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
    -- ALWAYS null. The wizard is the only thing that sets this column.
    -- Previously this was a CASE expression that auto-marked complete
    -- when ODS + postcode + list_size were all provided, but with the
    -- wizard as the new flow, every new practice must go through it.
    null
  )
  returning id into new_practice_id;

  insert into public.practice_users (practice_id, user_id, role)
  values (new_practice_id, caller_id, 'owner');

  return new_practice_id;
end;
$$;
