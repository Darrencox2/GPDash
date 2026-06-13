# GPDash pre-release checklist

Run through this before shipping anything non-trivial to `v4-rebuild`.

## Build & deploy
- [ ] **Build gate passes** — `cd /home/claude/buddy-system-work && rm -rf .next && NODE_OPTIONS="--max-old-space-size=2048" timeout 250 npx --no next build` shows `✓ Compiled successfully`. (npm notices can hide the result — look for the tick.)
- [ ] **Version bumped** in `lib/version.js` (MAJOR.MINOR.PATCH — major = breaking/fundamental, minor = new feature, patch = fix/tweak).
- [ ] **Changelog entry** prepended in `lib/changelog.js` (no apostrophes/contractions in `text` strings).
- [ ] Migrations (if any) are in `supabase/migrations/**` — they auto-apply on push. Nothing schema-related left in `tests/`.

## Security (after ANY change to RLS, scoping helpers, or a new practice-scoped table)
- [ ] **Run the RLS isolation test** — paste `supabase/tests/rls_isolation_test.sql` into the Supabase SQL editor and run. Every data row must say PASS. (The `NO OTHER PRACTICE` row is info-only — FAIL there just means there is not yet a second populated practice to test against.)
- [ ] If you added a practice-scoped table, add a check for it to the test.

## Manual test on phone (the real environment)
- [ ] Walk Today → Buddy cover → My rota → Reporting → Practice settings.
- [ ] Light mode and dark mode both look right (no invisible text, no dark fields).
- [ ] Buddy cover status can be changed — including on a weekend (the weekend-week bug class).
- [ ] Nothing overflows horizontally at the 1.25 zoom on a narrow screen.
- [ ] Any new interactive control is reachable and labelled (keyboard focus ring shows).

## Auth / email (if touched)
- [ ] Password reset still completes (or the admin "Generate link instead" path works as the email-free fallback).
