-- ═══════════════════════════════════════════════════════════════════════════
-- 20260904120100 — an optimistic lock for the whole-document save
-- ═══════════════════════════════════════════════════════════════════════════
--
-- /api/v4/data POST takes the entire practice data object and diffs it against
-- what is in Postgres. That design is what lets the v3 components run unchanged,
-- and it is not going away today — but it has no concurrency control at all.
-- Two people editing the same practice at once, which is exactly what a morning
-- huddle is, means the second save silently overwrites the first. Nobody sees
-- an error; the change simply is not there any more.
--
-- This adds a version counter per practice and a compare-and-swap to claim it.
--
-- Scope: the counter guards the SLOW path only — the structural edits
-- (clinicians, weeklyRota, plannedAbsences, settings, closedDays, ...) where a
-- lost write loses real work. The fast path (In/Out toggles, rota notes, buddy
-- allocations) writes targeted per-key upserts where last-write-wins is the
-- behaviour you actually want, and putting a lock in front of it would produce
-- a 409 every time two people touched the board in the same minute.

alter table public.practices
  add column if not exists data_version bigint not null default 0;

comment on column public.practices.data_version is
  'Bumped by claim_practice_data_version() on every structural save through '
  '/api/v4/data. Clients read it from GET and send it back; a mismatch means '
  'someone else saved in between and the write is refused with 409.';


-- ─── claim_practice_data_version ──────────────────────────────────────────
--
-- Atomically takes the next version, but only if the caller is holding the one
-- that is current. The CAS lives in the WHERE clause so two concurrent savers
-- cannot both win: the UPDATE takes a row lock, and the loser re-reads a
-- version that no longer matches and gets zero rows back.
--
-- Called BEFORE the mutations are applied, so a refused save has not written
-- anything.
--
-- expected_version null means "I do not know the version" — a client running a
-- bundle from before this release, or a sendBeacon on unload. Those bump
-- unconditionally rather than failing, so a deploy mid-session does not start
-- rejecting saves. Once every session has the new bundle this branch is dead
-- and can be removed.
--
-- Returns jsonb rather than a bare bigint so the caller can tell a refusal
-- (ok:false, plus whose version won) from a null that means something broke.
create or replace function public.claim_practice_data_version(
  target_practice_id uuid,
  expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_version bigint;
  current_version bigint;
begin
  -- Same set as MANAGEMENT_ROLES in app/api/v4/data/route.js: the union of
  -- owner/admin and owner/partner/practice_manager. The route checks this too;
  -- this is here so the RPC is not a way around it.
  if not (public.is_practice_admin(target_practice_id)
          or public.is_practice_leadership(target_practice_id)) then
    raise exception 'Write access requires a management role'
      using errcode = '42501';
  end if;

  if expected_version is null then
    update public.practices
       set data_version = data_version + 1
     where id = target_practice_id
    returning data_version into new_version;

    if new_version is null then
      raise exception 'Practice not found' using errcode = 'P0002';
    end if;
    return jsonb_build_object('ok', true, 'version', new_version);
  end if;

  update public.practices
     set data_version = data_version + 1
   where id = target_practice_id
     and data_version = expected_version
  returning data_version into new_version;

  if new_version is not null then
    return jsonb_build_object('ok', true, 'version', new_version);
  end if;

  -- Nothing updated: either the version moved under us or the practice is gone.
  select data_version into current_version
    from public.practices where id = target_practice_id;

  if current_version is null then
    raise exception 'Practice not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', false, 'version', current_version);
end
$$;

-- Note the grantee. `from public` is what every earlier migration wrote and it
-- does not remove Supabase's default grant to anon — see
-- 20260904120000_lock_down_definer_grants.sql for the whole story.
revoke all on function public.claim_practice_data_version(uuid, bigint) from anon, public;
grant execute on function public.claim_practice_data_version(uuid, bigint) to authenticated;
