# GPDash — working rules for Claude Code

GP practice dashboard for Winscombe & Banwell Family Practice. Next.js + Supabase + Vercel. Production = `main` (gpdash.net, ~3 min deploy); active dev branch = `v4-rebuild`. Always push both: `v4-rebuild:main` and `v4-rebuild:v4-rebuild`.

## Every build
- Bump `lib/version.js` (semver: MAJOR breaking, MINOR feature, PATCH fix) and prepend an entry to `lib/changelog.js`. **No apostrophes in changelog text.**
- Build gate before any commit: `rm -rf .next && NODE_OPTIONS="--max-old-space-size=2048" npx next build`
- Commit identity: `git -c user.email="darrencox2@users.noreply.github.com" -c user.name="Darrencox2"`
- Ask Darren before building new features and before committing/pushing.

## Verification discipline (hard-learned)
- After any patch: read the actual patched lines AND rerun real output. Never trust build/lint logs alone.
- Runtime repro pattern: `npx esbuild /tmp/x.mjs --bundle --platform=node --alias:@=. --outfile=/tmp/x.cjs && node /tmp/x.cjs`
- Never chain further shell steps after `grep -c` (exits 1 on zero matches, silently skips the rest of a `&&` chain).
- Prefer targeted edits to regenerating whole files.

## Hands off / decided
- `getDutyDoctor` in `lib/huddle.js` must remain unchanged (a prior "fix" was explicitly reverted).
- Session-time definitions are intentionally unconsolidated (audit exists; five definitions, three philosophies). Do not consolidate without explicit instruction.
- Capacity is slot-derived, not rota-derived: the measure is GPs actually offering bookable appointments; presence without bookable slots counts for nothing.
- Errors must name themselves: SectionErrorBoundary shows real messages, never blank pages.

## Domain facts
- EMIS row times are session buckets ("Before 12:59" / "After or At 13:00"), not clocks.
- EMIS clipboard reports: no Unicode box-drawing, no multiple tabs; initials padded to 4 chars + single tab; buddy link must be `www.gpdash.net/buddy`.
- Supabase migrations in `supabase/migrations/**` auto-apply via GitHub Actions on push to `v4-rebuild` — pushing IS applying; never apply manually.
- Design language: dark glass (`.glass*` classes), fonts DM Sans / Space Mono / Outfit; site colours Locking `#f97316`, Winscombe `#8b5cf6`, Banwell `#84cc16`.
