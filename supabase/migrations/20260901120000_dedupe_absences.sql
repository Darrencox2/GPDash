-- 184 exact-duplicate absence rows (42% of the table) existed because the
-- TeamNet sync marks its rows with a '[teamnet]' prefix in notes, and a
-- stale-save update in /api/v4/data was rewriting notes and stripping the
-- marker - after which every sync failed to find its own rows to replace
-- and re-inserted the whole calendar. The strip and the re-insert are both
-- fixed in v4.145.0; this cleans up the rows they left behind.
--
-- Keep the EARLIEST copy of each identical row; remove the rest. Identical
-- means the same person, dates, reason, notes and half-day session - rows
-- that differ in any of those are not touched.
delete from absences a
using absences b
where a.id <> b.id
  and a.clinician_id = b.clinician_id
  and a.start_date = b.start_date
  and a.end_date = b.end_date
  and coalesce(a.reason, '') = coalesce(b.reason, '')
  and coalesce(a.notes, '') = coalesce(b.notes, '')
  and coalesce(a.session, '') = coalesce(b.session, '')
  and (b.created_at < a.created_at or (b.created_at = a.created_at and b.id < a.id));
