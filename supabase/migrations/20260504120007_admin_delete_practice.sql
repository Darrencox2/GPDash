-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 018: admin_delete_practice RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Hard-deletes a practice and everything attached to it. Platform admin
-- only. Most child tables already cascade via FK on practice_id, but we
-- delete explicitly here so:
--   1. The deletion is auditable (one RPC call, one log line)
--   2. We don't rely on every table having the right ON DELETE CASCADE
--      (some early migrations may have missed it)
--   3. We can return a count of what was deleted for the UI
--
-- Dependent rows are deleted in dependency order. clinicians cascade to
-- working_patterns, absences, rota_notes via clinician_id FK so we delete
-- those first, then clinicians, then the practice's other direct children.
--
-- This is a destructive operation. The UI must show a clear warning with
-- typed confirmation ("type the practice name to delete") before calling.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_delete_practice(target_practice_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  practice_record record;
  result json;
  deleted_clinicians int := 0;
  deleted_members int := 0;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  -- Verify the practice exists before we start deleting things
  select id, name, slug into practice_record
  from public.practices
  where id = target_practice_id;
  if practice_record is null then
    raise exception 'Practice not found';
  end if;

  -- Delete children of clinicians first (these reference clinician_id)
  delete from public.rota_notes
  where clinician_id in (select id from public.clinicians where practice_id = target_practice_id);
  delete from public.working_patterns
  where clinician_id in (select id from public.clinicians where practice_id = target_practice_id);
  delete from public.absences
  where clinician_id in (select id from public.clinicians where practice_id = target_practice_id);

  -- Now clinicians themselves
  delete from public.clinicians where practice_id = target_practice_id;
  get diagnostics deleted_clinicians = row_count;

  -- Direct children of the practice
  delete from public.buddy_allocations where practice_id = target_practice_id;
  delete from public.huddle_csv_data where practice_id = target_practice_id;
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
