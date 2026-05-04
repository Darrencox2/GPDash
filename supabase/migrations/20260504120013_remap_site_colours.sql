-- ═══════════════════════════════════════════════════════════════════════════
-- GPDash v4 — Remap stored site colours to the new v4 palette
-- ═══════════════════════════════════════════════════════════════════════════
--
-- v4.5.18 hard-coded the site colours via data.roomAllocation.sites
-- (no longer baked into UI components), and v4.5.19 curates the
-- SITE_COLOUR_PRESETS palette to a coherent dark-glass-friendly set.
--
-- Existing practice rows still hold colours from the old palette. This
-- migration walks every site in every practice and remaps any old
-- preset hex to its closest equivalent in the new palette. Practices
-- that have used a custom hex (off-palette) are left untouched.
--
-- Old → new mapping rationale: each old colour mapped to the new entry
-- closest in hue + saturation. The slate fallback (#64748b) is the
-- catch-all when nothing's a clear match.
--
--   #8c64c3 (muted violet)  → #8b5cf6 (violet)
--   #46ac64 (mid green)     → #84cc16 (lime — green slot is reserved
--                                       for the "Good" status band)
--   #eb8232 (mid orange)    → #f97316 (orange)
--   #3b82f6 (blue)          → #3b82f6 (unchanged, in new palette)
--   #ef4444 (red)           → #ec4899 (pink — red is the "Short" band)
--   #ec4899 (pink)          → #ec4899 (unchanged)
--   #14b8a6 (teal)          → #14b8a6 (unchanged)
--   #f97316 (orange)        → #f97316 (unchanged)
--   #6366f1 (indigo)        → #3b82f6 (blue, closest neighbour)
--   #84cc16 (lime)          → #84cc16 (unchanged)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function pg_temp.remap_site_colour(old_hex text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(old_hex, ''))
    when '#8c64c3' then '#8b5cf6'
    when '#46ac64' then '#84cc16'
    when '#eb8232' then '#f97316'
    when '#ef4444' then '#ec4899'
    when '#6366f1' then '#3b82f6'
    -- Already in the new palette — no change
    when '#3b82f6' then '#3b82f6'
    when '#ec4899' then '#ec4899'
    when '#14b8a6' then '#14b8a6'
    when '#f97316' then '#f97316'
    when '#84cc16' then '#84cc16'
    when '#8b5cf6' then '#8b5cf6'
    when '#06b6d4' then '#06b6d4'
    when '#a855f7' then '#a855f7'
    when '#eab308' then '#eab308'
    when '#64748b' then '#64748b'
    -- Anything else is a custom user-picked colour — leave alone
    else old_hex
  end;
$$;

-- Walk each practice's room_allocation.sites array, remap colours
update public.practice_settings ps
set room_allocation = jsonb_set(
  ps.room_allocation,
  '{sites}',
  (
    select coalesce(jsonb_agg(
      case when site ? 'colour' then
        site || jsonb_build_object('colour', pg_temp.remap_site_colour(site->>'colour'))
      else
        site
      end
    ), '[]'::jsonb)
    from jsonb_array_elements(ps.room_allocation->'sites') site
  )
)
where ps.room_allocation ? 'sites'
  and jsonb_typeof(ps.room_allocation->'sites') = 'array'
  and jsonb_array_length(ps.room_allocation->'sites') > 0;

-- Tidy up
drop function pg_temp.remap_site_colour(text);
