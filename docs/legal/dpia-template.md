# Data Protection Impact Assessment (DPIA)

> **Use this template** when GPDash adds processing that:
> - Involves a new category of personal data (especially Article 9
>   special category data — health, ethnicity, sexual orientation, etc.)
> - Uses automated decision-making with legal or similarly significant
>   effects on individuals
> - Involves systematic monitoring of a publicly accessible area
> - Processes data of children or other vulnerable individuals
> - Involves matching or combining datasets in ways the data subject
>   wouldn't reasonably expect
> - Uses new technology in a way that creates new risk types
> - Otherwise meets the criteria in the ICO's
>   [DPIA screening checklist](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/guide-to-accountability-and-governance/data-protection-impact-assessments/)
>
> If none of those apply to the proposed change, document why a DPIA is
> not required in your design notes and proceed.

**DPIA reference:** \[YYYY-NN — e.g. 2026-01\]
**Project / change name:** \[name\]
**Date of this assessment:** \[YYYY-MM-DD\]
**DPIA author:** \[name\]
**Reviewed by:** \[name(s)\]
**Status:** Draft / Under review / Approved / Implemented / Closed

---

## Step 1 — Identify the need for a DPIA

### 1.1 Describe the project in plain language
\[What are you proposing to build, change, or introduce? Keep this
concise — one or two paragraphs.\]

### 1.2 Why does this proposal need a DPIA?
Tick all that apply:

- [ ] New category of personal data
- [ ] Article 9 special category data involved
- [ ] Automated decision-making with significant effects
- [ ] Systematic monitoring
- [ ] Processing data of children or vulnerable people
- [ ] Combining datasets in ways data subjects wouldn't expect
- [ ] New technology with new risk types
- [ ] Other — \[describe\]

---

## Step 2 — Describe the processing

### 2.1 Nature of the processing
- **What** is collected?
- **From whom?**
- **How** (via what mechanism)?
- **Where** is it stored?
- **Who** has access?
- **How long** is it kept?
- **Is it shared** with anyone outside GPDash?

### 2.2 Scope of the processing
- Volume and variety of data
- Sensitivity of data
- Number of data subjects affected
- Geographical scope (UK only? EEA? Beyond?)
- Duration / frequency

### 2.3 Context of the processing
- Source of the data
- Nature of the relationship with data subjects
- How much control do data subjects have over how their data is used?
- Would data subjects expect this processing?
- Does it include people who might be vulnerable?
- Any prior concerns or experiences with this type of processing?

### 2.4 Purpose
- Why are we doing this?
- What benefits do we hope to achieve?
- For whom (us, the data subjects, third parties)?

---

## Step 3 — Consultation

### 3.1 Who do we need to consult?
- Internal: \[which roles\]
- External: \[lawyer? Data Protection Officer if appointed? ICO if
  high-risk residual issues identified?\]
- Data subjects: \[how will we seek their views, if at all?\]

### 3.2 Consultation record
\[Record who was consulted, when, and a summary of what they said.\]

---

## Step 4 — Assess necessity and proportionality

### 4.1 What is the lawful basis under Article 6?
\[(a) Consent / (b) Contract / (c) Legal obligation /
(d) Vital interests / (e) Public task / (f) Legitimate interests\]

\[Brief justification.\]

### 4.2 If Article 9 special category data is involved, what is the basis?
\[Explicit consent / employment law / vital interests / etc. — list the
Article 9(2) condition AND, where applicable, the UK DPA 2018 Schedule 1
condition.\]

### 4.3 Is the processing necessary to achieve the purpose?
\[Could the purpose be achieved with less data? With aggregated or
pseudonymised data? With shorter retention? If so, why is the more
intrusive option proposed?\]

### 4.4 Quality and minimisation
- Will the data be accurate and kept up to date?
- How will the minimum data necessary be collected?
- How will data be deleted when no longer needed?

### 4.5 Information to data subjects
- How will we inform data subjects about this processing (privacy
  notice update, in-product banner, email)?
- How will we make it easy for them to exercise their rights?

---

## Step 5 — Identify and assess risks

For each identified risk, complete a row in the table below. Use the
ICO's framing:

- **Likelihood:** Remote / Possible / Probable
- **Severity:** Minimal / Significant / Severe
- **Overall risk:** Low / Medium / High

| # | Risk to individuals | Source of risk | Likelihood | Severity | Overall risk |
|---|---|---|---|---|---|
| 1 | \[e.g. unauthorised access to MFA-protected data\] | \[external attacker\] | Possible | Significant | Medium |
| 2 | \[continue\] | | | | |

### Other risks to consider
- Risk to the rights and freedoms of individuals
- Risk to GPDash (regulatory, reputational, financial)
- Risk to the Controller practice

---

## Step 6 — Identify measures to reduce risk

For each risk identified in Step 5:

| Risk # | Options to reduce or eliminate | Effect on risk | Residual risk | Measure approved (Y/N) |
|---|---|---|---|---|
| 1 | \[e.g. enforce MFA for all users; rate-limit failed sign-ins\] | Reduced | Low | Y |
| 2 | | | | |

### Residual risk summary
\[Are any High residual risks remaining? If yes, the ICO must be
consulted before processing begins. See ICO guidance on
"prior consultation."\]

---

## Step 7 — Sign off and record outcomes

| | Name | Role | Date | Signature |
|---|---|---|---|---|
| Measures approved by | \[name\] | \[role\] | | |
| Residual risks approved by | \[name\] | \[role\] | | |
| DPO advice provided (if applicable) | \[name\] | DPO | | |
| Summary of DPO advice | | | | |
| Consultation responses reviewed | | | | |
| This DPIA will be kept under review by | \[name\] | \[role\] | | |

### Implementation summary
\[What was actually built / changed? Any deviations from the proposal
above? Date implemented?\]

### Review schedule
\[When should this DPIA be reviewed next? Default: annually, or sooner
on material change.\]

---

## Appendix A — Linked documents

- Privacy notice section affected: \[link / section reference\]
- RoPA entries created or updated: \[reference\]
- Sub-processor changes: \[reference\]
- Retention policy changes (`lib/retention-policy.js`): \[diff link\]
- Related code changes / pull requests: \[reference\]
