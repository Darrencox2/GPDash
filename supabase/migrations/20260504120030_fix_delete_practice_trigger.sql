-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 040: fix admin_delete_practice ↔ last-owner trigger collision
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug: deleting a practice via /v4/admin/practices/[id] → "Delete practice"
-- failed with "Cannot remove or demote the last owner of a practice".
--
-- Why: practices have a row-level trigger (prevent_last_owner_removal,
-- migration 014) that fires BEFORE UPDATE/DELETE on practice_users and
-- raises if removing the last remaining owner. The intent is correct —
-- you shouldn't be able to leave a practice in a state where it has no
-- owner. But when the entire practice is being deleted, the cascade
-- removes every membership row including the owner's, and the trigger
-- objects.
--
-- Fix: a transaction-local bypass flag that admin_delete_practice sets
-- at the top of its body. The trigger now reads the flag and skips the
-- check when it's on. Scope:
--
--   - SET LOCAL config: only active for the current transaction. Goes
--     away on COMMIT/ROLLBACK regardless.
--   - Set inside admin_delete_practice (security definer), which has
--     its own permission gate (platform-admin only). No other code
--     path can flip it.
--   - Trigger continues to fire normally on every other code path:
--     remove_practice_member, leave_practice, transfer_ownership, raw
--     UPDATE/DELETE outside the delete-practice flow. Those still get
--     the same protection they had before.
--
-- Net effect: deleting a practice works; integrity protection elsewhere
-- is untouched.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Update the trigger function ─────────────────────────────────────
-- Body change only (signature unchanged), so CREATE OR REPLACE works.
create or replace function public.prevent_last_owner_removal()
returns trigger
language plpgsql
as $$
declare
  remaining_owners integer;
  bypass text;
begin
  -- Honour transaction-local bypass set by admin_delete_practice.
  -- current_setting(name, missing_ok=true) returns '' when unset, so
  -- the comparison is safe even when no caller has set anything.
  bypass := current_setting('gpdash.bypass_last_owner_check', true);
  if bypass = 'on' then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if (TG_OP = 'DELETE' and old.role = 'owner')
     or (TG_OP = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into remaining_owners
    from public.practice_users
    where practice_id = old.practice_id
      and role = 'owner'
      and user_id <> old.user_id;
    if remaining_owners = 0 then
      raise exception 'Cannot remove or demote the last owner of a practice. Promote another member to owner first.';
    end if;
  end if;
  return case when TG_OP = 'DELETE' then old else new end;
end;
$$;


-- ─── 2. Update admin_delete_practice to set the bypass ──────────────────
-- Same body as migration 018, but with a perform set_config(...) at
-- the top of the begin block. The 'true' third argument to set_config
-- is is_local=true, scoping the change to the current transaction —
-- automatically reverted at commit/rollback.
create or replace function public.admin_delete_practice(target_practice_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  practice_record record;
  deleted_clinicians int;
  deleted_members int;
  result json;
begin
  if caller_id is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_platform_admin() then
    raise exception 'Only platform admins can delete practices';
  end if;

  -- Capture identity for the response BEFORE any cascade fires
  select id, name, slug into practice_record
  from public.practices
  where id = target_practice_id;
  if practice_record.id is null then
    raise exception 'Practice not found';
  end if;

  -- Bypass the last-owner trigger for the duration of this transaction.
  -- This is the whole point of the migration — without it, the cascade
  -- on practice_users hits the trigger and aborts.
  perform set_config('gpdash.bypass_last_owner_check', 'on', true);

  -- Cascade-friendly deletion order: children first, parent last.
  -- Most rows have ON DELETE CASCADE on the practices FK, so deleting
  -- the practice itself would handle them implicitly — but doing them
  -- explicitly lets us count rows and surface a useful summary.
  delete from public.clinicians where practice_id = target_practice_id;
  get diagnostics deleted_clinicians = row_count;

  delete from public.practice_settings where practice_id = target_practice_id;
  delete from public.practice_invites where practice_id = target_practice_id;

  -- Tables that may not exist on every install — guarded with EXCEPTION
  begin
    delete from public.demand_history where practice_id = target_practice_id;
  exception when undefined_table then null;
  end;
  begin
    delete from public.audit_events where practice_id = target_practice_id;
  exception when undefined_table then null;
  end;
  begin
    delete from public.public_access_tokens where practice_id = target_practice_id;
  exception when undefined_table then null;
  end;

  -- Members last (so we can still see which user did this in audit if we
  -- ever wire that up later)
  delete from public.practice_users where practice_id = target_practice_id;
  get diagnostics deleted_members = row_count;

  -- Finally the practice itself
  delete from public.practices where id = target_practice_id;

  result := json_build_object(
    'deleted_practice_id', practice_record.id,
    'deleted_practice_name', practice_record.name,
    'deleted_practice_slug', practice_record.slug,
    'deleted_clinicians', deleted_clinicians,
    'deleted_members', deleted_members
  );
  return result;
end;
$$;
revoke all on function public.admin_delete_practice(uuid) from public;
grant execute on function public.admin_delete_practice(uuid) to authenticated;
