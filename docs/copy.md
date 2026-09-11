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
| Sidebar | Admin Dashboard · Clients · Forms · Billing · Team touchpoints / My touchpoints · Calendar · Help guide |
| Account button | Your account |

Admin Dashboard and Billing appear for Admin and Superadmin only.

**The touchpoints item is named for whose work it is** — **Team touchpoints**
for an admin, **My touchpoints** for everyone else, and for an admin who is
viewing as an employee. Plain "Touchpoints" collided with the Touchpoints
section inside a client's record and nobody could tell which one was meant.

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

**The case stages**, which are read off the authorizations rather than stored.
The `workflow_stage` column is set by hand and drifts both ways, so nothing on
screen reads it — a client filed as a referral while holding a 30-day
authorization is shown for what they are.

| Stage | What it means |
|---|---|
| Referral received | Nothing authorized, intake not started. We have the referral; nobody has been assessed. |
| Pending approval | Nothing authorized, intake complete. Assessed and submitted; waiting on the MCO. |
| Initial 30-day authorization | A 30-day authorization exists and nothing later does. |
| Active authorization | A 150-day or 180-day authorization exists. |
| Closed | Wins over everything, whatever the case was doing. |

A stage cannot be skipped by hand and cannot be claimed early: recording an
authorization is what advances it.

**Empty state:** `Adjust your filters or search to see results`

---

## A client's record

**Header:** the name, then `Member ID: {member_id}` under it, then the status
badge. Buttons: Edit · Close case · Reassign · HMIS · Reopen case.

**Close case carries a trash can**, on the record and on the client card alike.
It is the same symbol as Delete, which is permanent — the words beside it are
what separate them, so never ship a close-case control without its label or
its tooltip.

**The section bar:** Overview · Authorizations · Touchpoints · Forms · From
documents · Calendar · History · Billing. Records open on Overview. Billing is
Superadmin only.

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
| Contact | First name · Last name · Member ID · Date of birth · Phone · Email · Address · County |
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

Where a number is missing, the cell holds a dashed red button reading
**Update auth #**. Pressing it opens the same editor the Edit button does, on
that row. This is deliberate: the gap is the prompt, and red because an
unnumbered authorization cannot be billed.

### From documents

"What the uploaded files say that this record does not. Tick what is right,
then accept — nothing is written until you do."

Every row reads the same way: the label, then **what the record says now → what
the document says**, an arrow between them, and "Read from {file}" beneath. A
record holding nothing reads *nothing on the record* in italics rather than a
dash. A value the document and the record already agree on is not shown at all —
listing it makes a reader scan past what is true to find what is not.

Replacing dates that cycles are already counted from carries its own line, in
amber: "Accepting this replaces those dates and every cycle counted from them."

The button says **Accept changes** — not how many, which told a reader something
they could already see in the ticks.

Accepting writes to the record and rebuilds what follows from it, so the
Overview, Authorizations, Touchpoints and Calendar all show the new value
without reopening the client.

Empty: "Nothing to change. Every value the documents carry already matches this
record, or no document has been read yet — uploads are read under Forms."

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

## Team touchpoints

The admin view. Two tabs: **All cases** ("Every case manager") and **My cases**
("Assigned to me"). Staff never see the switcher.

### All cases

"Every case manager, their month, and the log they file at the end of it."

Four numbers across the top, supporting the page rather than being it:

| Card | Sub-label |
|---|---|
| Overdue | Across all staff |
| Completed | Logged this week |
| Scheduled | For this week |
| Logged | {Month} {Year} |

**Case managers** — "Press a name to open their {Month} case log."

Who appears is a rule, not a list of names. Superadmins never do — the owner and
the root accounts carry no caseload in any meaningful sense. Admins appear only
when they have clients: one admin carries the largest caseload in the agency and
another carries none, so the role cannot settle it and the caseload does. Staff
appear whether or not they have clients, being new or between assignments.

**Past logs** — "Pick a month, or a run of them. Tick case managers to narrow it
— leave them all clear for everybody." From and To month pickers, a row of
tick boxes, and **Find logs**. Results read `{staff}` · `{Month} {Year}` with
`{n} entries`, newest first; pressing one opens that month's form. **Download
all as one PDF** stitches the range into a single document, flattened so it
prints the same everywhere. A month nobody logged anything in is left out rather
than listed as a blank form. Each row:
the name, then `{n} clients` and `· {n} overdue` in red when there are any,
then a badge reading `{n} logged` — touchpoints recorded that month, which is
what their case log holds.

**Logged this week** — "{date}–{date}. Every touchpoint staff have recorded."
Rows read `{client} — {staff}` with `{date} · {In person | Phone | Video}`
beneath. Empty: "Nothing logged yet this week. Touchpoints appear here as staff
record them."

This replaced **Incomplete setups**, which asked what was missing rather than
what had happened. Missing setup is already flagged on the record itself, and
it is not a blocker — these fields get filled in late as a matter of course.

**Overdue** stays at the bottom, grouped by case manager, rows carrying the
client's name alone.

---

## My touchpoints

"Your work queue and your monthly log." Sections in the order somebody works:

**This month** — `{date}–{date} · {n} logged this week. Full detail is on your
calendar.` Every touchpoint scheduled in the current calendar month, in date
order, each with its own status. Empty: "Nothing scheduled this month.
Touchpoints appear here once a client has an authorization start date."

This replaced three sections. Needs follow-up, Upcoming this week and Touchpoint
cycles were three readings of the same days — a cycle closing, a touchpoint
scheduled inside it, and that cycle's progress — and whichever you read, the
work was the same work.

**HMIS case log**.

A client appears here as soon as they have a start date. Nothing else hides
their work from the person doing it.

Every row opens the client it names — there is no Open client button, because
the row is the button.

### HMIS case log

"Filled from what you have logged. Check it, then submit it at the end of the
month."

One row per touchpoint, oldest first, numbered straight through. A client met
twice appears twice, each with its own date.

| Control | Words |
|---|---|
| Month picker | `{Month} {Year}`, back to September 2026 and no further |
| Where the rows came from | `From logged touchpoints` / `Edited by hand` |
| Buttons | Refill from touchpoints · View form · Download · Add row · Save changes |

Footer: `{n} entries`, then `· fits one page` or `· prints on {n} pages,
numbered straight through`.

Empty: "No touchpoints logged in {Month} {Year}. Rows appear here as they are
logged, or add one by hand."

**There is no submitted state, and that is deliberate.** The app cannot reach
HMIS, so a Submit button promised a transmission that never happened. The log is
always current; filing it means downloading it and sending it yourself.

An administrator reads a log. They never rewrite somebody else's account of
their own month.

**View form** opens the filled PDF in the page, with zoom, the same viewer the
other templates use. **Download** saves it.

**The form itself.** The PDF the state issues has no fields — 152 places to
write and nothing to type into. The app lays fields over the table and fills
them: Case Manager, Month, then `#`, Client Name, Phone #, Completed (a tick),
Date as `MM/DD/YYYY`. Thirty rows a page; a longer month runs onto a second
page and keeps counting at 31. Downloads as
`HMIS Case Log — {staff} — {Month} {Year}.pdf`.

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
