-- Migration 012: practice slugs
-- Add a URL slug to each practice. Used as the public-facing identifier
-- in URLs like /p/winscombe instead of the UUID.
--
-- Slugs are: lowercase a-z 0-9 and dashes, length 1-50, no leading/trailing dash.
-- Auto-generated from the practice name on backfill, editable afterwards.

alter table public.practices add column if not exists slug text;

-- Backfill: derive from name → lowercase, alphanumerics + dashes, trim dashes.
update public.practices
set slug = trim(both '-' from lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')))
where slug is null;

-- Defensive: any practice whose name was entirely non-alphanumeric (very unlikely)
-- gets a slug derived from its UUID prefix.
update public.practices
set slug = 'practice-' || substr(id::text, 1, 8)
where slug is null or slug = '';

-- Going forward, every practice must have a slug.
alter table public.practices alter column slug set not null;

-- Unique across practices.
create unique index if not exists practices_slug_idx on public.practices (slug);

-- Format check: lowercase a-z, 0-9 and dashes; 1-50 chars; no leading/trailing dash.
alter table public.practices add constraint practices_slug_format
  check (
    length(slug) between 1 and 50
    and slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'
    or slug ~ '^[a-z0-9]$'
  );
