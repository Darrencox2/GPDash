-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 004: fix accept_invite + add inviter info
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Two fixes:
-- 1. accept_invite() now reads the email from auth.users (the source of truth
--    for Supabase Auth) instead of profiles.email. profiles can drift if the
--    user changes their auth email.
--
-- 2. Add a helper get_my_pending_invites() that returns invites with inviter
--    name + practice name in one query. Avoids needing complex joins from app.
--
-- Also improves error messages so the user knows WHICH email mismatch occurred.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── Replace accept_invite() ───────────────────────────────────────────
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

  -- Get caller's email from auth.users (source of truth, not profiles which can drift)
  select email into caller_email from auth.users where id = caller_id;
  if caller_email is null then
    raise exception 'Could not find your email in auth.users';
  end if;

  -- Get the invite
  select * into invite_row from public.practice_invites where id = invite_id;
  if invite_row.id is null then
    raise exception 'Invite not found';
  end if;

  if lower(invite_row.email) != lower(caller_email) then
    raise exception 'This invite was sent to %, but you are signed in as %',
      invite_row.email, caller_email;
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


-- ─── Helper: get_my_pending_invites() ──────────────────────────────────
-- Returns invites for the current user's email, with practice + inviter info.
create or replace function public.get_my_pending_invites()
returns table (
  invite_id uuid,
  practice_id uuid,
  practice_name text,
  invitee_email text,
  role public.practice_role,
  inviter_name text,
  inviter_email text,
  invited_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    inv.id as invite_id,
    p.id as practice_id,
    p.name as practice_name,
    inv.email as invitee_email,
    inv.role,
    coalesce(inviter_profile.name, inviter_user.email) as inviter_name,
    inviter_user.email as inviter_email,
    inv.invited_at,
    inv.expires_at
  from public.practice_invites inv
  join public.practices p on p.id = inv.practice_id
  left join public.profiles inviter_profile on inviter_profile.id = inv.invited_by
  left join auth.users inviter_user on inviter_user.id = inv.invited_by
  where lower(inv.email) = lower((select email from auth.users where id = auth.uid()))
    and inv.accepted_at is null
    and inv.revoked_at is null
    and inv.expires_at > now()
  order by inv.invited_at desc
$$;

revoke all on function public.get_my_pending_invites() from public;
grant execute on function public.get_my_pending_invites() to authenticated;


-- ─── Also update the existing email-match RLS policy on practice_invites ──
-- Same fix: use auth.users.email instead of profiles.email so case/drift can't
-- accidentally hide invites from users.
drop policy if exists practice_invites_select_own on public.practice_invites;
create policy practice_invites_select_own
  on public.practice_invites for select
  using (
    lower(email) = lower(coalesce(
      (select email from auth.users where id = (select auth.uid())),
      ''
    ))
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- DONE.
-- After running, the dashboard will use get_my_pending_invites() to show
-- richer invite info, and accept_invite() will give clearer error messages
-- when emails don't match.
-- ═══════════════════════════════════════════════════════════════════════════
