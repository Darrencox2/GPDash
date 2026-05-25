# DSPT evidence pack — GPDash

> The Data Security and Protection Toolkit (DSPT) is the NHS's
> self-assessment toolkit for organisations handling NHS data. This
> document maps GPDash's technical and organisational controls
> against the DSPT standards so that:
>
> 1. GPDash itself can complete a DSPT submission at the appropriate
>    organisation type when scaling to multiple practices
> 2. Practices using GPDash can include GPDash in their own DSPT
>    submission as a sub-processor / processor of operational data,
>    with concrete evidence to point to
>
> **Distribution:** May be shared with practices (and their IG officers)
> conducting due diligence on GPDash. Internal-facing version.
>
> **Last reviewed:** 2026-05-25
> **Next review due:** 2027-05-25
>
> **GPDash's DSPT status:** \[Not yet submitted — pending organisation
> registration\]
> **DSPT organisation code:** \[Pending\]
> **DSPT standard met:** \[Pending submission\]

---

## How to read this document

The DSPT is structured around 10 standards mapped to the National
Data Guardian's data security standards. For each, this document
sets out:

- **What the standard asks** (plain-language summary)
- **How GPDash meets it** (specific controls)
- **Evidence pointers** (where the evidence lives in the codebase or
  legal documentation)

If a practice's IG officer asks "how does GPDash handle X?", this
document should let you answer concretely and link them to the
underlying artefact.

---

## Standard 1 — Personal Confidential Data

> *All staff ensure that personal confidential data is handled, stored
> and transmitted securely, whether in electronic or paper form.*

### What it asks
- Personal data is only used for the purposes it was collected for
- Staff understand their responsibilities under data protection law
- Data is handled in line with the Caldicott principles

### How GPDash meets it
- GPDash deliberately does not process patient-identifying data;
  the operational data we hold is aggregate slot counts and
  clinician identifiers only
- Every access to personal data is logged
- Role-based access control limits what each user can see
- The DPA template formalises the purposes for which GPDash may
  process the practice's data

### Evidence
- `/docs/legal/ropa.md` — Records of processing activities (purposes
  listed per activity)
- `/docs/legal/dpa-template.md` Schedule 4 — Permitted Controller
  instructions
- `/lib/permissions.js` — Role-based access control implementation
- Audit log tables: `audit_events`, `auth_events`, `platform_audit_events`

---

## Standard 2 — Staff responsibilities

> *All staff understand their responsibilities under the National
> Data Guardian's Data Security Standards.*

### What it asks
- Staff complete data security training annually
- Staff understand how to report a breach
- Staff understand the consequences of mishandling data

### How GPDash meets it
- Current workforce is sole-operator (founder/operator), an NHS GP
  practice administrator subject to NHS confidentiality obligations
- Future staff will be required to complete data protection training
  before being granted access to production (committed in the
  Information Security Policy)
- The breach notification procedure is documented and accessible to
  all staff

### Evidence
- `/docs/legal/security-policy.md` Section 3 (Roles and responsibilities)
- `/docs/legal/security-policy.md` Section 5.6 (Staff onboarding and
  offboarding)
- `/docs/legal/breach-notification.md` — Breach notification procedure
- Training records: \[to be maintained when team > 1\]

---

## Standard 3 — Training

> *All staff complete appropriate annual data security training and
> pass a mandatory test.*

### Status
- Currently sole-operator; the operator self-certifies completion of
  the relevant NHS Digital data security awareness e-learning
  (\[reference number and date — to add\])
- When the team grows, all new staff will complete training before
  access; refresher annually

### Evidence
- Training completion records \[to be maintained\]
- Information Security Policy Section 5.6

---

## Standard 4 — Managing data access

> *Personal confidential data is only accessible to staff who need it
> for their current role and access is removed as soon as it is no
> longer required.*

### How GPDash meets it
- Practice-scoped access: each user only sees the practice(s) they
  are a member of
- Role within practice (owner / admin / user) controls what they can
  see and edit
- Row-level security on every table ensures the access rule is
  enforced at the database layer, not just the application
- Platform admin (a small number of GPDash internal users) has
  cross-practice read access for support purposes, with every
  cross-practice action logged separately to `platform_audit_events`
- Impersonation for support is recorded session-by-session in
  `impersonation_sessions` with the admin's stated reason
- Account deletion (self-service) removes user access immediately
- Account suspension (admin-initiated) blocks sign-in immediately
  while preserving data

### Evidence
- Migrations 003, 004, 014, 028, 029, 033, 035, 036, 039 (role,
  RLS, suspension, impersonation, membership management)
- `/lib/permissions.js`
- `/lib/admin-guard.js`
- `/app/api/v4/admin/impersonate/route.js`

---

## Standard 5 — Process reviews

> *Processes are reviewed at least annually to identify and improve
> processes which have caused breaches or near misses.*

### How GPDash meets it
- Breach notification procedure includes a "remediate" step requiring
  permanent fixes and procedure updates
- Annual review schedule documented for every legal/security artefact
- Breach log maintained per the breach procedure

### Evidence
- `/docs/legal/breach-notification.md` Section 5 (Recording) and
  Step 4 (Remediate)
- Per-document review schedules in each policy document
- \[Breach log: empty as of this version; created on first incident\]

---

## Standard 6 — Responding to incidents

> *Cyber-attacks against services are identified and resisted. CareCERT
> security advice is responded to.*

### How GPDash meets it
- Documented breach notification procedure with 72-hour ICO clock
- 48-hour commitment to Controllers (giving them 24h buffer)
- CSP violation reporting endpoint captures browser-level attack
  attempts
- Rate limiting on sensitive endpoints prevents brute-force attacks
- Failed sign-in attempts logged and rate-limited
- `security.txt` published for responsible disclosure
- NCSC alerts monitored \[commitment for ongoing operations\]

### Evidence
- `/docs/legal/breach-notification.md`
- `/app/api/csp-report/route.js` (CSP violation endpoint)
- `/lib/rate-limit.js` (rate limiting infrastructure)
- `/public/.well-known/security.txt`
- `/app/api/cron/retention-cleanup/route.js` and
  `/lib/retention-policy.js` (scheduled data hygiene)

---

## Standard 7 — Continuity planning

> *A continuity plan is in place to respond to threats to data
> security, including significant data breaches or near misses, and
> it is tested once a year as a minimum, with a report to senior
> management.*

### Status
- Continuity is currently limited by single-operator structure
- Primary risks identified:
  - Sub-processor outage (Supabase, Vercel) — depend on their SLAs
  - Sole-operator unavailability — \[to be addressed by adding a
    co-operator or formal succession arrangement before scaling
    customer base\]
- Backups: managed by Supabase per project plan; no independent
  off-site backup currently
- DR test schedule: \[to establish\]

### Evidence
- `/docs/legal/security-policy.md` Section 5.5 (Backups)
- Sub-processor SLAs referenced in `/app/privacy/processors/page.js`

### Acknowledged gap
The single-operator structure is a known continuity risk. This is
disclosed transparently to practices considering using GPDash and
should be the first thing addressed as the business grows.

---

## Standard 8 — Unsupported systems

> *No unsupported operating systems, software or internet browsers
> are used within the IT estate.*

### How GPDash meets it
- All production runtime is managed services (Supabase, Vercel,
  Upstash) — the underlying OS / runtime is the sub-processor's
  responsibility and they maintain currency
- Application code runs on Node.js — kept on a supported LTS version
- Dependencies are kept current; major framework upgrades scheduled
  rather than allowed to drift (recent example: Next.js 14 → 15
  upgrade in v4.24.0)
- Development workstation: \[operator's machine OS/browser to
  confirm — assumed Apple-supported macOS / current browser\]

### Evidence
- `package.json` (current Next.js / React versions)
- Changelog entries for framework upgrades
- Information Security Policy Section 4.8 (Vulnerability management)

---

## Standard 9 — IT protection

> *A strategy is in place for protecting IT systems from cyber threats
> which is based on a proven cyber security framework such as
> Cyber Essentials. This is reviewed at least annually.*

### How GPDash meets it
- Comprehensive HTTP security headers (HSTS, CSP, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, COOP, CORP)
- TLS-only transport, HSTS preload-eligible (pending submission)
- Authentication via Supabase Auth (managed service with own
  certifications)
- MFA enforced for platform admins
- Per-endpoint rate limiting via Upstash
- Input validation on every API route
- Row-level security on every personal data table
- Cyber Essentials certification: planned (see Security Policy
  Section 7)

### Evidence
- `next.config.js` (security headers)
- `/lib/rate-limit.js`
- `/lib/api-helpers.js` (validation helpers)
- All SQL migrations under `/supabase/migrations/` (RLS policies)
- Information Security Policy Sections 4 and 7

---

## Standard 10 — Accountable suppliers

> *IT suppliers are held accountable via contracts for protecting the
> personal confidential data they process.*

### How GPDash meets it
- Sub-processor list maintained at `/app/privacy/processors/page.js`
- Each sub-processor governed by their own data processing
  agreement (referenced in the RoPA)
- Sub-processor changes flow through the procedure in the DPA
  template (30-day notice to Controllers)
- Annual review of the sub-processor list

### Evidence
- `/app/privacy/processors/page.js` (public sub-processor list)
- `/docs/legal/ropa.md` (RoPA — sub-processor section)
- `/docs/legal/dpa-template.md` Schedule 3 (Sub-processors)
- `/docs/legal/dpa-template.md` Clause 4.4 (Sub-processor obligations)

---

## Annex A — Cross-reference table

| DSPT standard | Primary GPDash control | Documentation reference |
|---|---|---|
| 1 — Personal Confidential Data | Audit logging + RLS + minimal scope | `/docs/legal/ropa.md` |
| 2 — Staff responsibilities | Security policy + breach procedure | `/docs/legal/security-policy.md` |
| 3 — Training | Operator self-certified; team-growth commitment | `/docs/legal/security-policy.md` 5.6 |
| 4 — Managing data access | RLS + role-based access + audit | Migrations + `/lib/permissions.js` |
| 5 — Process reviews | Annual review schedule + breach close-out | Per-document review schedules |
| 6 — Responding to incidents | Breach procedure + CSP reports + rate limiting | `/docs/legal/breach-notification.md` |
| 7 — Continuity planning | Sub-processor SLA dependence (gap acknowledged) | Security policy 5.5 |
| 8 — Unsupported systems | Current LTS Node + active dependency management | Changelog |
| 9 — IT protection | Security headers + MFA + rate limiting | `next.config.js` etc. |
| 10 — Accountable suppliers | Sub-processor DPAs + DPA template | `/docs/legal/dpa-template.md` |

---

## Annex B — Acknowledged gaps

For transparency, the following are areas where GPDash does NOT
currently meet the maximum DSPT expectation. They are listed here to
make the gap available to any practice's IG officer rather than have
them discover it on their own:

| Gap | Current state | Plan |
|---|---|---|
| Cyber Essentials certification | Not held | Planned within 6 months |
| Penetration test | Not yet conducted | Annual, when customer base supports |
| Sole-operator continuity risk | One person | Address before broad rollout |
| Off-site backup independent of Supabase | None | Acceptable at current scale; revisit at scale |
| DSPT itself | Not yet submitted | Submit before broad rollout |
| Documented annual data security training (not self-certified) | Self-cert only | Formal training when team > 1 |

These gaps don't prevent existing pilot use, but should be addressed
before GPDash is offered widely to NHS practices that have their own
DSPT obligations.

---

## Annex C — Information governance questions practices commonly ask

### "Where is our data stored?"
Within the UK and EEA. Primary database in London (eu-west-2);
application hosting primarily in Frankfurt; rate-limiting in EU
region. See `/app/privacy/processors/page.js`.

### "Is our data encrypted?"
Yes. TLS in transit, AES-256 at rest in the primary database. See
Security Policy Section 4.3.

### "Who at GPDash can see our data?"
Only GPDash platform administrators, and only when needed for
support or operational reasons. Every cross-practice access is
logged to `platform_audit_events`. The "impersonation" capability —
where an admin signs in as a specific user to investigate an issue
— is session-by-session recorded with the admin's stated reason.

### "What happens if we leave?"
You can export all your data (including the data of every user in
your practice) at any time. After termination, your data is held
for 30 days for recovery, then permanently deleted unless an
alternative arrangement is agreed in writing.

### "Do you have a DPA we can sign?"
Yes — template at `/docs/legal/dpa-template.md`. Current status:
draft pending legal review. Available for signature once finalised.

### "Are you GDPR-compliant?"
We've implemented the controls UK GDPR requires for a controller of
account data and a processor of practice operational data. The full
set of documentation supporting this is in `/docs/legal/`. As with
any organisation processing personal data, compliance is a continuous
discipline rather than a one-time certification — we'd be happy to
discuss our approach with your IG officer.

### "Will you sign our DPA instead of yours?"
We're happy to discuss reasonable amendments to our template, or to
review and sign a practice-issued DPA, provided the substance meets
our standard practice. Material changes will be subject to legal
review on our side.

### "Do you carry cyber insurance?"
\[To confirm — recommended for operations.\]

### "Can we audit you?"
Yes — clause 4.9 of our DPA template sets out the audit terms. In
practice we'll usually offer to share our DSPT submission, this
document, and any third-party reports in lieu of an on-site audit,
which is the most common arrangement for SaaS at our scale.
