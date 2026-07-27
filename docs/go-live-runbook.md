# GPDash v4 — Go-Live Runbook (gpdash.net cutover)

Strategy chosen: **main becomes v4-rebuild** (replace, not line-merge — v4
supersedes v3 wholesale). v3 is safety-branched as `v3-legacy` (already pushed).

## Prerequisites — must ALL be true before the switch

- [ ] **Fixes confirmed on preview**: Today-page data survives refresh
      (v4.96.2) and no false "away after leave" (v4.97.1).
- [ ] **Your account role is `owner`** (run the role-fix SQL if token creation
      still says "not permitted").
- [ ] **Staff invited** and each has logged in once on preview. (NHS IT
      allowlist question resolved or personal emails used.)

## Vercel — environment variables (5 minutes, the critical step)

In the Vercel project → Settings → Environment Variables, every one of these
must be ticked for the **Production** environment (they already work for
Preview — the risk is Production scope not being ticked):

| Variable | Why |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | v4 database + auth |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | v4 client auth |
| SUPABASE_SERVICE_ROLE_KEY | server routes (ingest, public buddy, admin) |
| UPSTASH_REDIS_REST_URL / _TOKEN | rate limiting |
| KV_REST_API_URL / _TOKEN | legacy `/` page data (v3 UI still ships) |
| APP_PASSWORD | legacy `/` page login |
| NEXT_PUBLIC_SITE_URL | set to https://gpdash.net |
| CRON_SECRET | retention cleanup cron |
| NEXT_PUBLIC_DEFAULT_TO_V4 | set true if used |

(ANTHROPIC_API_KEY lives in Supabase Edge Function secrets — already set,
nothing to do.)

## Supabase — auth URLs (2 minutes; skipping this bounces all logins)

Dashboard → Authentication → URL Configuration:
- Site URL: `https://gpdash.net`
- Additional redirect URLs: keep `https://preview.gpdash.net/**`, add
  `https://gpdash.net/**` and `https://www.gpdash.net/**`.

Also: Database → Backups → confirm daily backups are on.

## The switch (Claude runs on your GO)

```
git fetch origin
git push origin origin/main:refs/heads/v3-legacy-final   # second belt
git checkout -B main v4-rebuild
git push --force-with-lease origin main                   # deploys gpdash.net
```

## Within 15 minutes of the deploy — verification

- [ ] gpdash.net/launch shows the splash; login works; dashboard loads.
- [ ] gpdash.net/buddy shows the public board (EMIS links live here).
- [ ] Upload CSV on Today, refresh, data persists.
- [ ] Buddy page: presence toggles save; inconsistency panel sane.
- [ ] Meetings visible to leadership only.
- [ ] Staff re-add the home-screen icon (start URL changed to /launch).

## Rollback (if anything is badly wrong)

```
git push --force-with-lease origin v3-legacy:main
```
v3's Redis data was never touched; the practice is back on v3 in one deploy.

## Post-launch tidy (not blocking)

- Decide fate of the legacy `/` v3 UI (retire → redirect to /v4/login).
- Remove APP_PASSWORD/KV vars once legacy page retired.
- Re-run RLS isolation checks when a second practice onboards.
