# Personal Data Breach notification procedure

> Internal operating procedure. This document is the authoritative
> playbook for responding to a suspected or confirmed Personal Data
> Breach affecting GPDash.
>
> **Distribution:** All GPDash staff with operational responsibilities.
>
> **Last reviewed:** 2026-05-25
> **Next review due:** 2027-05-25

---

## 1. What counts as a Personal Data Breach?

A Personal Data Breach is "a breach of security leading to the
accidental or unlawful destruction, loss, alteration, unauthorised
disclosure of, or access to, personal data transmitted, stored or
otherwise processed" (UK GDPR Art 4(12)).

This includes — but is not limited to:

- A successful credential-stuffing or password-guessing attack on a
  user account
- A compromised platform-admin account
- Accidental exposure of personal data via a misconfigured server,
  database, or storage bucket
- A malicious or accidental data deletion that affects production
  data without backup recovery
- Loss or theft of a device containing decrypted production data
- A successful injection attack (SQL injection, XSS, etc.) that allows
  attacker access to data
- A compromise at a sub-processor that affects GPDash data
- Unauthorised changes to the running application that could lead to
  any of the above

A breach does NOT need to involve malicious intent to be reportable —
accidental disclosures and accidental deletions count.

A breach is **suspected** as soon as someone in the organisation has
reason to believe one of the above may have occurred. It is
**confirmed** once investigation has established that personal data
was, in fact, affected.

---

## 2. Roles and timeline

### 2.1 Roles

| Role | Responsibility |
|---|---|
| **First responder** | Whoever first notices or is alerted to the suspected breach. Triggers this procedure |
| **Incident lead** | Coordinates the response. By default: the GPDash founder/operator. May be delegated |
| **Customer liaison** | Communicates with affected Controllers. By default: the Incident Lead |
| **Regulator liaison** | Files notifications with the ICO if required. By default: the Incident Lead |

### 2.2 Statutory clock

- **ICO notification:** 72 hours from the moment GPDash becomes aware
  of a breach that is likely to result in a risk to the rights and
  freedoms of natural persons (UK GDPR Art 33)
- **Customer (Controller) notification:** GPDash commits in the DPA to
  notify each affected Controller within 48 hours, to give them a 24-
  hour buffer to assess and meet their own 72-hour ICO obligation
- **Data subject notification:** Without undue delay, if the breach is
  likely to result in a **high** risk to data subjects (UK GDPR Art 34)

"Awareness" starts the moment any GPDash representative has a
reasonable degree of certainty that a security incident leading to
personal data being compromised has occurred. The 72-hour clock does
NOT pause for weekends, public holidays, or out-of-hours.

---

## 3. Response procedure

### Step 1 — Contain (within minutes)

The First Responder and Incident Lead's first job is to STOP the
breach, not to investigate it. Common containment actions:

- Rotate any credentials known or suspected to be compromised
  (Supabase service role keys, Vercel API tokens, sub-processor
  credentials, the CRON_SECRET, any user passwords known to be exposed)
- Revoke active sessions for affected users (Supabase Auth → Sign out
  all users)
- Take affected functionality offline if necessary (set a maintenance
  flag, deploy a stub, etc.)
- Block known-malicious IPs at the edge (Vercel firewall) if attack
  traffic is identifiable
- Restrict platform-admin access to a known-safe subset of accounts

Document each containment action with a timestamp and the actor.

### Step 2 — Assess (within 1–4 hours)

Investigate enough to be able to answer, for an initial assessment:

- **What** happened? Best summary in plain English
- **When** did it happen, and when did GPDash become aware?
- **What data** is involved? Categories of personal data, approximate
  number of records
- **Whose data** is involved? Categories of data subjects, approximate
  number, identification (where possible) of specific Controllers
  affected
- **How** did it happen? Root cause if known, working hypothesis if not
- **What's the impact?** Likely consequences for data subjects and
  for affected Controllers
- **Is it still happening?** Confirmation of containment

Use the assessment to determine:

(a) Whether notification to the ICO is required (test: is there a risk
    to the rights and freedoms of natural persons?)
(b) Whether notification to data subjects is required (test: is the
    risk to those individuals **high**?)
(c) Which Controllers must be notified

Even if a notification is judged not to be required, the assessment
itself must be documented (UK GDPR Art 33(5)).

### Step 3 — Notify (within 48 hours of awareness, for Controllers)

#### 3.1 To affected Controllers

Notify each affected Controller within 48 hours of GPDash becoming
aware of the breach. Notification must include:

- The nature of the breach
- The categories and approximate number of data subjects concerned
- The categories and approximate number of records concerned
- The likely consequences of the breach
- Measures taken or proposed to address the breach
- A contact point at GPDash for further questions

Template: see Appendix A.

Send via the email address(es) on file for the practice's owner and
administrators. Where it's reasonable to do so, also call.

#### 3.2 To the ICO (within 72 hours of awareness)

If the breach is likely to result in a risk to the rights and freedoms
of natural persons:

Notify via the ICO's breach reporting form at
https://ico.org.uk/for-organisations/report-a-breach/

Information required is broadly the same as for Controller
notification, plus contact details for GPDash and any sub-processors
involved.

If the assessment is incomplete at the 72-hour mark, file an initial
notification with what's known and indicate further information will
follow. Do not delay notification past 72 hours because the picture is
incomplete.

#### 3.3 To data subjects (without undue delay, if high risk)

If the breach is likely to result in a **high** risk to data subjects,
they must be notified directly and without undue delay.

For a GPDash breach affecting practice staff, the practice is best
placed to communicate with its own staff. The notification to the
Controller (3.1) will make clear that this onward notification is
needed and provide the Controller with the information they need to
make it.

Direct notification by GPDash to individual data subjects (bypassing
the practice) is reserved for situations where the breach affects
people in their capacity as direct users of GPDash (e.g. their email
address was exposed independently of any practice context).

### Step 4 — Remediate (over days to weeks)

- Complete the investigation and document the root cause
- Implement permanent fixes — software changes, infrastructure
  changes, process changes
- Update documentation, training, and procedures as needed
- Where the breach exposed a gap in the threat model, update the
  threat model

### Step 5 — Record (close-out)

Maintain a record of every breach (including those judged not to need
notification) in the breach log at `/docs/legal/breach-log.md`.

Each entry should include:

- Date and time of breach
- Date and time of awareness
- Nature and scope
- Containment actions taken with timestamps
- Notification decisions and justifications
- Notifications sent (who, when, what)
- Investigation findings and root cause
- Remedial actions
- Follow-up review date

This log is the artefact that demonstrates compliance with Art 33(5)
record-keeping and is the primary thing the ICO would inspect in a
breach-related audit.

---

## 4. Escalation criteria

The Incident Lead must escalate to external advisors immediately if:

- The breach involves Article 9 special category data (health
  data, etc.) — note this should not normally happen for GPDash
  given we do not process patient data
- The breach is criminal in nature (e.g. ransomware) — notify the
  National Cyber Security Centre (NCSC) and consider whether to
  involve law enforcement
- The breach is large-scale (rough threshold: affecting more than
  10% of Controllers or more than 1,000 individual data subjects)
- The breach involves data exfiltration to a known threat actor
- Media or social-media attention is anticipated

External advisors:
- Data protection lawyer: \[contact details to add when engaged\]
- Cyber insurance broker (if applicable): \[contact details\]
- NCSC: https://www.ncsc.gov.uk/report-incident
- Action Fraud: https://www.actionfraud.police.uk

---

## 5. What this procedure is NOT for

This procedure is for incidents affecting **personal data**. The
following are handled separately (though may overlap):

- Pure service outages (no data exposure) — handled under standard
  incident response, no notification under data protection law
  (though customer SLAs may require notification)
- Software bugs that don't involve unauthorised access or loss of
  data — handled under standard bug triage
- Confidentiality issues unrelated to personal data (e.g. exposure
  of a Controller's commercial information) — handled under standard
  contract obligations

When in doubt about whether a personal data breach has occurred,
treat as a breach until investigation confirms otherwise.

---

## Appendix A — Controller notification template

To be sent via email to the practice owner and administrators on file.

```
Subject: GPDash — security incident affecting your practice's data

Dear [practice contact],

We are writing to inform you of a security incident affecting personal
data held by GPDash on your practice's behalf, as we are required to
do under our Data Processing Agreement with you.

What happened
[Plain-language description of the incident, including when it
occurred and when GPDash became aware.]

What personal data is involved
[Categories of personal data affected. Approximate number of records
where known. Confirmation that no patient data is involved.]

What we are doing
[Containment and remediation actions taken, with timestamps where
material.]

What this means for you
[Likely consequences for affected data subjects. Whether you (the
practice) need to notify the ICO under your own Article 33
obligation — see "Your obligations" below. Whether your staff need
to be informed.]

Your obligations
You are the controller for the personal data affected. Under UK GDPR
Article 33, if this breach is likely to result in a risk to the rights
and freedoms of your data subjects, you must notify the ICO within
72 hours of becoming aware of the breach (which, for you, is now).

If we judge that the breach is likely to result in a high risk to
your data subjects, we will indicate so in this notification, and
you should also notify your affected staff directly.

We will provide further information as our investigation progresses.
Please direct any questions to security@gpdash.net.

Contact
[Name]
[Role]
GPDash
security@gpdash.net
```

---

## Appendix B — Decision tree: do we notify the ICO?

```
                          Personal data breach
                                  │
                                  ▼
            Is there ANY risk to rights and freedoms?
                ┌────────────┴────────────┐
                │NO                      │YES
                ▼                         ▼
        Document decision     Notify ICO within 72h of awareness
        in breach log.                    │
        No ICO notification              ▼
        required.        Is the risk HIGH for affected individuals?
                              ┌────────────┴────────────┐
                              │NO                      │YES
                              ▼                         ▼
                       Stop — ICO         Also notify data subjects
                       notification        directly without undue delay
                       sufficient.        (or via the Controller for
                                          practice staff).
```

Examples of "risk to rights and freedoms":
- Identity theft or fraud possible
- Financial loss possible
- Damage to reputation possible
- Loss of confidentiality of personal data protected by professional secrecy
- Discrimination possible
- Loss of control over personal data

Examples of "high risk" — usually require some of:
- Special category data is involved
- Large number of people affected
- Significant volume of data per person
- Vulnerable people affected
- Likely material consequences (financial, reputational, physical)
