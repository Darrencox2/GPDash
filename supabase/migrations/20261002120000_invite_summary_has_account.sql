-- Tell the invite landing page whether an account already exists for the
-- invited address.
--
-- Why: a new invitee on 29 Sep 2026 saw "Sign in" and "Create an account"
-- side by side, tried to sign in (no account yet), then asked for a
-- password reset three times. Supabase sends nothing for an address with
-- no account and never says so, so she sat waiting for emails that could
-- not exist before finally pressing Create an account. The page can
-- avoid that by leading with the door that fits.
--
-- Disclosure: this reveals, to the holder of an invite link, whether the
-- address that invite was sent to has an account. The link is a 128-bit
-- bearer token already carrying the address itself, so this adds nothing
-- an attacker could use against other addresses.

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
    'invited_email', i.email,
    -- Does an account exist for the invited address, and is it confirmed?
    'has_account', exists (
      select 1 from auth.users u where lower(u.email) = lower(i.email)
    ),
    'account_confirmed', exists (
      select 1 from auth.users u
      where lower(u.email) = lower(i.email) and u.confirmed_at is not null
    )
  ) into result
  from public.practice_invites i
  left join public.practices p on p.id = i.practice_id
  left join public.profiles prof on prof.id = i.invited_by
  where i.id = invite_id;

  return result; -- null if no row
end;
$$;

revoke all on function public.public_get_invite_summary(uuid) from public;
grant execute on function public.public_get_invite_summary(uuid) to authenticated, anon;
