-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 031: check_slug_available RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Live "is this slug free?" check for the SlugEditor on the Details tab.
-- The DB enforces uniqueness via the practices_slug_idx index, so attempting
-- to save a duplicate slug fails with error 23505 — the editor handles
-- that. But it's a worse UX than telling the user "already taken" before
-- they click Save.
--
-- A direct SELECT against practices is no good because RLS hides
-- practices the caller isn't a member of, so a query for "is 'foo'
-- taken?" returns false even when some other practice you're not in
-- has that slug. A security-definer RPC bypasses that.
--
-- The exclude argument lets the editor pass the practice's own ID so
-- "save without changing the slug" reports the slug as available.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_slug_available(
  candidate_slug text,
  exclude_practice_id uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  in_use_by uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if candidate_slug is null or trim(candidate_slug) = '' then
    return json_build_object('available', false, 'reason', 'empty');
  end if;

  -- DB column is case-sensitive but the format check enforces lowercase.
  -- Compare in lowercase to be defensive against UI bugs that send mixed
  -- case (the editor normalises but a future caller might not).
  select id into in_use_by
  from public.practices
  where lower(slug) = lower(trim(candidate_slug))
    and (exclude_practice_id is null or id <> exclude_practice_id)
  limit 1;

  if in_use_by is null then
    return json_build_object('available', true);
  end if;
  return json_build_object('available', false, 'reason', 'taken');
end;
$$;
revoke all on function public.check_slug_available(text, uuid) from public;
grant execute on function public.check_slug_available(text, uuid) to authenticated;
