-- Add per-practice opt-in for the public buddy cover page.
--
-- When TRUE, /buddy/<slug> is publicly accessible (no auth) and shows
-- the practice's buddy cover allocations. The EMIS clipboard report
-- includes this URL so staff can click through from EMIS.
--
-- When FALSE (default), /buddy/<slug> returns 404 and the clipboard
-- report omits the URL line. A new practice signing up to GPDash does
-- NOT have their buddy data exposed publicly until they explicitly
-- opt in via the Buddy Cover settings tab.
--
-- Lawful basis for the public exposure: the practice (as controller)
-- is the one choosing to publish; GPDash (as processor) acts on
-- their documented instruction via the DPA Schedule 4 clause covering
-- this feature. The page shows only initials + cover relationships
-- (no patient data, no full staff names) — data minimisation applied.
--
-- DEFAULT FALSE on every existing practice (including Winscombe).
-- Winscombe will need to flip the flag in their Buddy Cover settings
-- once on v4 to keep their existing public URL working.

ALTER TABLE practices
  ADD COLUMN IF NOT EXISTS buddy_cover_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN practices.buddy_cover_public IS
  'When true, /buddy/<slug> is publicly accessible. Default false; opt-in via Buddy Cover settings.';
