# The words on the screen

Every string a user reads, by screen, with the patterns behind the ones that
are built from data. Written so a change of wording can be decided here and
found in one place, rather than hunted through forty components.

**How to read the patterns.** `{client}` means the client's full name,
`{staff}` a member of staff, `{n}` a count. A formula like
`{client} — {staff}` is literal: that em dash is the separator on screen.

**Two words carry weight, and they are not interchangeable.**

- **Case** is the work: it opens, it closes, it reopens. Use it for anything
  about the engagement.
- **Client** is the person. Use it for the record and for anything about them.

A client has no calendar, no login, and sees none of this. Anything scheduled
is *staff work about a client* — which is why the panel inside a record is
called **Scheduled work** and not "client calendar".

---

## Navigation

| Where | Words |
|---|---|
| Product name | **Case Notes** |
| Footer mark | HIPAA Compliant |
| Sidebar | Admin Dashboard · Clients · Forms · Billing · Touchpoints · Calendar · Help guide |
| Account button | Your account |

Admin Dashboard and Billing appear for Admin and Superadmin only.

---

## Clients

**Search placeholder:** `Search by name, member ID, or email.`

**The count**, which says which of three things it is counting:

| When | Words |
|---|---|
| Nothing narrowing the list | `{n} open clients` |
| A search, manager filter, status filter or stage is applied | `{n} clients matched` |
| The Closed stage is chosen (Admin only) | `{n} closed clients` |

Singular drops the `s` in all three.

**Filters:** All case stages · All levels (High Level / Low Level / Missing
level of need) · All statuses · Unassigned · No active case managers

**Empty state:** `Adjust your filters or search to see results`

---

## A client's record

**Header:** the name, then `Member ID: {member_id}` under it, then the status
badge. Buttons: Edit · Close case · Reassign · HMIS · Reopen case.

**The section bar:** Overview · Authorizations · Touchpoints · Forms ·
Calendar · History · Billing. Records open on Overview. Billing is Superadmin
only.

### Overview

The record and its editor are the same screen. **Edit** unlocks every field in
place — the labels stay put, the values become inputs — and **Update client**
and **Cancel** sit at the top, above the fields they govern. Focusing a field
selects what is in it, so a correction is one keystroke.

Four blocks, each headed by a rule: **Contact** · **Case** · **Authorizations**
· **Closure** (closed cases only). Two more appear while editing: **Visit
availability** and **Notes**.

| Block | Labels |
|---|---|
| Contact | First name · Last name · Member ID · Date of birth · Email · Phone · Address · County |
| Case | Status · Intake date · Insurance · MCO housing manager · Level of need · LoN score · Case manager |
| Authorizations | 30-day start · 30-day end · 30-day auth # · 150-day start · 150-day end · 150-day auth # · 180-day start · 180-day end · 180-day auth # |
| Closure | Closed date · Reason closed |

An empty value reads as a faint em dash. An end date with no start reads
**N/A** — it is calculated, not typed, so there is nothing to fill in.

**Status** offers two words and only two: **Active** and **Closed**. Choosing
Closed opens the closing dialog rather than writing the status, because closing
takes a reason. "Inactive" is not a state this app has; do not reintroduce it.

**Case manager** is a dropdown, not a button. Hint: "Takes effect immediately,
and is recorded in History."

**MCO housing manager** appears only when the insurer is United.

**Locked periods** explain themselves rather than greying out silently:
"Unlocks once the 30-day period is due" · "Unlocks once the 150-day period is
due". Names carry "Only admins can edit names" for everyone else.

**Case overview** card, below the blocks — `Next step` appears only when there
is one. When a case has no outstanding task the box is not shown at all.

**Delete this record** — "Permanently removes the client and everything
attached to them. To stop working a case while keeping its history, close it
instead."

### Touchpoints

**Card title:** `Monthly Touchpoints — {Month} {Year}`, the month and year in
the accent colour because that is the part that changes.

**Monthly requirements** — status badge reads Missing setup / Completed /
Overdue / On track.

- `Current 30-day cycle: {start} – {end}`
- `Level of need: {High Level | Low Level}`
- `Required touchpoints: {n} · Required in person: {n}`
- `Completed: {n} · Remaining: {n}`
- `Suggested next: {type}`

**All 30-day touchpoint cycles** — one row per cycle, `MM/DD/YYYY – MM/DD/YYYY`,
six at a time. Colour says which authorization pays for it:

| Colour | Meaning |
|---|---|
| Blue | Initial 30 days |
| Green | 150-day authorization |
| Purple | 180-day extension |
| Amber + **Add Auth Code** (red) | No authorization covers any day of that cycle |

**Add Auth Code** opens the authorization dialog on that cycle's dates, so a
gap is fixed where it is seen rather than from another tab.

The current cycle is tagged `NOW`. Empty state: "No cycles yet. They appear
once this client has an authorization with a start date — record one under
Authorizations."

### Authorizations

One row per authorization, newest first: the period, its dates, its number, its
status. A start date alone creates the row — the number can follow.

Where a number is missing, the cell holds a dashed button reading
**Update auth #**. Pressing it opens the same editor the Edit button does, on
that row. This is deliberate: the gap is the prompt.

### Forms

Button: **Upload documents**. Inside, the drop zone reads **Upload PDF** /
"Drag a file here, or" / **Choose file**, with "PDF only, up to 20 MB. Sign it
before uploading if a signature is required."

### Calendar

**Scheduled work.** Rows read `{day}` · `{title}` · `{time or "All day"}`.

### History

**Case history** — one list, newest first.

| Event | Words |
|---|---|
| Reassignment | `Reassigned from {staff} to {staff}, by {staff}` |
| Closure | `Case closed` + the reason underneath |
| Reopening | `Case reopened` |
| Logged contact | `Touchpoint logged — {method}, {type} by {staff}` |

Empty: "Nothing has happened to this case yet."

---

## Touchpoints

Two tabs: **All cases** ("Every case manager") and **My cases** ("Assigned to
me"). Staff see only My cases, without the switcher.

### All cases

**Team performance** — "See which staff members are falling behind and need
follow-up."

| Card | Sub-label |
|---|---|
| Overdue | Across all staff |
| Scheduled | For this week |
| Completed | Logged this week |
| In progress | Scheduled but not yet logged |
| Needs setup | Cannot be scheduled |

A card's label and its sub-label never repeat a noun, and sub-labels stop at
six words.

**Overdue** is grouped by staff member, so rows carry the client's name alone:
`{client}` plus a High/Low badge. **Incomplete setups** is not grouped, so its
rows read `{client} — {staff}` with `Missing: {what}` beneath.

**Hidden cases notice:** `{n} older cases started before {date} are hidden. To
view them, turn on Show historical data in Admin settings.` The toggle in Admin
carries that exact name.

### My cases

"Your touchpoint work queue." Sections: Supervisor reminders ("Clients who need
follow-up before their cycle closes.") · this week ("Nothing scheduled this
week.") · Touchpoint cycles.

Every row opens the client it names — there is no Open client button, because
the row is the button.

---

## Calendar

**Calendar** — "Your scheduled work, by date." Under it: "Drag to reschedule.
Manual moves are preserved."

**Search placeholder:** `Search events by title or client name`. Nothing found:
"Nothing matches, within a year either way of today."

**An entry's title** is `{client}` for an auto-scheduled touchpoint, or whatever
was typed for anything else. Colour follows the authorization paying for that
day, with grey for logged and amber for a day no authorization covers.

**Today's Schedule** sits above the calendar. Empty: "No events today."

**Opening a day** gives a dialog headed `{Weekday}, {Month} {day}` with
`{n} entries`, an **Add** button, and an X. Auto-scheduled touchpoints carry a
remove control; anything a person entered does not.

**Removing one asks:** "Remove this touchpoint?" — "{title} on {weekday},
{month} {day}. The cycle may schedule another in its place if one is still
owed." with **Don't ask me again**.

---

## Account

**Calendar subscription.** Before there is a link: "See your touchpoints in
Outlook, Google or Apple Calendar. Changes appear within a few hours, so check
the app for anything urgent." Button: **Create my calendar link**.

After: **Copy link** · **Replace link** · **Delete link**, and

> **Keep this link private**
> Anyone with it can read your calendar without signing in. If needed, press
> Replace link and the old link will become inactive.

**How to add this to your calendar** holds the four steps, the per-app menu
paths, and the warning that matters most: "Do not open the link in your
browser — that downloads a one-time copy that never updates."

---

## Closing a case

**Close this case?** — "{client} stops appearing as work: no next step, no
touchpoints to make. The record, forms, notes and billing history all stay
exactly as they are, and an administrator can reopen the case."

Staff see, in amber: "**This is the last you will see of this client.** A
closed case is visible to administrators only, so {client} leaves your client
list, your calendar and your documents as soon as you close it. Nothing is
deleted, and an administrator can reopen the case."

Reasons: Housed · Moved · Lost Contact · Deceased · Transferred to Other Agency
· Medicaid Expired · Other.

Outstanding billing, when there is any: "{n} billing cycles can still be filed.
Closing does not change that — they stay in Billing until they are submitted or
their six-month window closes."

---

## Messages

**Success titles** are a past-tense fact, never a congratulation: Case closed ·
Case reopened · Touchpoint saved · Touchpoint moved · Touchpoint removed ·
Authorization recorded · Password changed · Note saved · Calendar link ready.

**Failure titles** all begin "Could not", and name the thing rather than the
system: Could not close the case · Could not save the touchpoint · Could not
reschedule · Could not remove it · Could not read it. The error's own message
goes in the description.

**Preview mode**, whenever a superadmin is viewing as someone else: "Preview
only" — "Changes are not saved while viewing as an employee."

---

## House rules

1. **Say what to do, not how it works.** "Use your work account", not "Entries
   name the client, so subscribe with…".
2. **One thought per sentence**, and one job per headed block. Three warnings in
   a paragraph means a reader catches none.
3. **Never repeat a noun** between a heading and the label under it. "Scheduled
   / For this week", not "Scheduled this week / Touchpoints planned this week".
4. **No internal words on screen.** Not go-live (launch date), not cycles where
   cases will do, not oversight (All cases).
5. **Empty is a state worth describing.** Say why a list is empty and what
   would fill it.
6. **Don't warn about what cannot happen.** A line telling staff to use the work
   account they already have spends attention and returns nothing.
