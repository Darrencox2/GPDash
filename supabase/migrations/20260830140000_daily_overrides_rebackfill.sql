-- ═══════════════════════════════════════════════════════════════════════════
-- Re-run the daily_overrides backfill
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The v4.122.0 writer queued its per-date DELETEs and its UPSERT into the
-- caller's Promise.all, which is unordered. A DELETE landing after the
-- UPSERT emptied daily_overrides — observed in testing, table went 455 -> 0.
--
-- Nothing was lost: practice_settings.extras.dailyOverrides was still being
-- written alongside, and was deliberately never deleted. This migration
-- restores the table from it, exactly as 20260830130000 did.
--
-- The writer is now a single sequenced async call (lib/v4-data.js
-- syncDailyOverrides) that awaits every delete before upserting.
--
-- Same idempotent ON CONFLICT DO NOTHING body as the original.

do $$
declare
  ps         record;
  day_key    text;
  day_val    jsonb;
  the_date   date;
  cid        text;
  present    jsonb;
  scheduled  jsonb;
  is_present boolean;
  meta_e     jsonb;
  by_email   text;
  by_uid     uuid;
  at_ts      timestamptz;
  n_rows     int := 0;
begin
  for ps in select practice_id, extras from public.practice_settings
            where extras ? 'dailyOverrides' loop

    for day_key, day_val in select * from jsonb_each(ps.extras->'dailyOverrides') loop
      the_date := null;
      if day_key ~ '^\d{4}-\d{2}-\d{2}' then
        the_date := left(day_key, 10)::date;
      else
        raise notice 'skipping unparseable override key %', day_key;
      end if;

      if the_date is not null then
      present   := coalesce(day_val->'present',   '[]'::jsonb);
      scheduled := coalesce(day_val->'scheduled', '[]'::jsonb);

      for cid in
        select jsonb_array_elements_text(present)
        union
        select jsonb_array_elements_text(scheduled)
      loop
        if exists (
          select 1 from public.clinicians
          where id = cid::uuid and practice_id = ps.practice_id
        ) then

        is_present := present @> to_jsonb(cid);
        meta_e   := day_val->'meta'->cid;
        by_email := meta_e->>'by';
        at_ts    := nullif(meta_e->>'at','')::timestamptz;
        by_uid   := null;
        if by_email is not null then
          select id into by_uid from public.profiles where lower(email) = lower(by_email) limit 1;
        end if;

        insert into public.daily_overrides
          (clinician_id, date, am, pm, created_at, updated_at, created_by, updated_by)
        values (
          cid::uuid, the_date,
          (case when is_present then 'in' else 'off' end)::public.session_state,
          (case when is_present then 'in' else 'off' end)::public.session_state,
          coalesce(at_ts, now()), coalesce(at_ts, now()), by_uid, by_uid
        )
        on conflict (clinician_id, date) do nothing;

        n_rows := n_rows + 1;
        end if;
      end loop;
      end if;
    end loop;
  end loop;

  raise notice 'daily_overrides re-backfill: % row attempts', n_rows;
end $$;
