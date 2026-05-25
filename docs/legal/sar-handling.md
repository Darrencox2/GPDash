# Subject rights request handling procedure

> Internal operating procedure. Covers how GPDash handles Subject
> Access Requests (SARs) and other data subject rights requests under
> the UK GDPR.
>
> **Distribution:** All GPDash staff with operational responsibilities.
>
> **Last reviewed:** 2026-05-25
> **Next review due:** 2027-05-25

---

## 1. Self-service vs assisted

GPDash provides built-in self-service mechanisms for the principal
data subject rights:

| Right | Built-in path | Article |
|---|---|---|
| Access | Account Settings → Data & privacy → Download JSON | Art 15 |
| Rectification | Account Settings (edit profile) | Art 16 |
| Erasure | Account Settings → Data & privacy → Delete my account | Art 17 |
| Portability | Same as Access (the JSON archive is machine-readable) | Art 20 |

Most requests should be handled by the user themselves through these
mechanisms. This procedure covers the cases that CAN'T be handled
self-service:

- The user can't sign in (forgotten password, lost MFA, account locked
  out) and needs help to get to the self-service interface
- The user is requesting on a different basis to what the built-in
  mechanism provides (e.g. data in a specific format other than JSON)
- The user is exercising a right we don't provide self-service for
  (restriction Art 18, objection Art 21, decisions about automated
  processing Art 22)
- The request comes from a third party authorised by the user
  (e.g. a solicitor)
- The user has died, and a personal representative is requesting on
  their behalf

---

## 2. Where requests arrive

| Channel | Triage |
|---|---|
| `privacy@gpdash.net` | Primary channel — should be the documented contact in the privacy notice |
| `security@gpdash.net` | Sometimes mis-routed here. Forward to privacy@ |
| In-product support form | (Future) Forwards to privacy@ |
| Postal | Rare. Scan, log, then process as below |
| Verbally (phone, in person) | Acknowledge and request written follow-up to privacy@ for clarity |

Every request must be logged in the SAR register (Section 7) within
1 working day of receipt.

---

## 3. Statutory timeline

- **Acknowledgement:** No formal requirement, but acknowledge within
  3 working days as good practice
- **Response:** **Within one calendar month** of receipt (UK GDPR
  Art 12(3))
- **Extension:** May be extended by a further two months where requests
  are complex or numerous (UK GDPR Art 12(3)) — must inform the data
  subject of the extension within the original month, with reasons
- **Refusal:** May refuse manifestly unfounded or excessive requests,
  but must inform the data subject without delay and explain their
  right to complain to the ICO

The one-month clock starts the day of receipt, not the next working
day.

---

## 4. Identity verification

Before responding to any request, confirm the identity of the requester
to a level proportionate to the sensitivity of the request.

### 4.1 Standard verification

For requests where the requester is the apparent account holder:

- Request that the data subject send the request from the email
  address registered to their GPDash account, OR
- Ask them to confirm two pieces of information that should be known
  only to them (e.g. the practice slug they belong to, the date they
  signed up, the name of a clinician they linked themselves to)

Do **not** ask for forms of identification (passport, etc.) unless
you have grounds to doubt the requester's identity. Over-asking for
ID is itself a data protection issue.

### 4.2 Third-party representatives

If the request comes from a solicitor, advocate, or other
representative:

- Require sight of a signed authority from the data subject naming
  the representative
- Verify the authority is dated within the past 12 months
- Where there is any doubt, confirm with the data subject directly

### 4.3 Personal representatives of deceased data subjects

UK GDPR does not apply to personal data of deceased persons, so a
strict legal SAR doesn't apply. However, GPDash should respond to
reasonable requests from documented personal representatives where:

- The estate provides evidence of the death (death certificate
  reference) AND
- The estate provides evidence of the representative's authority
  (grant of probate, letters of administration, or equivalent)

The response should be limited to what's needed to discharge the
estate's functions; do not provide access to operational data that
would expose other living individuals.

---

## 5. Scope of an access request

By default, treat a SAR as a request for ALL personal data we hold
on the requester. The built-in JSON export covers:

- Profile (name, email, role, created_at)
- Practice memberships (each with role)
- MFA factors (metadata only — never the TOTP secret)
- Auth events (logins, logouts, MFA events)
- In-practice audit events as actor
- Platform audit events as actor or target
- Impersonation sessions as admin or target

A SAR might extend further:

- Free-text fields containing the requester's name elsewhere in the
  database (e.g. clinician notes, audit log details JSONB) — these
  need a database search. Document the search query used
- Email communications — if the request includes correspondence with
  privacy@ or security@, those should be included
- Logs that aren't routinely surfaced — e.g. Vercel HTTP logs (30-day
  retention) may contain the user's IP address against URL hits

The third-party data exception applies: if responding would disclose
information about another identifiable individual, that information
should be redacted unless the other individual has consented OR it's
reasonable in the circumstances to comply without consent.

---

## 6. Other rights — handling notes

### 6.1 Rectification (Art 16)

If the data is wrong:

- For self-editable fields (profile name, etc.), direct the requester
  to the relevant page in the product
- For derived fields (audit logs, etc.), record the dispute but
  generally don't alter audit data — explain that audit records reflect
  what happened at the time and instead create a contemporaneous
  correction note linked to the original
- Inform any third parties to whom we've previously disclosed the
  inaccurate data, where this is possible and not disproportionate
  (Art 19)

### 6.2 Restriction (Art 18)

A request to restrict processing applies in narrow circumstances:

- The data subject contests accuracy (restriction lasts until accuracy
  is verified)
- Processing is unlawful but the subject opposes erasure
- The data is no longer needed but the subject needs it for legal
  claims
- The subject has objected (under Art 21) and is awaiting our
  consideration

Implementation: temporarily move the affected data to a separate
state where it cannot be processed (other than storage). For
practical purposes in GPDash today, this may mean exporting the
data, marking the account suspended, and ceasing routine
processing — handled case by case until a built-in mechanism exists.

### 6.3 Objection (Art 21)

A right to object applies where:

- Processing is based on legitimate interest (Art 6(1)(f)) — the
  data subject can object; we must cease processing unless we
  demonstrate compelling legitimate grounds
- Processing is for direct marketing — absolute right; we must cease

GPDash does not currently engage in direct marketing. For other
processing, an objection should be considered case by case;
GPDash's legitimate interests in security logging and audit trails
will often override individual objection, but document the reasoning.

### 6.4 Automated decisions (Art 22)

GPDash does not currently make automated decisions with legal or
similarly significant effects on individuals. If this changes, a
DPIA must be conducted (see `/docs/legal/dpia-template.md`) and
this section updated.

---

## 7. SAR register

Maintain a register of all data subject rights requests at
`/docs/legal/sar-register.md` (gitignored; sensitive). Each entry:

- Date received
- Channel
- Requester (name, email, account ID if known)
- Right(s) being exercised
- Date acknowledged
- Date response due (calculated)
- Extension applied? (Y/N, reason, new due date)
- Date responded
- Outcome (provided / partial / refused with reason)
- Notes (any unusual handling, third-party redaction applied,
  consultations with legal, etc.)

The register itself contains personal data and should be treated
accordingly — restricted access, retained for 3 years from closure
of the request as per ICO good practice for accountability records.

---

## 8. Response format

For an access request response, use the JSON export as the primary
artefact. Cover-letter the export with a short explanation:

- Confirmation of the data subject's request and date received
- Description of what's included
- Description of what's not included (and why — third-party data
  redacted, data outside our holding, etc.)
- Statement of the data subject's right to complain to the ICO if
  they're not satisfied with the response
- Contact for any clarification

Don't provide raw database dumps. If the standard export isn't
sufficient, work with the requester to understand what they're trying
to find out.

---

## 9. Refusals

A request may be refused or charged for if it is manifestly unfounded
or excessive — but the bar is high. The ICO's guidance is that a
request is rarely manifestly unfounded just because it's inconvenient
or because the requester has a grievance.

Refusal pathway:

1. Document the basis for refusal clearly, with reference to specific
   facts about the request
2. Inform the data subject within one month of:
   - The refusal and the reasons
   - Their right to complain to the ICO
   - Their right to seek a judicial remedy
3. Record the refusal in the SAR register with the rationale

If in doubt, respond rather than refuse. The legal and reputational
cost of an unjustified refusal usually exceeds the cost of complying
with an annoying request.

---

## 10. When to escalate

Escalate to external advisors (the data protection lawyer when one is
engaged; otherwise the ICO's helpline) where:

- The request involves litigation or threatened litigation
- The request involves a regulatory investigation
- The request involves criminal allegations
- The request raises a novel point that the procedure above doesn't
  address
- The 28-day mark approaches and the response isn't ready

---

## Appendix A — Standard acknowledgement template

```
Subject: Your data subject rights request — GPDash

Dear [requester name],

Thank you for contacting GPDash about your personal data. We've
received your request and our reference number for it is [REF].

Under UK GDPR we have one calendar month from today to respond fully.
That gives us until [DATE].

We may need to come back to you with some clarifying questions or to
confirm your identity before we can respond — this is standard
practice and is to protect your data. If we don't hear back from us
within a few days, please do email privacy@gpdash.net.

In many cases you can also get an immediate response by using our
built-in self-service tools at Account Settings → Data & privacy
inside the app, which let you download all the data we hold on your
account and (if you wish) delete your account.

Kind regards,
[Name]
GPDash
privacy@gpdash.net
```
