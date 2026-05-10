-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 034: admin_get_user_activity RPC
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Returns a unified timeline of events for one user, drawn from both:
--   - audit_events: practice-level actions (CSV uploaded, settings
--     changed, member added, etc.) where this user was the actor
--   - auth_events: sign-in / signup / password reset / lockout events
--
-- Used by the activity timeline section on /v4/admin/users/[id].
--
-- Limited to the most recent 100 events by default. Anything older is
-- still in the underlying tables; we just don't surface it on this
-- screen because scrolling forever is rarely useful for support work.
-- A separate per-practice audit log already exists for that.
--
-- Both source tables have indexes on (user_id, occurred_at desc), so
-- this query is fast even with many users / many events.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_get_user_activity(
  target_user_id uuid,
  limit_count int default 100
)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden: platform admin only';
  end if;

  -- Sanity-cap the limit so a buggy caller can't pull a million rows.
  if limit_count is null or limit_count < 1 then limit_count := 100; end if;
  if limit_count > 500 then limit_count := 500; end if;

  -- Build a unified timeline:
  --   source = 'audit' rows include practice_name (joined from practices)
  --           and event_type from the audit_event_type enum.
  --   source = 'auth'  rows have no practice; event_type from the
  --           auth_event_type enum. We re-cast both enums to text so
  --           the resulting json column type is uniform.
  -- Sort everything by occurred_at desc and limit.
  with combined as (
    select
      'audit'::text as source,
      ae.id,
      ae.occurred_at,
      ae.event_type::text as event_type,
      ae.description,
      ae.details,
      ae.practice_id,
      p.name as practice_name,
      p.slug as practice_slug
    from public.audit_events ae
    left join public.practices p on p.id = ae.practice_id
    where ae.user_id = target_user_id

    union all

    select
      'auth'::text as source,
      av.id,
      av.occurred_at,
      av.event_type::text as event_type,
      null::text as description,
      av.details,
      null::uuid as practice_id,
      null::text as practice_name,
      null::text as practice_slug
    from public.auth_events av
    where av.user_id = target_user_id
  )
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into result
  from (
    select * from combined
    order by occurred_at desc
    limit limit_count
  ) t;

  return result;
end;
$$;
revoke all on function public.admin_get_user_activity(uuid, int) from public;
grant execute on function public.admin_get_user_activity(uuid, int) to authenticated;
