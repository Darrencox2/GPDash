-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 039: "I'm not a clinician here" flag for practice members
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Until now we've assumed every member of a practice is (or wants to be)
-- linked to a clinician record. Reality is otherwise — practice managers,
-- reception staff, IT support, finance, and other non-clinical staff all
-- have legitimate reasons to be members. The amber "⚠ Not linked" warning
-- on the Users tab and the "Is this you?" banner on the dashboard make
-- those people feel like they've forgotten to do something they shouldn't.
--
-- Adds:
--   practice_users.marked_non_clinical boolean default false
--     "I am not a clinician at this practice."  Per-membership, not
--     per-profile, because the same user could be clinical at one
--     practice and non-clinical at another (rare but real).
--
--   set_member_non_clinical_flag(practice_id, user_id, marked)
--     - Self can always toggle their own flag
--     - Owner/admin can toggle anyone else's
--     - Refuses if the member currently has a linked clinician record:
--       unlink first, then mark. (Prevents inconsistent state where
--       someone is both linked AND marked non-clinical.)
--     - Audited as user_role_changed with details.flag='non_clinical'.
--
-- Updates list_practice_members to include marked_non_clinical so the
-- Users tab can render the right status pill per row.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Column ────────────────────────────────────────────────────────────
alter table public.practice_users
  add column if not exists marked_non_clinical boolean not null default false;

-- Comment so future-me knows what this is for without grepping
comment on column public.practice_users.marked_non_clinical is
  'True if the member explicitly said they are not a clinician at this practice (e.g. practice manager, reception, IT). Suppresses the "link your clinician record" prompts.';


-- ─── 2. list_practice_members — surface the new flag ────────────────────
-- DROP-then-CREATE because TABLE return shape changes (lesson from 022/023).
drop function if exists public.list_practice_members(uuid);

create function public.list_practice_members(target_practice_id uuid)
returns table (
  user_id uuid,
  email text,
  name text,
  role public.practice_role,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  linked_clinician_id uuid,
  linked_clinician_name text,
  marked_non_clinical boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pu.user_id,
    p.email,
    p.name,
    pu.role,
    pu.joined_at,
    u.last_sign_in_at,
    c.id as linked_clinician_id,
    c.name as linked_clinician_name,
    pu.marked_non_clinical
  from public.practice_users pu
  join public.profiles p on p.id = pu.user_id
  join auth.users u on u.id = pu.user_id
  left join public.clinicians c
    on c.linked_user_id = pu.user_id
    and c.practice_id = target_practice_id
  where pu.practice_id = target_practice_id
  order by
    case pu.role when 'owner' then 0 when 'admin' then 1 else 2 end,
    coalesce(p.name, p.email);
$$;
revoke all on function public.list_practice_members(uuid) from public;
grant execute on function public.list_practice_members(uuid) to authenticated;


-- ─── 3. set_member_non_clinical_flag ─────────────────────────────────────
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
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Caller must be a member of this practice (or platform admin)
  caller_role := public.caller_practice_role(target_practice_id);
  if caller_role is null and not public.is_platform_admin() then
    raise exception 'You are not a member of this practice';
  end if;

  -- Target must be a member
  select role into target_role
  from public.practice_users
  where practice_id = target_practice_id and user_id = target_user_id;
  if target_role is null then
    raise exception 'That user is not a member of this practice';
  end if;

  -- Permission: self always allowed; otherwise must be owner/admin
  if target_user_id <> caller_id then
    if caller_role not in ('owner', 'admin') and not public.is_platform_admin() then
      raise exception 'Only owners and admins can mark someone else non-clinical';
    end if;
  end if;

  -- If trying to mark non-clinical but the user has a linked clinician
  -- record on this practice, refuse — would create inconsistent state.
  -- The user (or admin) needs to unlink first.
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

  -- Audit. Use user_role_changed with a flag marker in details since
  -- we don't have a dedicated enum value (and adding one to the enum
  -- ripples more than it's worth for a flag toggle).
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

  return json_build_object(
    'ok', true,
    'practice_id', target_practice_id,
    'user_id', target_user_id,
    'marked_non_clinical', marked
  );
end;
$$;
revoke all on function public.set_member_non_clinical_flag(uuid, uuid, boolean) from public;
grant execute on function public.set_member_non_clinical_flag(uuid, uuid, boolean) to authenticated;
