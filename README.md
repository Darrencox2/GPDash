# GPDash

Practice-management dashboard for UK GP practices. GPDash turns EMIS appointment
exports and online-consultation demand data into day-to-day operational tooling:
buddy-cover allocation, the morning huddle, capacity planning, room allocation and
reporting — plus a demand model that predicts how busy each future session is likely
to be.

Current version: **v4.45.1** (see `lib/version.js`).

---

## Two active streams

GPDash exists in two parallel forms in this repo:

- **v3 — production.** Lives at `gpdash.net`, single-tenant, serving Winscombe &
  Banwell Family Practice. Mainline branch.
- **v4 — the SaaS rebuild.** Lives at `preview.gpdash.net`, branch `v4-rebuild`.
  Multi-tenant on Supabase, with role-based auth and a guided onboarding wizard, on
  the path to being sellable to other practices. New work happens here.

The two share a lot of UI (`components/`) and all of the pure-logic engines
(`lib/`); v4 adds the Supabase data layer, multi-tenancy and onboarding on top.

---

## Stack

- **Next.js 15** (App Router) + **React 19**
- **Supabase** (Postgres + Auth, eu-west-2) — the v4 data layer
- **Upstash Redis** — rate limiting and some v3 state
- **Vercel** — hosting for both streams
- **Tailwind CSS** — styling, on a dark "glass" design language
- Fonts: DM Sans (body), Space Mono (data/numbers), Outfit (headings)

---

## Getting started

Requires Node 20+.

```bash
npm install
npm run dev      # local dev server
npm run build    # production build
npm run start    # serve a production build
```

### Environment variables

Set these in `.env.local` for local dev and in the Vercel project for deploys:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server only — never expose) |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL; used to build auth/email redirect links (e.g. `https://preview.gpdash.net`) |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (rate limiting) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Vercel KV (legacy v3 state) |
| `CRON_SECRET` | Shared secret guarding scheduled job endpoints |
| `APP_PASSWORD` | Legacy v3 single-password gate |

`NODE_ENV` and `VERCEL_REGION` are provided by the platform.

---

## Project layout

```
app/            Next.js App Router
  api/          Route handlers (data, admin, v4 endpoints, imports)
  v4/           The v4 SaaS app: onboarding wizard, practice settings, admin, security
  dashboard/    v4 dashboard shell
  buddy/        Public per-practice buddy-cover view (/buddy/[slug])
  p/            Public practice pages
  legal/, privacy/   Legal + privacy pages
components/
  huddle/       Today huddle, Capacity Planning (HuddleForward), Reporting, etc.
  buddy/        Buddy-cover daily view + team management
  room/         Room allocation dashboard + settings
  ui/           Shared primitives
  Sidebar.js, Changelog.js, LoginScreen.js, ...
lib/            Pure logic engines + parsers (see below)
supabase/
  migrations/   SQL migrations (auto-applied on push — see below)
utils/          Supabase client/server helpers
docs/           Internal notes (migration plan, email templates, legal)
```

### Key `lib/` modules

- `workload-report.js` — the reporting engine: builds slot- and session-grain facts
  from parsed appointment data and runs configurable reports.
- `huddle.js` — EMIS CSV parsing (`parseHuddleCSV`) and huddle helpers.
- `demandPredictor.js`, `demand-recalibration.js`, `demand-parsers/` — the demand
  model and AskMyGP/Anima ingestion.
- `nhs-oc-ingest.js` — parses NHS England's online-consultation submissions dataset.
- `data.js` — staff groups, role inference (`guessGroupFromRole`) and buddy-cover
  defaults (`buddyDefaultsForRole`).
- `roomAllocation.js`, `capacity-patterns.js`, `teamnet.js`, `permissions.js`,
  `version.js`, `changelog.js`.

---

## Database migrations

Migrations live in `supabase/migrations/`. They **auto-apply** via
`.github/workflows/supabase-migrations.yml`, which runs `supabase db push
--include-all` on every push to `v4-rebuild` that touches `supabase/migrations/**`.
The command is idempotent, so **pushing a migration file is how you apply it** — there
is no manual apply step.

---

## Versioning & changelog

Semantic versioning (`MAJOR.MINOR.PATCH`) in `lib/version.js`, surfaced in the app
sidebar. Every change bumps the version and adds an entry to `lib/changelog.js`
(PATCH for fixes/tweaks, MINOR for features, MAJOR for breaking changes). The
in-app Changelog is rendered by `components/Changelog.js`.

---

## Deployment

Both streams deploy on Vercel. Pushing to `v4-rebuild` deploys to
`preview.gpdash.net` (and triggers the migration workflow); the production stream
deploys from its mainline branch to `gpdash.net`.
