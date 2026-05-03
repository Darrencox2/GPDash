-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 003: practice creation + invite functions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds SECURITY DEFINER functions for two operations that need to bypass RLS
-- in controlled ways:
--
--   create_practice_with_owner()  — atomically creates a practice and adds
--                                   the calling user as the 'owner'
--   invite_user_to_practice()     — creates a pending invite for an email
--                                   to join a practice with a given role
--   accept_invite()               — accepts a pending invite (by signed-in
--                                   user), creating their practice_users row
--
-- These functions are the only sanctioned way to mutate practices and
-- practice_users. Direct INSERT/UPDATE/DELETE remain locked by RLS.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. practice_invites table ──────────────────────────────────────────
-- Pending invites by email. When a user signs up with a matching email,
-- they can accept the invite to join the practice. Invites can also be
-- revoked by practice admins.
create table public.practice_invites (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  email         text not null,
  role          public.practice_role not null default 'clinician',
  invited_by    uuid not null references auth.users(id),
  invited_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '14 days'),
  accepted_at   timestamptz,
  revoked_at    timestamptz
);

create index practice_invites_email_idx on public.practice_invites (lower(email))
  where accepted_at is null and revoked_at is null;
create index practice_invites_practice_idx on public.practice_invites (practice_id);

alter table public.practice_invites enable row level security;

-- Practice admins can SELECT/UPDATE invites for their practice.
create policy practice_invites_select_admin
  on public.practice_invites for select
  using (
    practice_id in (
      select practice_id from public.practice_users
      where user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );

-- A signed-in user can SELECT invites addressed to their email (so they can see
-- and accept them after signing up).
create policy practice_invites_select_own
  on public.practice_invites for select
  using (
    lower(email) = lower(coalesce(
      (select email from public.profiles where id = (select auth.uid())),
      ''
    ))
  );


-- ─── 2. create_practice_with_owner() ───────────────────────────────────
-- Atomic operation: insert a practice + insert a practice_users row making
-- the caller the owner. Both succeed or both fail.
create or replace function public.create_practice_with_owner(
  practice_name text,
  ods_code text default null,
  region text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_practice_id uuid;
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if practice_name is null or trim(practice_name) = '' then
    raise exception 'Practice name is required';
  end if;

  -- Insert the practice
  insert into public.practices (name, ods_code, region)
  values (trim(practice_name), nullif(trim(ods_code), ''), nullif(trim(region), ''))
  returning id into new_practice_id;

  -- Add the caller as owner
  insert into public.practice_users (practice_id, user_id, role)
  values (new_practice_id, caller_id, 'owner');

  return new_practice_id;
end;
$$;

revoke all on function public.create_practice_with_owner(text, text, text) from public;
grant execute on function public.create_practice_with_owner(text, text, text) to authenticated;


-- ─── 3. invite_user_to_practice() ──────────────────────────────────────
-- Creates a pending invite. Caller must be owner or admin of the practice.
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
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  if invitee_email is null or trim(invitee_email) = '' then
    raise exception 'Email is required';
  end if;

  -- Check the caller is owner/admin of this practice
  select role into caller_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = caller_id;

  if caller_role is null then
    raise exception 'You are not a member of this practice';
  end if;

  if caller_role not in ('owner', 'admin') then
    raise exception 'Only owners or admins can invite users';
  end if;

  -- An owner can invite anyone (including other owners). An admin cannot make owners.
  if caller_role = 'admin' and invitee_role = 'owner' then
    raise exception 'Only owners can invite other owners';
  end if;

  -- If invitee is already a member of this practice, block
  if exists (
    select 1 from public.practice_users pu
    join public.profiles p on p.id = pu.user_id
    where pu.practice_id = target_practice_id
      and lower(p.email) = lower(trim(invitee_email))
  ) then
    raise exception 'User is already a member of this practice';
  end if;

  -- Revoke any existing pending invite for this email+practice
  update public.practice_invites
  set revoked_at = now()
  where practice_id = target_practice_id
    and lower(email) = lower(trim(invitee_email))
    and accepted_at is null
    and revoked_at is null;

  -- Create new invite
  insert into public.practice_invites (practice_id, email, role, invited_by)
  values (target_practice_id, lower(trim(invitee_email)), invitee_role, caller_id)
  returning id into new_invite_id;

  return new_invite_id;
end;
$$;

revoke all on function public.invite_user_to_practice(uuid, text, public.practice_role) from public;
grant execute on function public.invite_user_to_practice(uuid, text, public.practice_role) to authenticated;


-- ─── 4. accept_invite() ────────────────────────────────────────────────
-- Caller accepts an invite addressed to their email.
create or replace function public.accept_invite(
  invite_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text;
  invite_row public.practice_invites;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Get caller's email from profile
  select email into caller_email from public.profiles where id = caller_id;
  if caller_email is null then
    raise exception 'Profile not found';
  end if;

  -- Get the invite
  select * into invite_row from public.practice_invites where id = invite_id;
  if invite_row.id is null then
    raise exception 'Invite not found';
  end if;

  if lower(invite_row.email) != lower(caller_email) then
    raise exception 'This invite is for a different email address';
  end if;

  if invite_row.accepted_at is not null then
    raise exception 'Invite has already been accepted';
  end if;

  if invite_row.revoked_at is not null then
    raise exception 'Invite has been revoked';
  end if;

  if invite_row.expires_at < now() then
    raise exception 'Invite has expired';
  end if;

  -- Add to practice_users (idempotent — if they're already a member, do nothing)
  insert into public.practice_users (practice_id, user_id, role, invited_by)
  values (invite_row.practice_id, caller_id, invite_row.role, invite_row.invited_by)
  on conflict (practice_id, user_id) do nothing;

  -- Mark invite accepted
  update public.practice_invites
  set accepted_at = now()
  where id = invite_id;

  return invite_row.practice_id;
end;
$$;

revoke all on function public.accept_invite(uuid) from public;
grant execute on function public.accept_invite(uuid) to authenticated;


-- ─── 5. Helper: list_practice_members() ────────────────────────────────
-- Returns members of a practice the caller belongs to (with profile info).
-- This is callable from the app to render the team list.
create or replace function public.list_practice_members(target_practice_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  role public.practice_role,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select pu.user_id, p.email, p.name, pu.role, pu.joined_at
  from public.practice_users pu
  join public.profiles p on p.id = pu.user_id
  where pu.practice_id = target_practice_id
    and target_practice_id in (select public.user_practice_ids())
  order by pu.joined_at asc
$$;

revoke all on function public.list_practice_members(uuid) from public;
grant execute on function public.list_practice_members(uuid) to authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE. The app can now:
--   - Call create_practice_with_owner('My Practice') to set up
--   - Call invite_user_to_practice(practice_id, 'someone@x.com', 'clinician')
--   - Call accept_invite(invite_id) to join a practice
--   - Call list_practice_members(practice_id) to render team UI
-- All four enforce permissions inside the function, so the app cannot bypass.
-- ═══════════════════════════════════════════════════════════════════════════
