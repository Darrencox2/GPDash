-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Migration 033: clinicians.metadata jsonb
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a single `metadata` JSONB column to clinicians for v3-era extras
-- that don't warrant first-class columns yet. The side-panel detail
-- view (Practice → Clinicians, click a row) reads/writes:
--
--   metadata.primaryBuddy     uuid|null   — primary cover relationship
--   metadata.secondaryBuddy   uuid|null   — fallback cover
--   metadata.roomPreferences  object      — { siteId: { preferred, secondary } }
--   metadata.notes            text        — free-form notes about the clinician
--
-- Keeping these in JSONB rather than separate columns:
--   - the shape is still evolving (room preferences spec might change)
--   - they're read together when the panel opens, not joined in queries
--   - it avoids three more migrations for related-but-rare fields
--
-- The dashboard and buddy-cover engine continue to read primary/secondary
-- buddy from data.clinicians[*] which the v4 adapter populates from
-- metadata — no change needed in those paths.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.clinicians
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- No index needed yet — the panel reads metadata only when the user
-- opens a specific clinician (id lookup), and the v4 adapter does a
-- single select * for all clinicians (no per-field WHERE clauses).
