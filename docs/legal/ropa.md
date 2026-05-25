# Record of Processing Activities (RoPA)

> **UK GDPR Article 30 record.** Internal compliance document. Not for
> public distribution; the public-facing version is the Privacy Notice
> at `/privacy`. Keep this updated whenever a new processing activity
> is added, retained, or removed.

**Controller:** _[LEGAL ENTITY NAME — to confirm]_
**Trading as:** GPDash
**Registered address:** _[ADDRESS — to confirm]_
**Privacy contact:** security@gpdash.net
**DPO appointed?** No — not required under UK GDPR Art. 37 (no large-scale
processing of special category data; aggregate operational data only).
A designated privacy contact is maintained via security@gpdash.net.
**Last reviewed:** 2026-05-19
**Next review due:** 2027-05-19 (or sooner if processing changes)

---

## Scope: controller vs processor

GPDash plays two roles depending on the data category:

| Role | Data | Lawful basis (Art 6) |
|---|---|---|
| **Controller** | Account holder personal data (profiles, MFA, auth + audit events about the account holder themselves) | (b) Contract; (f) Legitimate interest |
| **Processor** | Practice-scoped operational data uploaded via EMIS CSV (slot counts per clinician per date — no patient identifiers) | The practice (= controller) determines the lawful basis; GPDash processes on documented instruction via the DPA |

This RoPA covers GPDash's controller activities. The practices' own RoPAs
cover their use of GPDash as a processor; a DPA (Data Processing
Agreement) is the contractual instrument that governs that boundary —
template at `/docs/legal/dpa-template.md` (see Phase 4 backlog).

---

## Processing activities

### 1. Account management

| Field | Value |
|---|---|
| **Purpose** | Create and maintain GPDash user accounts so practice staff can sign in, manage their practice, and exercise their rights |
| **Data subjects** | Practice staff (administrators, owners, optionally linked clinicians) and GPDash platform admins |
| **Categories of personal data** | Email address, full name, password hash (managed by Supabase Auth, never visible to us), self-declared role within the practice, account creation date, last sign-in timestamp |
| **Recipients** | Supabase (auth + database hosting, see sub-processor list) |
| **Lawful basis (Art 6)** | (b) Necessary for performance of a contract — i.e. providing the GPDash service the user signed up for |
| **Retention** | For the life of the account. On user-initiated deletion (Account Settings → Delete my account), profile + memberships are deleted within seconds. On extended inactivity (12+ months no sign-in), the account is queued for deletion after a 30-day warning email |
| **Source of data** | Direct from the data subject at sign-up |
| **International transfers** | Supabase eu-west-2 (London) — no international transfer |
| **Security** | TOTP MFA enforced for platform admins; rate-limited sign-in; HTTPS with HSTS; CSP; per-row RLS in the database |

### 2. Authentication and security event logging

| Field | Value |
|---|---|
| **Purpose** | Detect and investigate unauthorised access; demonstrate to practices that their data is protected; support DSPT-aligned audit requirements |
| **Data subjects** | Anyone attempting to authenticate (account holders, failed sign-in attempts) |
| **Categories of personal data** | Event type (login / failed login / signup / logout / password change / MFA enrolled / MFA failed / etc.), user ID (where known), email at time of event, IP address, user-agent, timestamp, event-specific details (e.g. reason for password change) |
| **Recipients** | Supabase (storage only); no third-party SIEM at this time |
| **Lawful basis (Art 6)** | (c) Compliance with legal obligation (UK Data Protection Act 2018 + practice DSPT requirements); (f) Legitimate interest in account security |
| **Retention** | 1 year for routine auth_events; 7 years for security incidents flagged via incident response |
| **Source of data** | System-generated at the time of the auth event |
| **International transfers** | None — same Supabase region as account data |
| **Security** | Service-role write only via `log_auth_event()` RPC; platform-admin read only; append-only (no UPDATE / DELETE policies on `auth_events`) |

### 3. Practice membership

| Field | Value |
|---|---|
| **Purpose** | Link account holders to practices, with their role within that practice (owner / admin / user) — determines what data they can see and edit |
| **Data subjects** | Practice staff |
| **Categories of personal data** | User ID, practice ID, role, who invited them, invitation timestamp, optional flag for "non-clinical" |
| **Recipients** | Supabase |
| **Lawful basis (Art 6)** | (b) Contract |
| **Retention** | For the life of the membership. Removed when the user leaves the practice or the user's account is deleted (cascade) |
| **Source of data** | Initially the practice owner (during invitation); subsequently the data subject themselves (e.g. opting in/out of non-clinical) |
| **International transfers** | None |
| **Security** | RLS enforces that users can only see practices they belong to; only owners can change roles; SQL triggers prevent removal of the last owner |

### 4. In-practice audit log

| Field | Value |
|---|---|
| **Purpose** | Maintain an audit trail of who changed practice configuration (slot filters, working patterns, demand model settings, etc.) so practice owners can review activity, and so practices can satisfy DSPT audit requirements |
| **Data subjects** | Practice staff (as actor) |
| **Categories of personal data** | Actor user ID, practice ID, event type, free-text description, JSON details specific to the event, timestamp |
| **Recipients** | Supabase |
| **Lawful basis (Art 6)** | (f) Legitimate interest in audit and accountability (practice's interest, supported by their DSPT); (c) where the practice has a regulatory record-keeping obligation |
| **Retention** | 7 years (NHS records management code retention period for clinical operational records) |
| **Source of data** | System-generated at the time of the change |
| **International transfers** | None |
| **Security** | RLS limits reads to platform admins + practice admins of that practice; service-role write only; append-only |
| **Erasure handling** | On account deletion, `user_id` is set to NULL (anonymised). The audit row survives to preserve audit integrity but no longer identifies the deleted person |

### 5. Platform audit log

| Field | Value |
|---|---|
| **Purpose** | Audit trail of platform admin actions (suspending users, generating admin links, uploading NHS baseline data, etc.) and GDPR subject-access / erasure requests |
| **Data subjects** | Platform admins (as actor); affected users (as target) |
| **Categories of personal data** | Actor user ID, action (enum), target user ID, target email (denormalised), description, JSON details, IP address, user-agent, timestamp |
| **Recipients** | Supabase |
| **Lawful basis (Art 6)** | (c) Legal obligation (GDPR Art 30 — record keeping); (f) Legitimate interest in admin accountability |
| **Retention** | 7 years (mirrors NHS audit retention) |
| **Source of data** | System-generated when a platform admin operation runs |
| **International transfers** | None |
| **Security** | Service-role write via `log_platform_audit_event()` RPC; platform-admin read only; append-only |
| **Erasure handling** | When an account is deleted, `actor_user_id` and `target_user_id` are set to NULL but `target_email` may be preserved on the deletion record itself (legitimate interest — we need a record that the deletion request was honoured, even if all other identifiers of the data subject are removed) |

### 6. Impersonation (admin support)

| Field | Value |
|---|---|
| **Purpose** | Allow a platform admin to sign in as a specific user to investigate or resolve a reported issue, with a full audit trail of the session |
| **Data subjects** | Platform admin (as actor); the impersonated user (as target) |
| **Categories of personal data** | Admin user ID, target user ID, started_at, ended_at, free-text reason given by the admin, IP address |
| **Recipients** | Supabase |
| **Lawful basis (Art 6)** | (f) Legitimate interest in providing technical support, balanced against the impersonated user's interest in their account integrity — mitigated by a red banner displayed at all times during impersonation showing admin + target identity, plus full session logging |
| **Retention** | 7 years (audit) |
| **Source of data** | The admin (reason); the system (everything else) |
| **International transfers** | None |
| **Security** | The session is bounded by an HttpOnly cookie containing the session ID; ending the session is one click; the impersonated user can detect it from the banner if they were to look |
| **Erasure handling** | Session row survives with both user_id columns set to NULL on deletion |

### 7. MFA factor management

| Field | Value |
|---|---|
| **Purpose** | Enroll, verify, and revoke TOTP-based MFA factors |
| **Data subjects** | Account holders who enable MFA (mandatory for platform admins) |
| **Categories of personal data** | Factor ID, factor type (TOTP), friendly name, enrolment + last-verified timestamps, encrypted TOTP secret (held by Supabase Auth, never seen by GPDash app code) |
| **Recipients** | Supabase Auth (managed service) |
| **Lawful basis (Art 6)** | (b) Contract; (f) Legitimate interest in account security |
| **Retention** | For the life of the factor (until the user removes it) |
| **Source of data** | Direct from the data subject during enrolment |
| **International transfers** | None |
| **Security** | Supabase manages secret storage; GPDash app code never reads the TOTP secret; the QR code shown at enrolment is rendered inline and not persisted |

### 8. Rate-limiting buckets

| Field | Value |
|---|---|
| **Purpose** | Throttle abusive request patterns at the API level (per-user or per-IP) |
| **Data subjects** | Anyone hitting rate-limited endpoints |
| **Categories of personal data** | User ID or IP address (depending on endpoint), endpoint key, request count, window start timestamp |
| **Recipients** | Upstash (Redis service) |
| **Lawful basis (Art 6)** | (f) Legitimate interest in service availability and security |
| **Retention** | Sliding window of 1 minute (varies per endpoint, max 1 hour); automatic TTL eviction |
| **Source of data** | System-generated at request time |
| **International transfers** | Upstash region — see sub-processor list |
| **Security** | Keyed by hashed identifier; no event content stored; counter resets within minutes |

### 9. CSP violation reports

| Field | Value |
|---|---|
| **Purpose** | Detect XSS injection attempts and misconfigurations against our Content Security Policy |
| **Data subjects** | Browsers reporting violations (often anonymous; sometimes browsers attach session-ish context) |
| **Categories of personal data** | Source URL, blocked URI, violated directive, sample script content. IP address is **not** logged for CSP reports |
| **Recipients** | Stored in GPDash app logs only; not forwarded to any third party |
| **Lawful basis (Art 6)** | (f) Legitimate interest in security |
| **Retention** | 30 days of Vercel function logs |
| **Source of data** | Browsers conforming to the CSP Level 3 reporting standard |
| **International transfers** | None |
| **Security** | Endpoint is rate-limited (30/min/IP); extension-noise filtered out before logging |

### 10. Subject access + erasure handling

| Field | Value |
|---|---|
| **Purpose** | Allow users to exercise their GDPR Articles 15 (access) and 17 (erasure) rights via in-product features |
| **Data subjects** | Account holders making rights requests |
| **Categories of personal data** | Whatever is in the user's archive (effectively a copy of all of the above for that user) |
| **Recipients** | The data subject only |
| **Lawful basis (Art 6)** | (c) Legal obligation |
| **Retention** | Each export request is itself logged to `platform_audit_events` with no payload — only the request metadata. Retention follows the platform audit log (7 years) |
| **Source of data** | Aggregated from all of the activities above |
| **International transfers** | None — file generated server-side, streamed to the data subject's browser |
| **Security** | 5/min per-user rate limit; auth required; logged for accountability |

---

## Categories of sub-processors

See `/privacy/processors` (public sub-processors list) for the
operational version. Detailed agreements live in
`/docs/legal/sub-processor-agreements/` (Phase 4 backlog).

| Sub-processor | Role | Region | Standard contractual clauses required? |
|---|---|---|---|
| **Supabase** | Auth + Postgres database | eu-west-2 (London) | No (UK) |
| **Vercel** | Application hosting (server functions + static assets) | Frankfurt fra1 region by default | No (EU) — verify production region matches |
| **Upstash** | Redis for rate limiting | EU region (to verify in account settings) | No if EU; SCC if US fallback |
| **Bunny Fonts** | CSS web font delivery (drop-in replacement for Google Fonts) | EU/EEA hosted, no IP logging declared in their privacy notice | No |
| **Open-Meteo** | Weather forecast data for the demand predictor (passes practice location + date; no personal data sent) | EU | No — anonymous query |

> _Note on Anthropic / Claude:_ Used by the developer (Darren) during
> development; not part of the production data flow. No GPDash production
> data is sent to Anthropic. Not listed as a sub-processor.

---

## Risk assessments

- **DPIA required?** Not currently triggered under ICO criteria — GPDash
  does not process large-scale special category data, no automated
  decision-making with legal effect, no large-scale systematic monitoring.
  If GPDash later adds features that would trigger DPIA criteria (e.g.
  patient-level data import, automated triage suggestions), one will be
  conducted before deployment.

- **Transfer impact assessment (TIA)?** Not required for current
  sub-processor list (all EU/UK). To be re-evaluated if any sub-processor
  is replaced with a US-hosted equivalent.

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-05-19 | Initial RoPA — covers controller activities 1–10 plus sub-processor list. Created as part of v4.26.0 GDPR Phase 1 | _[Darren]_ |

---

**Review schedule:** Annual, or sooner on any material change to
processing activities or sub-processors.
