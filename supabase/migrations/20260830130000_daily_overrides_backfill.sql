-- ═══════════════════════════════════════════════════════════════════════════
-- Finish the v4 migration for daily overrides
-- ═══════════════════════════════════════════════════════════════════════════
--
-- daily_overrides was created in migration 006 (May 2026) and never written
-- to — 0 rows in production. Every override has instead lived in
-- practice_settings.extras.dailyOverrides as a v3-shaped JSON blob:
--
--   "2026-06-17-Wednesday": {
--     present:   [clinician_id, ...],        -- absolute set, not a delta
--     scheduled: [clinician_id, ...],        -- who was expected
--     meta: { clinician_id: { at, by, to } } -- who changed it and when
--   }
--
-- lib/data.js computes `absent = scheduled - present`, so the pair is
-- equivalent to a per-clinician state over the scheduled set. That maps onto
-- daily_overrides exactly:
--
--   in scheduled AND in present  -> am='in',  pm='in'
--   in scheduled NOT in present  -> am='off', pm='off'
--   in present NOT in scheduled  -> am='in',  pm='in'   (added unexpectedly)
--
-- Day-level v3 data fills both sessions; the table's am/pm split is what
-- makes future per-session overrides possible without another migration.
--
-- meta.at / meta.by become updated_at / updated_by. `by` holds an email, so
-- it is resolved through profiles; an unresolvable address leaves the column
-- null rather than failing the row.
--
-- Idempotent: ON CONFLICT DO NOTHING, so re-running cannot overwrite newer
-- app writes. The blob is deliberately NOT deleted — it stays as the
-- fallback the reader uses until the table is proven in production.

do $$
declare
  ps        record;
  day_key   text;
  day_val   jsonb;
  the_date  date;
  cid       text;
  present   jsonb;
  scheduled jsonb;
  is_present boolean;
  meta_e    jsonb;
  by_email  text;
  by_uid    uuid;
  at_ts     timestamptz;
  n_rows    int := 0;
begin
  for ps in select practice_id, extras from public.practice_settings
            where extras ? 'dailyOverrides' loop

    for day_key, day_val in select * from jsonb_each(ps.extras->'dailyOverrides') loop
      -- Keys are "YYYY-MM-DD-Weekday"; the weekday is derivable, so only the
      -- date is carried across. Validate by pattern rather than catching a
      -- cast error: CONTINUE is not dependable inside an exception handler.
      the_date := null;
      if day_key ~ '^\d{4}-\d{2}-\d{2}' then
        the_date := left(day_key, 10)::date;
      else
        raise notice 'skipping unparseable override key %', day_key;
      end if;

      if the_date is not null then

      present   := coalesce(day_val->'present',   '[]'::jsonb);
      scheduled := coalesce(day_val->'scheduled', '[]'::jsonb);

      -- Union of both lists: everyone this day has an explicit opinion about.
      for cid in
        select jsonb_array_elements_text(present)
        union
        select jsonb_array_elements_text(scheduled)
      loop
        -- Only clinicians that still exist and belong to this practice.
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
          cid::uuid,
          the_date,
          (case when is_present then 'in' else 'off' end)::public.session_state,
          (case when is_present then 'in' else 'off' end)::public.session_state,
          coalesce(at_ts, now()),
          coalesce(at_ts, now()),
          by_uid,
          by_uid
        )
        on conflict (clinician_id, date) do nothing;

        n_rows := n_rows + 1;
        end if;
      end loop;
      end if;
    end loop;
  end loop;

  raise notice 'daily_overrides backfill: % row attempts', n_rows;
end $$;

comment on table public.daily_overrides is
  'Per-clinician, per-date session overrides. Backfilled from the v3-shaped practice_settings.extras.dailyOverrides blob in v4.122.0. The app dual-writes both during transition; the blob remains the read fallback until this table is proven.';
