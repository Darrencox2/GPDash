# Information security policy

> Internal policy. This is the headline information security policy
> for GPDash. It cross-references the technical and operational
> controls implemented elsewhere in the codebase and in the legal
> documentation directory.
>
> **Scope:** All GPDash systems, all personal data processed by
> GPDash, all GPDash staff.
>
> **Owner:** GPDash founder/operator (currently sole party)
>
> **Last reviewed:** 2026-05-25
> **Next review due:** 2027-05-25 (or sooner on material change)

---

## 1. Purpose

This policy sets out the principles GPDash applies to keep personal
data secure. It exists to:

- Protect the personal data we process from loss, alteration, and
  unauthorised access
- Meet our obligations under the UK GDPR, the Data Protection Act
  2018, and the NHS Data Security and Protection Toolkit (DSPT)
- Demonstrate to practices and their information governance officers
  that GPDash takes security seriously and applies recognised
  practices

---

## 2. Principles

### 2.1 Defence in depth

Every category of personal data is protected by multiple,
independent controls. A failure of any one control should not
expose data. We do not rely on a single layer (e.g. "we trust the
network") for confidentiality.

### 2.2 Least privilege

Every user, every service, every process has only the access it
needs to do its job. Privilege is granted by exception, not by default.

### 2.3 Data minimisation

We collect only the personal data we need, keep it only for as long
as we need it, and design new features to minimise the scope of data
collected. Retention windows are enforced automatically (see
`/lib/retention-policy.js`).

### 2.4 Auditable

Every operation that modifies personal data is logged. Every
administrative action is logged. Every authentication event is
logged. Logs are append-only and retained per the retention policy.

### 2.5 Transparent

Users know what we hold, why we hold it, how long for, and how to
exercise their rights. The public privacy notice and the
sub-processors list are the primary surfaces.

### 2.6 Fail closed

Where a control fails, the default behaviour should be to deny access
rather than grant it. Examples: if the authentication service is
unavailable, no one is signed in (rather than everyone being
implicitly admitted); if rate limiting can't be enforced because of
a Redis outage, the application falls back to safe defaults.

### 2.7 Recoverable

We maintain backups sufficient to restore service after the
plausible failure modes (sub-processor outage, data corruption,
ransomware). Backups inherit the same geographic and access
restrictions as primary data.

---

## 3. Roles and responsibilities

| Role | Responsibility |
|---|---|
| Founder / Operator | Overall accountable; reviews this policy annually; approves material changes; acts as Incident Lead in the breach procedure |
| Future engineering staff | Implement code in line with this policy; raise security concerns; complete data protection training before being granted access to production |
| Future operations staff | Operate production systems in line with this policy; respond to incidents per the breach procedure |
| Data subjects | Inform GPDash promptly of any suspected security issue |
| Practices (controllers) | Use the Service responsibly; choose strong passwords; enable MFA; keep their own staff's access lists current |

---

## 4. Technical controls

The following technical controls are in place as of the last review
date. The code-level implementation is the authoritative source —
this section summarises the policy.

### 4.1 Authentication and access

- All access requires authenticated sign-in via email and password
- Passwords are hashed by Supabase Auth (we never see plaintext)
- MFA (TOTP) is **enforced** for platform administrators and is
  available for any user
- Sessions are issued via Supabase Auth using short-lived JWTs with
  refresh tokens
- All session cookies are HTTP-only, Secure, and SameSite=Lax
- Failed sign-in attempts are rate-limited and logged
- Password reset uses Supabase Auth's secure recovery flow

### 4.2 Authorisation

- Row-level security (RLS) is enforced on every table containing
  personal data — users can only see data their role and practice
  membership entitles them to
- API routes perform application-level authorisation checks in
  addition to RLS as defence in depth
- Platform admin operations are gated behind a `requireAdmin` helper
  that enforces the four-step gate: signed in → platform admin →
  MFA enrolled → AAL2

### 4.3 Encryption

- All network traffic uses TLS (HTTPS)
- HTTP Strict Transport Security (HSTS) is enforced with a 2-year
  max-age and the `includeSubDomains` directive
- Data at rest in Supabase Postgres is encrypted using AES-256
- Database backups inherit the same encryption

### 4.4 Network and application security

- Content Security Policy locks down what the browser is allowed to
  load
- X-Frame-Options: DENY + CSP frame-ancestors directive prevent
  clickjacking
- All API routes use input validation (UUID format checks, email
  format checks, etc.) before passing values to the database
- Per-endpoint rate limiting prevents abuse of expensive operations
- CSP violation reports are logged for review

### 4.5 Audit and logging

- Every modification to practice data is logged to `audit_events`
- Every authentication event is logged to `auth_events`
- Every platform admin action is logged to `platform_audit_events`
- Logs are append-only at the database policy level (no UPDATE/DELETE
  policies on the audit tables)
- Logs are retained per `/lib/retention-policy.js` and deleted by a
  scheduled cleanup job

### 4.6 Sub-processor security

- Sub-processor list at `/app/privacy/processors/page.js`
- All sub-processors operate in the UK or EEA
- We rely on each sub-processor's own SOC 2 / ISO 27001 / equivalent
  attestations for their internal controls; copies referenced in
  the RoPA
- Sub-processor changes follow the procedure in the DPA template
  (30-day notice to controllers)

### 4.7 Data lifecycle

- Personal data has a defined retention window per category (see
  `/lib/retention-policy.js`)
- Retention is enforced by a scheduled cleanup job running daily at
  03:00 UTC
- Users can export and delete their own data through built-in
  self-service
- On practice termination, data is held for 30 days then permanently
  deleted unless an alternative arrangement is made

### 4.8 Vulnerability management

- Dependencies are kept current; major framework upgrades are
  scheduled rather than allowed to drift
- Security advisories are monitored via npm audit and Dependabot
- A `security.txt` file is published at
  `/.well-known/security.txt` for responsible disclosure
- Penetration testing target: annual third-party assessment once
  customer base supports the cost

---

## 5. Operational controls

### 5.1 Source control

- All code is held in a private GitHub repository
- Commits require contributor identification (signed commits or
  documented authorship)
- Production deployments only occur from the `main` branch (when v3
  is in production) or `v4-rebuild` branch (during the v4 rollout)
- Branch protections prevent direct pushes to deployment branches
  without review \[future: enforce when team size justifies\]

### 5.2 Secrets management

- Production secrets (Supabase service role, database credentials,
  sub-processor API keys, CRON_SECRET, etc.) are held only in Vercel
  environment variables
- Secrets are never committed to source control
- The `.gitignore` excludes common secret-file patterns
- Secret rotation: triggered by departure of staff with access, by
  any suspected exposure, and otherwise at least annually

### 5.3 Change management

- Every production change goes through code review (future: when
  team size > 1)
- Migrations are reviewed for impact on data integrity and security
  before being merged
- Breaking changes are flagged in the changelog
- Database schema changes are versioned via numbered migration files
  in `/supabase/migrations/`

### 5.4 Incident response

- A documented breach notification procedure governs response to
  suspected or confirmed Personal Data Breaches
  (`/docs/legal/breach-notification.md`)
- Out-of-hours coverage: currently sole-operator, with monitoring
  alerts going to email + phone; expand as the team grows

### 5.5 Backups

- Database backups are managed by Supabase per their standard policy
  for the project plan in use
- We do not currently maintain off-site backups independent of
  Supabase; this is a tradeoff in favour of simplicity at current
  scale, to be revisited if the customer base grows beyond a level
  where the loss of Supabase availability would be tolerable

### 5.6 Staff onboarding and offboarding

When staff are added:
- Sign confidentiality and data protection terms before access
- Complete data protection training appropriate to their role
- Receive access provisioned on least-privilege basis
- Have access logged for inclusion in future audits

When staff leave:
- All credentials revoked within 24 hours of departure
- All sessions invalidated
- Access logs reviewed for any concerning patterns prior to departure
- Where access was held to production secrets, those secrets are
  rotated

### 5.7 Acceptable use

GPDash systems may only be used:

- For GPDash business purposes
- In line with applicable laws
- In line with this policy and the procedures referenced from it

The following are explicitly prohibited:
- Accessing personal data for personal curiosity or reasons unrelated
  to a legitimate operational need
- Sharing credentials between staff
- Storing personal data on personal devices unless explicitly
  authorised
- Using personal email accounts for work-related communication
  containing personal data

---

## 6. Compliance and accountability

### 6.1 Documentation

The following documents form the GPDash compliance baseline:

- [RoPA](./ropa.md) — record of processing activities
- [Privacy notice](/app/privacy/page.js) — public-facing
- [Sub-processors list](/app/privacy/processors/page.js) — public-facing
- [DPA template](./dpa-template.md) — practices sign this
- [DPIA template](./dpia-template.md) — used when scope changes
- [Breach notification procedure](./breach-notification.md)
- [SAR handling procedure](./sar-handling.md)
- [DSPT evidence pack](./dspt-evidence.md)
- This Information Security Policy
- [Retention policy in code](/lib/retention-policy.js)

### 6.2 Reviews

- This policy is reviewed annually by the policy owner
- An out-of-cycle review is triggered by any of:
  - Material change to the technical architecture
  - A reportable Personal Data Breach
  - A change in applicable law or guidance
  - A change in the staff structure
  - A material new sub-processor

### 6.3 Reporting

- All staff are responsible for reporting suspected security issues
  or policy violations to the policy owner
- Reports may be made anonymously where the reporter prefers
- Retaliation against good-faith reports is itself a policy violation

---

## 7. Certifications

| Certification | Status | Notes |
|---|---|---|
| Cyber Essentials | Not yet obtained — planned | Achievable in a single day at modest cost; expected by NHS-adjacent buyers |
| Cyber Essentials Plus | Not yet obtained | More involved (third-party verification); a step up from Cyber Essentials |
| ISO 27001 | Not in scope | Out of scale for current operations; revisit if/when customer base grows |
| DSPT | See `/docs/legal/dspt-evidence.md` | Self-assessment toolkit; status to be updated when submitted |
| NHS DTAC | See [DTAC mapping](#) when prepared | Application-level standard for NHS digital products |

---

## 8. Disclosures

This policy is a policy, not a guarantee. No security regime
eliminates risk entirely. GPDash commits to applying these controls
in good faith and to continuous improvement, and to transparency
when things go wrong.
