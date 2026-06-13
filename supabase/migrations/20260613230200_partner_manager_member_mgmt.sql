-- ============================================================================
-- Member-management functions + standalone policies: include senior roles
-- ============================================================================
-- Widens the "who can manage members / invites / practice" checks from
-- ('owner','admin') to include the new leadership roles, AND adds the
-- confidentiality guard: an operational 'admin' (e.g. reception manager)
-- must NOT be able to modify, remove, promote into, or invite the
-- confidential leadership tier (owner / partner / practice_manager).
--
-- Recreates the LATEST definition of each affected function (old migration
-- files are already applied and must not be edited). Bodies are faithful
-- copies of the latest versions; only the role logic is changed.
--
-- Tier definitions used below:
--   management tier  = owner, partner, practice_manager, admin  (can manage)
--   leadership tier  = owner, partner, practice_manager         (confidential;
--                      admins cannot touch or create these)
-- ============================================================================

-- ─── set_practice_member_role ────────────────────────────────────────────
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
    raise exception 'Cannot change your own role. Owners can transfer ownership; others can leave the practice.';
  end if;
  if caller_role not in ('owner', 'partner', 'practice_manager', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners, partners, practice managers and admins can change member roles';
  end if;
  -- Operational admins cannot touch the confidential leadership tier, nor
  -- promote anyone into it.
  if caller_role = 'admin' and not public.is_platform_admin() then
    if target_role in ('owner', 'partner', 'practice_manager') then
      raise exception 'Admins cannot change the role of an owner, partner or practice manager';
    end if;
    if new_role in ('owner', 'partner', 'practice_manager') then
      raise exception 'Admins cannot promote someone to owner, partner or practice manager';
    end if;
  end if;
  -- Only an owner (or platform admin) can create another owner.
  if new_role = 'owner' and caller_role <> 'owner' and not public.is_platform_admin() then
    raise exception 'Only an owner can promote someone to owner';
  end if;
  if target_role = 'owner' and new_role <> 'owner' then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = target_practice_id and role = 'owner' and user_id <> target_user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot demote the last owner. Promote someone else to owner first, or use transfer ownership.';
    end if;
  end if;

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

  return json_build_object('ok', true, 'practice_id', target_practice_id, 'user_id', target_user_id, 'role', new_role);
end;
$$;

-- ─── remove_practice_member ──────────────────────────────────────────────
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
  if caller_role not in ('owner', 'partner', 'practice_manager', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners, partners, practice managers and admins can remove members';
  end if;
  -- Operational admins cannot remove the confidential leadership tier.
  if caller_role = 'admin' and target_role in ('owner', 'partner', 'practice_manager') and not public.is_platform_admin() then
    raise exception 'Admins cannot remove an owner, partner or practice manager';
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

-- ─── revoke_practice_invite ──────────────────────────────────────────────
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
  if caller_role not in ('owner', 'partner', 'practice_manager', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners, partners, practice managers and admins can revoke invites for this practice';
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

-- ─── invite_user_to_practice ─────────────────────────────────────────────
create or replace function public.invite_user_to_practice(
  target_practice_id uuid,
  invitee_email text,
  invitee_role public.practice_role default 'clinician'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_invite_id uuid;
  caller_id uuid := auth.uid();
  caller_role public.practice_role;
begin
  if caller_id is null then raise exception 'Not authenticated'; end if;
  if invitee_email is null or trim(invitee_email) = '' then raise exception 'Email is required'; end if;

  select role into caller_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = caller_id;

  if caller_role is null then raise exception 'You are not a member of this practice'; end if;
  if caller_role not in ('owner', 'partner', 'practice_manager', 'admin') then
    raise exception 'Only owners, partners, practice managers or admins can invite users';
  end if;
  -- Operational admins cannot invite anyone into the confidential leadership tier.
  if caller_role = 'admin' and invitee_role in ('owner', 'partner', 'practice_manager') then
    raise exception 'Admins cannot invite someone as an owner, partner or practice manager';
  end if;
  -- Only an owner can invite another owner.
  if invitee_role = 'owner' and caller_role <> 'owner' then
    raise exception 'Only owners can invite other owners';
  end if;

  if exists (
    select 1 from public.practice_users pu
    join public.profiles p on p.id = pu.user_id
    where pu.practice_id = target_practice_id
      and lower(p.email) = lower(trim(invitee_email))
  ) then
    raise exception 'User is already a member of this practice';
  end if;

  update public.practice_invites
  set revoked_at = now()
  where practice_id = target_practice_id
    and lower(email) = lower(trim(invitee_email))
    and accepted_at is null
    and revoked_at is null;

  insert into public.practice_invites (practice_id, email, role, invited_by)
  values (target_practice_id, lower(trim(invitee_email)), invitee_role, caller_id)
  returning id into new_invite_id;

  return new_invite_id;
end;
$$;

-- ─── bulk_invite_users_to_practice ───────────────────────────────────────
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
  caller_is_admin_only boolean;
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
  if caller_role not in ('owner', 'partner', 'practice_manager', 'admin') and not public.is_platform_admin() then
    raise exception 'Only owners, partners, practice managers and admins can invite members';
  end if;
  is_caller_owner := caller_role = 'owner' or public.is_platform_admin();
  -- An operational admin cannot invite anyone into the leadership tier.
  caller_is_admin_only := caller_role = 'admin' and not public.is_platform_admin();

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
    if caller_is_admin_only and effective_role in ('owner', 'partner', 'practice_manager') then
      results := results || jsonb_build_array(jsonb_build_object('email', raw_email, 'status', 'error', 'message', 'Admins cannot invite owners, partners or practice managers'));
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

-- ─── set_member_non_clinical_flag ────────────────────────────────────────
-- Only the "who can mark someone else" check widens; self-marking unchanged.
create or replace function public.set_member_non_clinical_flag(
  target_practice_id uuid,
  target_user_id uuid,
  marked boolean
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
  has_linked_clinician boolean;
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

  if target_user_id <> caller_id then
    if caller_role not in ('owner', 'partner', 'practice_manager', 'admin') and not public.is_platform_admin() then
      raise exception 'Only owners, partners, practice managers and admins can mark someone else non-clinical';
    end if;
  end if;

  if marked then
    select exists(
      select 1 from public.clinicians
      where linked_user_id = target_user_id
        and practice_id = target_practice_id
    ) into has_linked_clinician;
    if has_linked_clinician then
      raise exception 'This user is currently linked to a clinician record on this practice. Unlink the clinician first, then mark non-clinical.';
    end if;
  end if;

  update public.practice_users
  set marked_non_clinical = marked
  where practice_id = target_practice_id and user_id = target_user_id;

  select email into target_email from auth.users where id = target_user_id;
  perform public.log_audit_event(
    target_practice_id,
    'user_role_changed'::public.audit_event_type,
    case
      when marked then format('Marked %s as non-clinical', coalesce(target_email, 'member'))
      else format('Marked %s as clinical', coalesce(target_email, 'member'))
    end,
    jsonb_build_object('user_id', target_user_id, 'flag', 'non_clinical', 'value', marked, 'self', target_user_id = caller_id)
  );

  return json_build_object('ok', true, 'practice_id', target_practice_id, 'user_id', target_user_id, 'marked_non_clinical', marked);
end;
$$;

-- ─── Standalone policies: route through is_practice_admin() helper ────────
-- These two policies hardcoded ('owner','admin'). Recreate them to use the
-- is_practice_admin() helper (already widened to the management tier), so
-- they include partner/practice_manager now AND automatically track any
-- future change to the tier definition.

-- practice_invites: management tier can see their practice's invites.
drop policy if exists practice_invites_select_admin on public.practice_invites;
create policy practice_invites_select_admin
  on public.practice_invites for select
  using (public.is_practice_admin(practice_id));

-- practices: management tier can update their practice row.
drop policy if exists practices_update_admin on public.practices;
create policy practices_update_admin
  on public.practices for update
  using (public.is_practice_admin(id))
  with check (public.is_practice_admin(id));
