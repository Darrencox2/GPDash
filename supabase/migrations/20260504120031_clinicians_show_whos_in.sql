-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 041: clinicians.show_whos_in column
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a boolean show_whos_in column to clinicians, defaulting true.
--
-- Why: in v3 (Redis-blob storage) clinician objects had a showWhosIn
-- flag controlling whether they appeared in the Who's In/Out panel.
-- Buddy cover and showWhosIn are independent — some admin staff show
-- in Who's In but don't participate in buddy cover, and some
-- locums/visiting clinicians do buddy cover but not the daily Who's
-- In panel.
--
-- In v4 the flag was being SET on CSV upload (buddyCover: false,
-- showWhosIn: true) but the mutation handler dropped it on save,
-- because the column didn't exist. After page reload the flag was
-- gone — the v3 component would render Who's In for everyone.
--
-- Quick Setup tab needs a per-row Who's In toggle; this migration
-- gives the data layer a real home for it.
--
-- Default is true so existing rows behave the same as before
-- (showWhosIn defaulted to true on CSV upload, and TeamMembers
-- preserved that). New CSV imports continue to set it to true.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clinicians
  add column if not exists show_whos_in boolean not null default true;

-- No index needed — this column is filtered alongside practice_id in
-- queries that already use the practice_id index. Adding a separate
-- index would just bloat the table for negligible benefit.
