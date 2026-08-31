-- Requests to join a practice that is already on GPDash.
--
-- Until now this was a dead end. Someone signs up, searches for their
-- practice, finds it already registered - and creation is blocked with
-- "ask the owner to invite you". They had no way to ask from inside the
-- product, and the owner had no idea anybody was waiting.
--
-- A join request is deliberately weaker than an invite: it grants
-- nothing until an owner or admin approves it, and approval always
-- lands the person on the lowest role ('user'), never an inherited one.

create table if not exists public.practice_join_requests (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null references public.practices(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  email        text not null,
  name         text,
  message      text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null
);

-- One live request per person per practice. Decided ones are kept for
-- the record, so the partial index only covers pending.
create unique index if not exists practice_join_requests_one_pending
  on public.practice_join_requests (practice_id, user_id)
  where status = 'pending';

create index if not exists practice_join_requests_practice_idx
  on public.practice_join_requests (practice_id, status);

alter table public.practice_join_requests enable row level security;

-- The requester sees their own requests; owners and admins see the ones
-- aimed at their practice. Nobody writes directly - the RPCs below own
-- every state change.
drop policy if exists join_requests_select_own on public.practice_join_requests;
create policy join_requests_select_own on public.practice_join_requests
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists join_requests_select_admin on public.practice_join_requests;
create policy join_requests_select_admin on public.practice_join_requests
  for select to authenticated
  using (exists (
    select 1 from public.practice_users pu
    where pu.practice_id = practice_join_requests.practice_id
      and pu.user_id = auth.uid()
      and pu.role in ('owner', 'admin', 'practice_manager')
  ));

-- ─── Ask to join ──────────────────────────────────────────────────────
create or replace function public.request_to_join_practice(
  p_practice_id uuid,
  p_message text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_existing record;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from public.practices where id = p_practice_id) then
    raise exception 'That practice does not exist';
  end if;

  -- Already in? Say so rather than queueing a pointless request.
  if exists (
    select 1 from public.practice_users
    where practice_id = p_practice_id and user_id = v_uid
  ) then
    return json_build_object('status', 'already_member');
  end if;

  select email, coalesce(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name')
    into v_email, v_name
  from auth.users where id = v_uid;

  select * into v_existing
  from public.practice_join_requests
  where practice_id = p_practice_id and user_id = v_uid and status = 'pending'
  limit 1;

  if v_existing.id is not null then
    return json_build_object('status', 'already_pending', 'request_id', v_existing.id);
  end if;

  insert into public.practice_join_requests (practice_id, user_id, email, name, message)
  values (p_practice_id, v_uid, v_email, v_name, nullif(trim(coalesce(p_message, '')), ''))
  returning id into v_id;

  return json_build_object('status', 'requested', 'request_id', v_id);
end;
$$;

-- ─── Decide ───────────────────────────────────────────────────────────
create or replace function public.decide_join_request(
  p_request_id uuid,
  p_approve boolean
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_req
  from public.practice_join_requests
  where id = p_request_id;

  if v_req.id is null then
    raise exception 'That request no longer exists';
  end if;

  if not exists (
    select 1 from public.practice_users
    where practice_id = v_req.practice_id
      and user_id = v_uid
      and role in ('owner', 'admin', 'practice_manager')
  ) then
    raise exception 'Only an owner or admin of this practice can decide join requests';
  end if;

  if v_req.status <> 'pending' then
    return json_build_object('status', v_req.status, 'already_decided', true);
  end if;

  if p_approve then
    -- Lowest role, always. Approving a request is saying "this person
    -- works here", not "this person runs the place"; the Users page is
    -- where a role gets raised deliberately.
    insert into public.practice_users (practice_id, user_id, role, invited_by)
    values (v_req.practice_id, v_req.user_id, 'user', v_uid)
    on conflict (practice_id, user_id) do nothing;
  end if;

  update public.practice_join_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_at = now(),
      decided_by = v_uid
  where id = p_request_id;

  return json_build_object('status', case when p_approve then 'approved' else 'declined' end);
end;
$$;

-- ─── Withdraw (the requester changing their mind) ─────────────────────
create or replace function public.withdraw_join_request(p_request_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.practice_join_requests
  set status = 'withdrawn', decided_at = now(), decided_by = v_uid
  where id = p_request_id and user_id = v_uid and status = 'pending';

  if not found then
    raise exception 'No pending request of yours matches that';
  end if;

  return json_build_object('status', 'withdrawn');
end;
$$;

revoke all on function public.request_to_join_practice(uuid, text) from public;
revoke all on function public.decide_join_request(uuid, boolean) from public;
revoke all on function public.withdraw_join_request(uuid) from public;
grant execute on function public.request_to_join_practice(uuid, text) to authenticated;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;
grant execute on function public.withdraw_join_request(uuid) to authenticated;

-- ─── The duplicate check needs to hand back an id to request against ──
-- It previously returned only { exists, practice_name }, while the UI
-- read owner_name from it - a branch that could never fire. Return the
-- id (so the user can ask to join) and the owner's name (so the message
-- can name a person).
create or replace function public.check_practice_exists_by_ods(ods text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  found record;
  owner_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if ods is null or trim(ods) = '' then
    return json_build_object('exists', false);
  end if;

  select id, name into found
  from public.practices
  where upper(ods_code) = upper(trim(ods))
  limit 1;

  if found.id is null then
    return json_build_object('exists', false);
  end if;

  select coalesce(p.name, u.email) into owner_name
  from public.practice_users pu
  join auth.users u on u.id = pu.user_id
  left join public.profiles p on p.id = pu.user_id
  where pu.practice_id = found.id and pu.role = 'owner'
  order by pu.joined_at
  limit 1;

  return json_build_object(
    'exists', true,
    'practice_id', found.id,
    'practice_name', found.name,
    'owner_name', owner_name
  );
end;
$$;

revoke all on function public.check_practice_exists_by_ods(text) from public;
grant execute on function public.check_practice_exists_by_ods(text) to authenticated;
