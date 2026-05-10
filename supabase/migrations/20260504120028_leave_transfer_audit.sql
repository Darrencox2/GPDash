-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 038: leave practice + transfer ownership + membership audit
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds:
--   leave_practice(practice_id)
--     Self-departure. Refuses if caller is the last owner — they must
--     transfer ownership first. Distinct from remove_practice_member
--     (which is "remove someone else"). Two narrow RPCs > one with
--     branching, easier to reason about permissions.
--
--   transfer_practice_ownership(practice_id, new_owner_user_id)
--     Owner promotes another member to owner and demotes themselves to
--     admin atomically. Lets practices change hands without going
--     through a platform admin.
--
--   list_practice_membership_changes(practice_id, limit)
--     Recent audit events filtered to membership-related types,
--     joined with the actor profile so the UI can render
--     "Sarah Smith promoted Tom" rather than raw rows.
--
-- Also wires log_audit_event() emission into the membership-mutating
-- RPCs that previously had no audit trail:
--   set_practice_member_role (migration 036) → user_role_changed
--   remove_practice_member   (migration 036) → user_removed
--   revoke_practice_invite   (migration 037) → invite_revoked
--   bulk_invite_users        (migration 037) → user_invited (per row)
--   leave_practice           (this migration) → user_removed
--   transfer_practice_ownership (this migration) → user_role_changed (twice)
--
-- Audit-event enum values (exact strings from migration 011):
--   user_invited, invite_accepted, invite_revoked,
--   user_role_changed, user_removed
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. leave_practice ───────────────────────────────────────────────────
create or replace function public.leave_practice(target_practice_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  remaining_owners int;
  caller_email text;
begin
  if caller_id is null then raise exception 'Not authenticated'; end if;

  select role into caller_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = caller_id;
  if caller_role is null then raise exception 'You are not a member of this practice'; end if;

  if caller_role = 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id and role = 'owner' and user_id <> caller_id;
    if remaining_owners = 0 then
      raise exception 'You are the last owner. Transfer ownership to someone else first, then you can leave.';
    end if;
  end if;

  select email into caller_email from auth.users where id = caller_id;

  delete from public.practice_users
  where practice_id = target_practice_id and user_id = caller_id;

  perform public.log_audit_event(
    target_practice_id,
    'user_removed'::public.audit_event_type,
    format('%s left the practice', coalesce(caller_email, 'A member')),
    jsonb_build_object('self_initiated', true, 'former_role', caller_role)
  );

  return json_build_object('ok', true, 'practice_id', target_practice_id);
end;
$$;
revoke all on function public.leave_practice(uuid) from public;
grant execute on function public.leave_practice(uuid) to authenticated;


-- ─── 2. transfer_practice_ownership ──────────────────────────────────────
create or replace function public.transfer_practice_ownership(
  target_practice_id uuid,
  new_owner_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  target_role public.practice_role;
  caller_email text;
  target_email text;
begin
  if caller_id is null then raise exception 'Not authenticated'; end if;
  if new_owner_user_id = caller_id then
    raise exception 'Pick a different member to transfer ownership to';
  end if;

  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role <> 'owner' and not public.is_platform_admin() then
    raise exception 'Only an owner can transfer ownership';
  end if;

  select role into target_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = new_owner_user_id;
  if target_role is null then
    raise exception 'That user is not a member of this practice. Add them first, then transfer ownership.';
  end if;

  update public.practice_users
  set role = 'owner'
  where practice_id = target_practice_id and user_id = new_owner_user_id;

  if caller_role = 'owner' then
    update public.practice_users
    set role = 'admin'
    where practice_id = target_practice_id and user_id = caller_id;
  end if;

  select email into caller_email from auth.users where id = caller_id;
  select email into target_email from auth.users where id = new_owner_user_id;

  perform public.log_audit_event(
    target_practice_id,
    'user_role_changed'::public.audit_event_type,
    format('Promoted %s from %s to owner', coalesce(target_email, 'member'), target_role),
    jsonb_build_object('user_id', new_owner_user_id, 'from_role', target_role, 'to_role', 'owner', 'transfer', true)
  );
  if caller_role = 'owner' then
    perform public.log_audit_event(
      target_practice_id,
      'user_role_changed'::public.audit_event_type,
      format('Stepped down from owner to admin in favour of %s', coalesce(target_email, 'member')),
      jsonb_build_object('user_id', caller_id, 'from_role', 'owner', 'to_role', 'admin', 'transfer', true)
    );
  end if;

  return json_build_object(
    'ok', true,
    'practice_id', target_practice_id,
    'new_owner_user_id', new_owner_user_id,
    'demoted_caller', caller_role = 'owner'
  );
end;
$$;
revoke all on function public.transfer_practice_ownership(uuid, uuid) from public;
grant execute on function public.transfer_practice_ownership(uuid, uuid) to authenticated;


-- ─── 3. list_practice_membership_changes ─────────────────────────────────
create or replace function public.list_practice_membership_changes(
  target_practice_id uuid,
  limit_count int default 50
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_role public.practice_role;
  result json;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;

  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role is null and not public.is_platform_admin() then
    raise exception 'You are not a member of this practice';
  end if;

  if limit_count is null or limit_count < 1 then limit_count := 50; end if;
  if limit_count > 200 then limit_count := 200; end if;

  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into result
  from (
    select
      ae.id,
      ae.occurred_at,
      ae.event_type::text as event_type,
      ae.description,
      ae.details,
      ae.user_id as actor_id,
      coalesce(actor_pr.name, 'someone') as actor_name
    from public.audit_events ae
    left join public.profiles actor_pr on actor_pr.id = ae.user_id
    where ae.practice_id = target_practice_id
      and ae.event_type in (
        'user_invited',
        'invite_accepted',
        'invite_revoked',
        'user_role_changed',
        'user_removed'
      )
    order by ae.occurred_at desc
    limit limit_count
  ) t;

  return result;
end;
$$;
revoke all on function public.list_practice_membership_changes(uuid, int) from public;
grant execute on function public.list_practice_membership_changes(uuid, int) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- Audit emission for migrations 036 and 037
-- ═══════════════════════════════════════════════════════════════════════════
-- Body-only updates (signatures unchanged) so CREATE OR REPLACE works.


-- ─── 4. set_practice_member_role + audit ─────────────────────────────────
create or replace function public.set_practice_member_role(
  target_practice_id uuid,
  target_user_id uuid,
  new_role public.practice_role
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  target_role public.practice_role;
  remaining_owners int;
  target_email text;
begin
  if caller_id is null then raise exception 'Not authenticated'; end if;

  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role is null and not public.is_platform_admin() then
    raise exception 'You are not a member of this practice';
  end if;

  select role into target_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;
  if target_role is null then raise exception 'That user is not a member of this practice'; end if;

  if target_user_id = caller_id then
    raise exception 'Cannot change your own role. Owners can transfer ownership; admins/users can leave the practice.';
  end if;
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can change member roles';
  end if;
  if caller_role = 'admin' and not public.is_platform_admin() then
    if target_role = 'owner' then raise exception 'Admins cannot change the role of an owner'; end if;
    if new_role = 'owner' then raise exception 'Only owners can promote someone to owner'; end if;
  end if;
  if target_role = 'owner' and new_role <> 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id and role = 'owner' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot demote the last owner. Promote someone else to owner first, or use transfer ownership.';
    end if;
  end if;

  -- No-op if role isn't actually changing — don't pollute the audit log.
  if target_role = new_role then
    return json_build_object('ok', true, 'practice_id', target_practice_id, 'user_id', target_user_id, 'role', new_role, 'unchanged', true);
  end if;

  update public.practice_users
  set role = new_role
  where practice_id = target_practice_id and user_id = target_user_id;

  select email into target_email from auth.users where id = target_user_id;
  perform public.log_audit_event(
    target_practice_id,
    'user_role_changed'::public.audit_event_type,
    format('Changed %s from %s to %s', coalesce(target_email, 'member'), target_role, new_role),
    jsonb_build_object('user_id', target_user_id, 'from_role', target_role, 'to_role', new_role)
  );

  return json_build_object(
    'ok', true,
    'practice_id', target_practice_id,
    'user_id', target_user_id,
    'role', new_role
  );
end;
$$;


-- ─── 5. remove_practice_member + audit ───────────────────────────────────
create or replace function public.remove_practice_member(
  target_practice_id uuid,
  target_user_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
  target_role public.practice_role;
  remaining_owners int;
  target_email text;
begin
  if caller_id is null then raise exception 'Not authenticated'; end if;

  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role is null and not public.is_platform_admin() then
    raise exception 'You are not a member of this practice';
  end if;

  select role into target_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;
  if target_role is null then raise exception 'That user is not a member of this practice'; end if;
  if target_user_id = caller_id then raise exception 'Cannot remove yourself. Use "Leave practice" instead.'; end if;
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can remove members';
  end if;
  if caller_role = 'admin' and target_role = 'owner' and not public.is_platform_admin() then
    raise exception 'Admins cannot remove an owner';
  end if;
  if target_role = 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id and role = 'owner' and user_id <> target_user_id;
    if remaining_owners = 0 then raise exception 'Cannot remove the last owner'; end if;
  end if;

  select email into target_email from auth.users where id = target_user_id;

  delete from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;

  perform public.log_audit_event(
    target_practice_id,
    'user_removed'::public.audit_event_type,
    format('Removed %s from the practice', coalesce(target_email, 'member')),
    jsonb_build_object('user_id', target_user_id, 'former_role', target_role)
  );

  return json_build_object('ok', true, 'practice_id', target_practice_id, 'user_id', target_user_id);
end;
$$;


-- ─── 6. revoke_practice_invite + audit ───────────────────────────────────
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
  if caller_id is null then raise exception 'Not authenticated'; end if;

  select id, practice_id, email, accepted_at, revoked_at into inv
  from public.practice_invites where id = invite_id;
  if inv.id is null then raise exception 'Invite not found'; end if;
  if inv.accepted_at is not null then raise exception 'That invite has already been accepted'; end if;
  if inv.revoked_at is not null then raise exception 'That invite was already revoked'; end if;

  caller_role := public.caller_practice_role(inv.practice_id);
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can revoke invites for this practice';
  end if;

  update public.practice_invites set revoked_at = now() where id = invite_id;

  perform public.log_audit_event(
    inv.practice_id,
    'invite_revoked'::public.audit_event_type,
    format('Revoked invite for %s', inv.email),
    jsonb_build_object('invite_id', invite_id, 'email', inv.email)
  );

  return json_build_object('ok', true, 'invite_id', invite_id);
end;
$$;


-- ─── 7. bulk_invite_users_to_practice + audit (per row) ─────────────────
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
  if caller_id is null then raise exception 'Not authenticated'; end if;
  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners and admins can invite members';
  end if;
  is_caller_owner := caller_role = 'owner' or public.is_platform_admin();

  if invitees is null or jsonb_typeof(invitees) <> 'array' or jsonb_array_length(invitees) = 0 then
    return json_build_object('created', 0, 'skipped', 0, 'errored', 0, 'results', '[]'::jsonb);
  end if;
  if jsonb_array_length(invitees) > 100 then raise exception 'Too many invitees (max 100 per batch)'; end if;

  for it in select * from jsonb_array_elements(invitees) loop
    raw_email := lower(trim(coalesce(it->>'email', '')));
    raw_role := lower(coalesce(it->>'role', 'user'));
    begin
      effective_role := raw_role::public.practice_role;
    exception when others then
      results := results || jsonb_build_array(jsonb_build_object('email', raw_email, 'status', 'error', 'message', format('Invalid role: %s', raw_role)));
      errored_count := errored_count + 1;
      continue;
    end;
    if effective_role = 'owner' and not is_caller_owner then
      results := results || jsonb_build_array(jsonb_build_object('email', raw_email, 'status', 'error', 'message', 'Only owners can invite someone as owner'));
      errored_count := errored_count + 1;
      continue;
    end if;
    if raw_email = '' or raw_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      results := results || jsonb_build_array(jsonb_build_object('email', raw_email, 'status', 'error', 'message', 'Looks malformed; not a valid email'));
      errored_count := errored_count + 1;
      continue;
    end if;
    norm_email := raw_email;

    select count(*) into existing_member_count
    from public.practice_users pu
    join public.profiles p on p.id = pu.user_id
    where pu.practice_id = target_practice_id and lower(p.email) = norm_email;
    if existing_member_count > 0 then
      results := results || jsonb_build_array(jsonb_build_object('email', norm_email, 'status', 'skipped_member', 'message', 'Already a member of this practice'));
      skipped_count := skipped_count + 1;
      continue;
    end if;

    select count(*) into existing_invite_count
    from public.practice_invites
    where practice_id = target_practice_id and lower(email) = norm_email
      and accepted_at is null and revoked_at is null and expires_at > now();
    if existing_invite_count > 0 then
      results := results || jsonb_build_array(jsonb_build_object('email', norm_email, 'status', 'skipped_invited', 'message', 'Already has a pending invite'));
      skipped_count := skipped_count + 1;
      continue;
    end if;

    insert into public.practice_invites (practice_id, email, role, invited_by)
    values (target_practice_id, norm_email, effective_role, caller_id)
    returning id into new_invite_id;

    perform public.log_audit_event(
      target_practice_id,
      'user_invited'::public.audit_event_type,
      format('Invited %s as %s (bulk)', norm_email, effective_role),
      jsonb_build_object('invite_id', new_invite_id, 'email', norm_email, 'role', effective_role, 'bulk', true)
    );

    results := results || jsonb_build_array(jsonb_build_object('email', norm_email, 'status', 'created', 'invite_id', new_invite_id));
    created_count := created_count + 1;
  end loop;

  return json_build_object('created', created_count, 'skipped', skipped_count, 'errored', errored_count, 'results', results);
end;
$$;
