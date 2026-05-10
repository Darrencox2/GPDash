-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 026: split profile name into first_name + last_name
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The profiles.name column is kept (canonical "what to display") but two
-- new columns are added so the parts can be used independently:
--
--   first_name text — the user's given/forename
--   last_name  text — the user's surname/family name
--
-- Why: the upcoming "is this you?" auto-suggest needs to match the
-- signed-in user's surname against clinician records (which are stored
-- as "Smith, Jane" or "Jane Smith"). Parsing names out of a single
-- text field at match-time is fragile when there are titles ("Dr"),
-- middle names, hyphenations, suffixes, etc.
--
-- Existing users are backfilled by splitting `name` on the first space —
-- works for "Jane Smith", produces "Jane" + "Smith". For "Dr Jane Smith"
-- it produces "Dr" + "Jane Smith" which isn't ideal, but users can fix
-- their own profile in the Account page. We deliberately don't try to
-- be clever about title detection — the right place to ask for the
-- correct values is the signup form, going forward.
--
-- The handle_new_user trigger is updated to read first_name + last_name
-- from auth metadata at signup. The legacy name field continues to be
-- populated as "first_name last_name" so all existing UI keeps working.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Add the columns ──────────────────────────────────────────────────
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;


-- ─── 2. Backfill from existing name field ────────────────────────────────
-- Split on the FIRST space:
--   "Jane Smith"        → first="Jane", last="Smith"
--   "Jane van Smith"    → first="Jane", last="van Smith"  (correct)
--   "Smith"             → first=null,   last="Smith"      (mononym fallback)
--   "Dr Jane Smith"     → first="Dr",   last="Jane Smith" (wrong — user can edit)
--
-- Only update rows that don't already have first_name set, so re-running
-- the migration is idempotent and doesn't clobber values someone has
-- already corrected manually.
update public.profiles
set
  first_name = case
    when position(' ' in name) > 0
      then substring(name from 1 for position(' ' in name) - 1)
    else null
  end,
  last_name = case
    when position(' ' in name) > 0
      then substring(name from position(' ' in name) + 1)
    else name
  end
where first_name is null
  and last_name is null
  and name is not null
  and name <> '';


-- ─── 3. Update the new-user trigger ──────────────────────────────────────
-- Reads first_name + last_name out of auth metadata (Supabase stores
-- whatever we pass in `options.data` at sign-up). Falls back to the
-- legacy single-name path so existing client code that's still passing
-- `data: { name }` doesn't break in mid-deploy.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_first text := new.raw_user_meta_data->>'first_name';
  meta_last  text := new.raw_user_meta_data->>'last_name';
  meta_name  text := new.raw_user_meta_data->>'name';
  computed_name text;
begin
  -- Resolve display name:
  --   If we got first_name + last_name, build "first last"
  --   Else if we got a legacy single name, use that
  --   Else fall back to email
  if meta_first is not null or meta_last is not null then
    computed_name := trim(coalesce(meta_first, '') || ' ' || coalesce(meta_last, ''));
  elsif meta_name is not null and length(meta_name) > 0 then
    computed_name := meta_name;
  else
    computed_name := new.email;
  end if;

  insert into public.profiles (id, email, name, first_name, last_name)
  values (
    new.id,
    new.email,
    computed_name,
    meta_first,
    meta_last
  );
  return new;
end;
$$;


-- ─── 4. Update admin RPCs to return the new fields ───────────────────────
-- admin_get_user — surface first_name + last_name so the admin profile
-- editor can edit them separately.
create or replace function public.admin_get_user(target_user_id uuid)
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

  select json_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at,
    'name', pr.name,
    'first_name', pr.first_name,
    'last_name', pr.last_name,
    'is_platform_admin', coalesce(pr.is_platform_admin, false),
    'memberships', coalesce((
      select json_agg(json_build_object(
        'practice_id', pu.practice_id,
        'practice_name', p.name,
        'practice_slug', p.slug,
        'role', pu.role,
        'joined_at', pu.joined_at
      ))
      from public.practice_users pu
      join public.practices p on p.id = pu.practice_id
      where pu.user_id = u.id
    ), '[]'::json)
  )
  into result
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  where u.id = target_user_id;

  if result is null then
    raise exception 'User not found';
  end if;
  return result;
end;
$$;


-- admin_update_user_profile — accept first_name + last_name as separate
-- fields. Both nullable; passing null leaves the existing value in place.
-- The combined `name` field is recomputed from the parts whenever either
-- is updated, so all downstream display code stays consistent.
create or replace function public.admin_update_user_profile(
  target_user_id uuid,
  new_name text default null,
  new_is_platform_admin boolean default null,
  new_first_name text default null,
  new_last_name text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  current_admin boolean;
  current_first text;
  current_last text;
  remaining_admins int;
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  select is_platform_admin, first_name, last_name
  into current_admin, current_first, current_last
  from public.profiles where id = target_user_id;

  if current_admin is null then
    raise exception 'Profile not found';
  end if;

  -- Lockout protection: if demoting from admin, ensure others remain.
  if new_is_platform_admin = false and current_admin = true then
    select count(*) into remaining_admins
    from public.profiles
    where is_platform_admin = true and id <> target_user_id;
    if remaining_admins = 0 then
      raise exception 'Refusing to demote the last platform admin';
    end if;
  end if;

  update public.profiles
  set
    first_name = coalesce(new_first_name, first_name),
    last_name = coalesce(new_last_name, last_name),
    is_platform_admin = coalesce(new_is_platform_admin, is_platform_admin),
    -- name: if the caller supplied a new name explicitly, use it.
    -- Otherwise rebuild it from first+last (using the new values if
    -- provided, falling back to the existing values).
    name = case
      when new_name is not null then new_name
      else trim(coalesce(coalesce(new_first_name, first_name), '') || ' '
             || coalesce(coalesce(new_last_name, last_name), ''))
    end
  where id = target_user_id;

  -- Re-read so we return what's actually in the DB
  select json_build_object(
    'id', id,
    'name', name,
    'first_name', first_name,
    'last_name', last_name,
    'is_platform_admin', is_platform_admin
  ) into result
  from public.profiles where id = target_user_id;

  return result;
end;
$$;
revoke all on function public.admin_update_user_profile(uuid, text, boolean, text, text) from public;
grant execute on function public.admin_update_user_profile(uuid, text, boolean, text, text) to authenticated;
