# GPDash legal & compliance documentation

> **All documents in this directory are internal compliance artefacts.**
> Public-facing equivalents (privacy notice, sub-processors list) live in
> `/app/privacy/`. Contractual instruments (DPA template) live here as
> drafts; the signed copies for each practice should be filed separately
> under `/docs/legal/signed/` (gitignored).

## Status

| Document | Status | Last review |
|---|---|---|
| [Record of Processing Activities (RoPA)](./ropa.md) | Draft — implementation reflects current code | 2026-05-25 |
| [Data Processing Agreement template (DPA)](./dpa-template.md) | **DRAFT — requires legal review before use** | 2026-05-25 |
| [DPIA template](./dpia-template.md) | Blank worksheet ready for use | 2026-05-25 |
| [Breach notification procedure](./breach-notification.md) | Draft — internal procedure | 2026-05-25 |
| [SAR handling procedure](./sar-handling.md) | Draft — internal procedure | 2026-05-25 |
| [Information security policy](./security-policy.md) | Draft — internal policy | 2026-05-25 |
| [DSPT evidence pack](./dspt-evidence.md) | Draft — mapping of GPDash to DSPT controls | 2026-05-25 |

## How these fit together

GPDash has two parallel sets of GDPR obligations:

1. **As a controller** — for account holders' personal data (profiles, MFA,
   audit logs about the account holder themselves). The
   [RoPA](./ropa.md), [public privacy notice](/app/privacy/page.js),
   and [sub-processors list](/app/privacy/processors/page.js) cover this.

2. **As a processor** — for practice-scoped operational data (slot
   counts, working patterns, sync data from TeamNet). The practice is
   the controller; GPDash processes on their documented instructions.
   The [DPA template](./dpa-template.md) is the contractual instrument
   that formalises this relationship for each practice.

The other documents in this directory are operational procedures
(breach, SAR), policies (security), and supporting templates (DPIA,
DSPT) that apply across both roles.

## Pre-launch checklist

Before opening GPDash to practices outside Winscombe:

- [ ] Formal legal entity established and recorded in
      `lib/legal-meta.js` (`controllerName`, `controllerAddress`)
- [ ] Lawyer review of public [privacy notice](/app/privacy/page.js)
      complete; flip `LEGAL_META.privacyReviewedByLegal = true` to
      remove the draft banner
- [ ] Lawyer review of [DPA template](./dpa-template.md) complete;
      flag the version reviewed in the document header
- [ ] `privacy@gpdash.net` mailbox alias set up (distinct from
      `security@`)
- [ ] `CRON_SECRET` env var set in Vercel project settings so the
      retention cleanup job actually fires
- [ ] Cyber Essentials certification obtained (recommended — modest
      cost, single-day effort, expected by NHS-adjacent buyers)
- [ ] DSPT submission completed at the appropriate organisation type
      (see [DSPT evidence pack](./dspt-evidence.md))
- [ ] First signed DPA filed under `/docs/legal/signed/` (create
      directory + gitignore on first use)

## Review schedule

Annual review of every document above, plus ad-hoc review whenever:

- A new processing activity is added (update RoPA + privacy notice)
- A sub-processor is added, changed, or removed (update
  sub-processors page + RoPA + customer notification)
- Retention windows change (update `lib/retention-policy.js`,
  privacy notice, RoPA — all flagged in `retention-policy.js`)
- A breach occurs or is suspected (update breach procedure if any
  gaps surfaced)
- ICO guidance changes materially
