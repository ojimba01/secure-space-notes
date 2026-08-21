# NJ Housing Supports — Form Field Reference

Parsed from the February 2026 program PDFs. The blank fillable copies live in
`public/form-templates/` and are embedded in the Forms hub, where employees fill
them in the browser's PDF viewer, download the completed copy, and submit it
through the existing upload → sign → review → approve workflow.

---

## 1. Initial Assessment Tool (IAT)

Purpose: request Housing Supports services and document eligibility.
Eligibility requires Medicaid + MCO enrollment, ≥1 social risk criterion, and
≥1 clinical risk criterion. For multi-person households, sections A–E cover the
member with the greatest observed need; section F lists everyone else.

| Section | Fields |
|---|---|
| A. Member Information | Name (as on Medicaid ID)*, DOB*, phone, email, Medicaid ID*, MCO* (Aetna / Fidelis / Horizon / UHC / Wellpoint), MCO Member ID, county* |
| B. Social Risk Criteria (≥1) | Currently homeless · at risk of homelessness · at risk of institutionalization · transitioning from institution · recently released from corrections |
| C. Clinical Risk Criteria (≥1, self-reported/observed) | Chronic health condition · mental health condition · substance misuse · pregnancy (incl. 12 mo postpartum) · complex condition from I/DD · IPV/DV/trafficking victim · needs ADL/IADL assistance · repeated ED/hospital use |
| D. Services Needed | Services* (Pre-tenancy · Tenancy Sustaining · Move-in Supports · Residential Modifications/Remediation — pre-tenancy and tenancy-sustaining are mutually exclusive), duplicate-services confirmation* (Confirm / Unsure / Do not confirm), preferred provider (optional) |
| E. Requester Information | Name, relation to member, role/title, organization, phone, email (only if someone other than the member submits) |
| F. Household Information | Total people in household* (incl. member), member table (first, last, Medicaid ID, MCO ID, age — up to 10 rows) |
| G/H. Statement of Truth & Signature | Member name*, parent/guardian name (if under 18), date*. Signing = perjury attestation and consent for MCO contact |

## 2. Level of Need Assessment Tool (LON)

Purpose: continued authorization (submit within first 30 days of service, extends
authorization by 150 days) and reauthorization (every 180 days) for Pre-tenancy /
Tenancy Sustaining services. Completed by the servicing provider's case manager for
the single authorized member (one billable member per household). Points tally into
a risk category: **1–17 = Low level of need, 18+ = High level of need**.

| # | Question | Scoring |
|---|---|---|
| 1 | Name | not scored |
| 2 | Date of birth | 1 pt if age < 18 or > 60 (auto-computed) |
| 3–4 | Medicaid ID / MCO Member ID | not scored (required for eligibility) |
| 5 | Household size | 2+ members = 5 · 1 member = 0 (+ member table) |
| 6 | Employed? | No = 1 · Yes = 0 |
| 7 | Where do you sleep most frequently? | Homeless (unsheltered / shelter / other definitions) = 5 · unstably housed (at risk, unsafe home, at-risk institutionalization, transitioning out, released ≤12 mo) = 1 · stably housed = 0 |
| 8 | How long living there? | Homeless >1 yr = 3 · homeless <1 yr = 2 · unstable >1 yr = 2 · unstable <1 yr = 1 · stable = 0 |
| 9 | Times homeless | past year = 3 · past 3 yrs = 2 · lifetime = 1 · never = 0 |
| 10 | Eviction history | evicted = 3 · notice/in process but not evicted = 1 · never = 0 |
| 11 | Criminal justice involvement | offense past 12 mo = 2 · older offense and/or witness/victim past 12 mo = 1 · none = 0 |
| 12 | ED/hospital visits last 6 mo | >4 = 7 · 2–3 = 2 · ≤1 = 0 |
| 13 | IPV/DV | last 6 mo = 3 · last 12 mo = 2 · lifetime = 1 · never = 0 |
| 14 | Substance misuse affecting housing | Yes = 5 |
| 15 | Mental health condition affecting housing | Yes = 2 |
| 16 | I/DD affecting housing | Yes = 8 |
| 17 | Pregnancy | current = 1 · past 12 mo = 1 · no = 0 |
| 18 | Chronic health condition | Yes = 1 |
| 19 | ADL/IADL assistance (check all) | ≥1 ADL = 1 · ≥3 IADLs + behavioral/cognitive condition = 1 (sum) |

Provider Assessment Record (required): case manager name, provider organization,
completion date, service requested (Pre-tenancy / Tenancy Sustaining), reason for
authorization (extend first 30→180 days · reauthorize 180 days · switch provider ·
update level of need · change service type · member switched MCO · other), signature.

## 3. Housing Stabilization Plan (HSP)

Purpose: individualized plan created with the member on/after the first date of
authorized services; must be submitted within the first 30 days and updated at
least every 180 days (or on meaningful change). Reauthorizations must show clear
progress in the past 180 days. Touchpoint minimums: 2×/month (low need) or
4×/month (high need), documented in NJ HMIS or comparable system.

| Section | Fields |
|---|---|
| Header | Member name*, date*, Medicaid ID*, NJ HMIS ID, next scheduled review*, provider*, case manager name/phone/email* |
| General goal (select one) | Pre-tenancy (find safe, stable housing) or Tenancy Sustaining (stabilize in new/current housing) |
| Overall housing goal | Free text*, a couple of sentences |
| i. Housing search/stabilization & retention | Next steps* + activity grid |
| ii. Income/expenses/other resources | Monthly income goal — individual* ($, may be 0) and household* + activity grid |
| iii. Health needs | Health needs (incl. mental health, substance use)* + activity grid |
| Notes & signatures | Notes, member signature + date (blank if under 18), parent/guardian signature + date (only if under 18), case manager signature |

Each activity grid row: **Goal · Action · Person responsible · Target date ·
Progress update · Date completed**.

\* = required in the web template.
