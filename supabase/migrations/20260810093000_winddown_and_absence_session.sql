-- Wind-down persistence + absence provenance/session.
--
-- wind_down (jsonb) on clinicians: the Has left / Long term absence
-- marker previously lived only in the client session because the bulk
-- save route is insert-only for clinicians by design - it MUST be
-- written via direct client updates, and needs a column to land in.
--
-- absences.source: 'teamnet' | 'winddown' | null (manual). Previously
-- lost on save, which made TeamNet rows indistinguishable from manual
-- ones after a reload and broke wind-down absence linkage.
-- absences.session: 'am' | 'pm' | null - TeamNet half-day leave.

alter table clinicians add column if not exists wind_down jsonb;
alter table absences add column if not exists source text;
alter table absences add column if not exists session text;
