# GPDash — Architecture & Compliance Migration Plan

> The "big bang" sprint that takes GPDash from solo tool to compliant multi-tenant SaaS.
> Auth, Postgres, multi-practice, IG compliance — all in one major update.
> Target version: **v4.0.0**

---

## Current state (v3.4.0)

- Single shared password
- Single practice (Winscombe & Banwell)
- Redis blob storage (one giant JSON document)
- No user identity
- No audit trail with actors
- No data residency documentation
- No DPIA
- Vercel + Upstash hosting

## Target state (v4.0.0)

- Multi-tenant: many practices, isolated data
- Per-clinician login with proper role-based permissions
- Postgres with structured tables and row-level history
- Full audit trail with actor for every change
- DPIA, privacy notice, DPO contact
- Clinical safety case (DCB0129)
- Documented backup/restore
- Configurable retention policies
- Incident response process

---

## Phase 1 — Decisions & documentation (do first, no code)

These are decisions that constrain everything else. Get them right before building.

### 1.1 Hosting & infrastructure
- **Database** — Vercel Postgres? Supabase? Self-hosted on Hetzner?
  - Recommendation: **Supabase** (UK/EU region, integrated auth, RLS for multi-tenancy, generous free tier, easy migration path)
- **Region** — UK (London) or EU (Frankfurt)? Confirm UK personal data stays in UK
- **Backup** — what's the strategy? (Supabase has automated daily, point-in-time recovery on paid tier)
- **Redis** — keep Upstash for caching/sessions, or drop it entirely?
- **CDN/edge** — keep Vercel for hosting?

### 1.2 Authentication provider
- **Options**: Clerk, Supabase Auth, Auth.js, Auth0
- Must support: SSO (so practices can use NHSmail eventually), MFA, password reset, magic links, audit log of auth events
- Recommendation: **Supabase Auth** if Postgres is Supabase, **Clerk** otherwise
- Decision needed on: NHSmail SSO support, MFA enforcement for admin roles

### 1.3 Permission model
Three or four levels:
- **Practice owner / admin** — full access, billing, manages users, can delete practice
- **Manager / partner** — full read/write, manages staff register, settings
- **Clinician** — sees their own rota, today/forward, public buddy info, can leave notes on their own rota
- **(Optional) Receptionist** — read-only or limited, sees today/buddy/who's-in but not analytics

Decision: do we need 3 or 4 levels? Are there other roles?

### 1.4 Tenant isolation strategy
- **Row-level security (RLS)** in Postgres — every query filtered by `practice_id`
- Each practice gets a UUID
- All tables include `practice_id`
- Database policies enforce isolation even if app code has bugs

### 1.5 IG / governance documentation
Needs writing before launch:
- **Privacy notice** — what data we hold, lawful basis, retention, rights
- **Data processing agreement (DPA)** — for practices to sign as data controllers
- **DPIA** — data protection impact assessment
- **Clinical safety case** — DCB0129 hazard log + DCB0160 deployment guidance
- **Information security policy** — how access is controlled, breach response
- **Cookie policy** — even if minimal
- **Terms of service**
- **Acceptable use policy**

Decision needed: do we self-certify, or engage an IG consultant for review?

---

## Phase 2 — Data model design

### 2.1 Tables (proposed)

```sql
-- Tenancy
practices (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  ods_code TEXT, -- NHS practice code
  region TEXT,
  created_at TIMESTAMPTZ,
  subscription_tier TEXT, -- free, pro, enterprise
  retention_days INT DEFAULT 365
)

-- Users
users (
  id UUID PRIMARY KEY, -- matches auth provider's user ID
  email TEXT UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ,
  mfa_enabled BOOL
)

-- Membership (a user can be in multiple practices, e.g. locum)
practice_users (
  practice_id UUID REFERENCES practices,
  user_id UUID REFERENCES users,
  role TEXT, -- owner, admin, clinician, receptionist
  clinician_id UUID REFERENCES clinicians, -- NULL for non-clinical roles
  joined_at TIMESTAMPTZ,
  invited_by UUID REFERENCES users,
  PRIMARY KEY (practice_id, user_id)
)

-- Clinicians (replaces data.clinicians blob)
clinicians (
  id UUID PRIMARY KEY,
  practice_id UUID REFERENCES practices,
  name TEXT,
  initials TEXT,
  title TEXT,
  role TEXT,
  group_id TEXT, -- gp/nursing/allied/admin
  status TEXT, -- active/left/administrative
  buddy_cover BOOL,
  sessions INT,
  aliases TEXT[], -- alternative names matching CSV
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Working patterns (replaces clinician.workingPattern blob)
working_patterns (
  id UUID PRIMARY KEY,
  clinician_id UUID REFERENCES clinicians,
  effective_from DATE,
  effective_to DATE, -- NULL = current
  pattern JSONB, -- { mon: { am: 'in', pm: 'off' }, ... }
  created_at TIMESTAMPTZ,
  created_by UUID REFERENCES users
)
-- Note: history preserved by inserting new row with effective_from instead of UPDATE

-- Absences
absences (
  id UUID PRIMARY KEY,
  clinician_id UUID REFERENCES clinicians,
  start_date DATE,
  end_date DATE,
  reason TEXT,
  created_at TIMESTAMPTZ,
  created_by UUID REFERENCES users
)

-- Daily overrides (e.g. "in" on a usually-off day)
daily_overrides (
  clinician_id UUID REFERENCES clinicians,
  date DATE,
  am TEXT, -- in/off/null
  pm TEXT,
  created_at TIMESTAMPTZ,
  created_by UUID REFERENCES users,
  PRIMARY KEY (clinician_id, date)
)

-- Buddy allocations (replaces allocationHistory blob)
buddy_allocations (
  id UUID PRIMARY KEY,
  practice_id UUID REFERENCES practices,
  date DATE,
  allocations JSONB, -- the computed allocations
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES users
)
-- Indexed on (practice_id, date)

-- Settings (per-practice config)
practice_settings (
  practice_id UUID PRIMARY KEY REFERENCES practices,
  buddy_settings JSONB,
  huddle_settings JSONB,
  room_allocation JSONB,
  updated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users
)

-- CSV upload events
csv_uploads (
  id UUID PRIMARY KEY,
  practice_id UUID REFERENCES practices,
  uploaded_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES users,
  filename TEXT,
  rows_count INT,
  date_range_start DATE,
  date_range_end DATE,
  new_staff_count INT,
  raw_data JSONB -- the parsed CSV (or pointer to S3/blob)
)

-- Per-clinician notes (replaces data.rotaNotes blob)
rota_notes (
  clinician_id UUID REFERENCES clinicians,
  date DATE,
  note TEXT,
  updated_at TIMESTAMPTZ,
  updated_by UUID REFERENCES users,
  PRIMARY KEY (clinician_id, date)
)

-- Audit log (with actor!)
audit_events (
  id UUID PRIMARY KEY,
  practice_id UUID REFERENCES practices,
  user_id UUID REFERENCES users, -- the actor
  event_type TEXT, -- csv_upload, allocation_generated, settings_changed, etc.
  description TEXT,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ
)
-- Indexed on (practice_id, occurred_at DESC)

-- Auth events (separate, often required by IG)
auth_events (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  event_type TEXT, -- login, logout, mfa_challenge, password_reset, failed_login
  ip_address INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ
)

-- Subscription / calendar tokens (when we add this)
calendar_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  clinician_id UUID REFERENCES clinicians,
  token TEXT UNIQUE, -- opaque token in URL
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ -- NULL = active
)
```

### 2.2 Data we deliberately don't store

- **Patient data** — never. Only clinician names from the CSV
- **Appointment content** — only counts and slot types, never reasons or notes
- **EMIS credentials** — practices upload CSV manually; we never connect directly
- **Health data** — clinician absences are stored as date ranges with text reason. We should restrict reason to a controlled vocabulary (annual leave / training / unwell / other) rather than free text to avoid storing health data

### 2.3 Row-level security policies

Every query filtered by `practice_id` automatically. Example:

```sql
CREATE POLICY clinicians_isolation ON clinicians
  USING (practice_id IN (
    SELECT practice_id FROM practice_users WHERE user_id = auth.uid()
  ));
```

Plus role-based policies:
```sql
CREATE POLICY clinicians_write ON clinicians
  FOR INSERT, UPDATE, DELETE
  USING (
    practice_id IN (
      SELECT practice_id FROM practice_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );
```

---

## Phase 3 — Feature work needed

### 3.1 Auth flow
- Sign up — practice owner creates account, gets practice slot
- Invite users — owner/admin invites by email, link sent via auth provider
- First login — accept invite, set password / connect SSO
- MFA setup (required for admin/owner roles, optional for clinicians)
- Password reset
- Account recovery
- Session management — refresh tokens, sensible expiry

### 3.2 New screens
- **Onboarding** — practice setup wizard (name, ODS code, first clinician)
- **User management** — admin sees list of users, can invite/remove/change role
- **Audit log viewer** — already built, just needs to use new schema
- **Practice settings** — current settings page split: practice-wide vs personal
- **Account settings** — user's own profile, MFA, sessions, calendar tokens

### 3.3 Modified screens
- All existing screens need `practice_id` context
- Sidebar — show current practice, switcher if user is in multiple
- Today/Forward/Buddy/Rota — all queries filtered by practice
- "My Rota" needs to know which clinician the logged-in user IS

### 3.4 Migrations
- Export current Redis blob → seed Postgres for the existing practice
- Map current "shared password" to a single owner user for Darren
- Backfill audit log entries from `huddleCsvUploadedAt` and similar timestamps

---

## Phase 4 — Compliance work

### 4.1 DPIA (Data Protection Impact Assessment)
Required because we handle clinician personal data (name, working pattern, role). Sections:
- Description of processing
- Necessity & proportionality
- Risks to individuals
- Mitigations
- Sign-off

Template available from ICO. Probably 4-6 hours to complete.

### 4.2 Clinical safety
- **DCB0129** (manufacturer) — we make the software, so we're a manufacturer
- **DCB0160** (deployment) — practices deploy it
- Hazard log: things that could go wrong
  - Wrong duty doctor identified → patient call routed wrongly (low impact, mitigation: human verification at huddle)
  - Stale CSV → planning based on outdated data (low impact, mitigation: prominent freshness indicator)
  - Service outage → practice can't see today's plan (low impact, mitigation: fallback to email/paper)
- Hazard log probably 2-3 days of careful work, plus a clinical safety officer (CSO) sign-off — could be the practice's existing CSO initially

### 4.3 IG documentation pack
- Privacy notice (public-facing on /privacy)
- DPA template (for practices to sign)
- Cookie banner if we add any non-essential cookies
- Acceptable use
- Terms of service
- Vendor list (Supabase, Vercel, Upstash if kept) with their certifications

### 4.4 Security
- HTTPS enforced (already)
- Security headers (CSP, HSTS, X-Frame-Options)
- Rate limiting on auth endpoints
- Brute force protection (auth provider handles)
- Secret rotation process
- Penetration test before pilot launch (rough cost £2-5k for a basic web app pen test, or skip for now and document the gap)

### 4.5 Incident response
- Plan for: data breach, service outage, accidental data exposure
- 72-hour breach notification per GDPR
- Practice contact list for emergencies
- Status page (statuspage.io has a free tier)

---

## Phase 5 — Commercial readiness

Not strictly v4.0 but worth thinking about while planning:

- **Pricing model** — per practice? per user? per clinician? freemium?
- **Stripe integration** — billing
- **Sales site** — separate from the app, marketing site at gpdash.net with pricing/features
- **Onboarding video / docs** — practices won't read 50 pages
- **Support process** — email? Intercom? Slack?
- **Customer success** — help practices actually use the data
- **Reference customer** — Winscombe & Banwell could be the case study

---

## Suggested implementation order

When you're ready to start:

**Sprint 1 (one weekend) — Foundation**
- Set up Supabase project, define schema, write RLS policies
- Set up auth provider, build sign-up/login/invite flow
- Build practice creation flow

**Sprint 2 (one weekend) — Migration**
- Export Redis blob → Postgres seed script
- Make existing app code work against Postgres instead of Redis
- Test that nothing breaks for the existing practice

**Sprint 3 (one weekend) — Multi-tenant polish**
- Practice switcher in sidebar
- User management screens
- Refactor settings into practice-wide vs personal
- Update audit log to record actor

**Sprint 4 (one weekend) — Compliance docs**
- Write DPIA
- Write privacy notice & DPA
- Hazard log
- Set up status page

**Sprint 5 (one weekend) — Pilot prep**
- Find a second practice willing to pilot
- Onboarding flow polish
- Support process
- Backup/restore tested

Total: ~5 weekends of focused work. Doable.

---

## Open questions to think about

1. **Single-tenancy fallback** — should we offer "self-hosted GPDash" for paranoid practices? More work.
2. **NHSmail SSO** — long-term goal but complex (NHS Identity is a federated system). Defer to v4.1.
3. **EMIS direct integration** — would remove the manual CSV step. Requires EMIS partner programme. Big revenue lever but big effort. Defer.
4. **Training mode / sandbox** — can a practice test without affecting their real data? Probably yes — separate practice instance flag.
5. **Data export** — practices must be able to take their data with them. CSV/JSON export of everything by practice owner.
6. **Right to be forgotten** — when a clinician leaves, what happens to their data? Anonymise after retention period? Hard delete? Decision needed.
7. **Auditor / inspector mode** — read-only super-user for CQC inspections. Probably not needed at pilot stage.

---

## Risks to plan for

- **Migration goes wrong** — back up current Redis blob to a JSON file before any migration. Keep it for a year.
- **Auth provider lock-in** — Clerk and Supabase Auth both export users, so reasonable.
- **Supabase outage** — same risk as Upstash today. Vercel hosts the app but DB is separate.
- **Scope creep during the rebuild** — easy to want to add features. Hard rule: feature parity first, new features second.
- **Existing CSV format changes** — EMIS might change format. Build the parser to be tolerant.

---

## When to start

Triggers that say "now is the time":
- Another practice asks if they can use it
- Darren has 5+ free weekends in a row
- Current Redis approach hits a real limit (data corruption, scale issue)

Triggers that say "wait":
- Still iterating heavily on features at Winscombe
- Not sure if anyone else wants it
- Major life events (don't build SaaS during chaos)

---

*Last updated: 2026-04-26*
