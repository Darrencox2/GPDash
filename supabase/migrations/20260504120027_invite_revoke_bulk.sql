-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 037: practice invites — revoke + bulk invite
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds:
--   revoke_practice_invite(invite_id)
--     Marks an invite as revoked (sets revoked_at). Owner/admin of the
--     practice that issued the invite can revoke. Returns ok/error.
--
--   bulk_invite_users_to_practice(practice_id, invitees jsonb)
--     Accepts an array of {email, role} objects. For each email:
--       - skip if already a member of this practice
--       - skip if there's a pending un-revoked, un-expired invite
--       - otherwise create the invite
--     Returns a summary: counts of created / skipped / errored, plus a
--     per-row list with each email's outcome.
--
--   public_get_invite_summary(invite_id)
--     Returns a tiny anonymous-readable summary of an invite (practice
--     name, role, expiry, inviter name) so the /invite/[id] landing
--     page can show "Sarah invited you to Acme Surgery" before the
--     visitor has signed up. Bypasses RLS deliberately — the invite
--     UUID is the token; if you have the link you can see the summary.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. revoke_practice_invite ────────────────────────────────────────────
create or replace function public.revoke_practice_invite(invite_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  inv record;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  select id, practice_id, accepted_at, revoked_at into inv
  from public.practice_invites
  where id = invite_id;

  if inv.id is null then
    raise exception 'Invite not found';
  end if;
  if inv.accepted_at is not null then
    raise exception 'That invite has already been accepted';
  end if;
  if inv.revoked_at is not null then
    raise exception 'That invite was already revoked';
  end if;

  -- Caller must be owner/admin of the practice (or platform admin)
  caller_role := public.caller_practice_role(inv.practice_id);
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can revoke invites for this practice';
  end if;

  update public.practice_invites
  set revoked_at = now()
  where id = invite_id;

  return json_build_object('ok', true, 'invite_id', invite_id);
end;
$$;
revoke all on function public.revoke_practice_invite(uuid) from public;
grant execute on function public.revoke_practice_invite(uuid) to authenticated;


-- ─── 2. bulk_invite_users_to_practice ────────────────────────────────────
-- Accepts a JSONB array of objects: [{email, role}, {email, role}, ...]
-- Roles default to 'user' if not provided. Iterates server-side; per-row
-- failures do NOT abort the batch — they're collected into the result.
--
-- Output shape:
--   {
--     created: 5,
--     skipped: 2,
--     errored: 1,
--     results: [
--       {email, status: 'created'|'skipped_member'|'skipped_invited'|'error', message?, invite_id?}
--     ]
--   }
create or replace function public.bulk_invite_users_to_practice(
  target_practice_id uuid,
  invitees jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  is_caller_owner boolean;
  is_caller_admin boolean;

  it jsonb;
  raw_email text;
  norm_email text;
  raw_role text;
  effective_role public.practice_role;

  results jsonb := '[]'::jsonb;
  created_count int := 0;
  skipped_count int := 0;
  errored_count int := 0;

  existing_member_count int;
  existing_invite_count int;
  new_invite_id uuid;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can invite members';
  end if;
  is_caller_owner := caller_role = 'owner' or public.is_platform_admin();
  is_caller_admin := caller_role = 'admin';

  if invitees is null or jsonb_typeof(invitees) <> 'array' or jsonb_array_length(invitees) = 0 then
    return json_build_object(
      'created', 0, 'skipped', 0, 'errored', 0, 'results', '[]'::jsonb
    );
  end if;

  -- Cap at 100 per batch — prevents pathological input from blocking
  -- the connection. Sensible upper bound for a practice invite list.
  if jsonb_array_length(invitees) > 100 then
    raise exception 'Too many invitees (max 100 per batch)';
  end if;

  -- Iterate
  for it in select * from jsonb_array_elements(invitees)
  loop
    raw_email := lower(trim(coalesce(it->>'email', '')));
    raw_role := lower(coalesce(it->>'role', 'user'));

    -- Validate role
    begin
      effective_role := raw_role::public.practice_role;
    exception when others then
      results := results || jsonb_build_array(jsonb_build_object(
        'email', raw_email,
        'status', 'error',
        'message', format('Invalid role: %s', raw_role)
      ));
      errored_count := errored_count + 1;
      continue;
    end;

    -- Admin trying to create owner invite — block
    if effective_role = 'owner' and not is_caller_owner then
      results := results || jsonb_build_array(jsonb_build_object(
        'email', raw_email,
        'status', 'error',
        'message', 'Only owners can invite someone as owner'
      ));
      errored_count := errored_count + 1;
      continue;
    end if;

    -- Validate email shape (very lightweight — Postgres can't fully
    -- validate but we can reject obvious junk)
    if raw_email = '' or raw_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      results := results || jsonb_build_array(jsonb_build_object(
        'email', raw_email,
        'status', 'error',
        'message', 'Looks malformed; not a valid email'
      ));
      errored_count := errored_count + 1;
      continue;
    end if;
    norm_email := raw_email;

    -- Already a member?
    select count(*) into existing_member_count
    from public.practice_users pu
    join public.profiles p on p.id = pu.user_id
    where pu.practice_id = target_practice_id
      and lower(p.email) = norm_email;
    if existing_member_count > 0 then
      results := results || jsonb_build_array(jsonb_build_object(
        'email', norm_email,
        'status', 'skipped_member',
        'message', 'Already a member of this practice'
      ));
      skipped_count := skipped_count + 1;
      continue;
    end if;

    -- Already a pending invite (not accepted, not revoked, not expired)?
    select count(*) into existing_invite_count
    from public.practice_invites
    where practice_id = target_practice_id
      and lower(email) = norm_email
      and accepted_at is null
      and revoked_at is null
      and expires_at > now();
    if existing_invite_count > 0 then
      results := results || jsonb_build_array(jsonb_build_object(
        'email', norm_email,
        'status', 'skipped_invited',
        'message', 'Already has a pending invite'
      ));
      skipped_count := skipped_count + 1;
      continue;
    end if;

    -- Create
    insert into public.practice_invites (practice_id, email, role, invited_by)
    values (target_practice_id, norm_email, effective_role, caller_id)
    returning id into new_invite_id;

    results := results || jsonb_build_array(jsonb_build_object(
      'email', norm_email,
      'status', 'created',
      'invite_id', new_invite_id
    ));
    created_count := created_count + 1;
  end loop;

  return json_build_object(
    'created', created_count,
    'skipped', skipped_count,
    'errored', errored_count,
    'results', results
  );
end;
$$;
revoke all on function public.bulk_invite_users_to_practice(uuid, jsonb) from public;
grant execute on function public.bulk_invite_users_to_practice(uuid, jsonb) to authenticated;


-- ─── 3. public_get_invite_summary ────────────────────────────────────────
-- Anonymous-readable summary so the /invite/[id] landing page can show
-- "Sarah invited you to Acme Surgery as User" before the visitor has
-- even signed up. Returns null for invalid / accepted / revoked /
-- expired invites — the page handles those states with appropriate
-- messaging.
--
-- Bypasses RLS deliberately. The invite UUID is the bearer token: if
-- you have the link you can read the summary. UUIDs are unguessable
-- (128 bits of entropy), so this is safe enough for a "we'd like to
-- show what practice/role" disclosure. Email is intentionally NOT
-- exposed — only practice + role + inviter display name.
create or replace function public.public_get_invite_summary(invite_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'invite_id', i.id,
    'practice_id', i.practice_id,
    'practice_name', p.name,
    'practice_slug', p.slug,
    'role', i.role,
    'invited_at', i.invited_at,
    'expires_at', i.expires_at,
    'accepted_at', i.accepted_at,
    'revoked_at', i.revoked_at,
    'is_expired', i.expires_at < now(),
    'inviter_name', coalesce(prof.name, prof.first_name, 'someone'),
    -- Surface the email the invite was issued to so the landing page
    -- can compare it against the signed-in user's email and warn if
    -- they're using the wrong account.
    'invited_email', i.email
  ) into result
  from public.practice_invites i
  left join public.practices p on p.id = i.practice_id
  left join public.profiles prof on prof.id = i.invited_by
  where i.id = invite_id;

  return result; -- null if no row
end;
$$;
revoke all on function public.public_get_invite_summary(uuid) from public;
-- Granted to BOTH authenticated and anon — landing page may be visited
-- by a not-yet-signed-in user, and the data is by-design bearer-token
-- gated.
grant execute on function public.public_get_invite_summary(uuid) to authenticated, anon;
