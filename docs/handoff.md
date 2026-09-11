# Handing this over

State of play for whoever picks this up next. Written after the inline-editing
rebuild of the client record.

## How this repo works

**Lovable owns deploys.** Pushing to `main` rebuilds the app; there is a lag of
a few minutes. Lovable also commits to `main` itself, so **fetch before you
merge** — it has landed migrations mid-session more than once.

**SQL is never applied from here.** Schema changes are written as
`docs/*.sql`, handed to the user, and run through Lovable's chat (see
`docs/lovable-apply-migrations.md`). Lovable then commits the applied script as
a real migration and regenerates `src/integrations/supabase/types.ts`. Write
every script **idempotent** — `create or replace`, `drop policy if exists`, an
update that matches nothing the second time — because a partial failure is
fixed by running the whole thing again.

**Give the user one paste-ready file, not instructions.** They lose time to
placeholders like "[paste the file]". Build the complete message — wrapper plus
SQL inline — and hand it over as a file.

**Test SQL before handing it over.** Postgres 16 is installed here. `initdb` as
the `postgres` user (it refuses to run as root), stub the tables the script
touches, and run it. That is how the `close_case` defect below was caught.

**Verify, do not assume.** Several things in this session looked obvious and
were wrong in the opposite direction. Reproduce first.

## What the user wants from you

Lead with the answer, then support it. Active voice. No filler. One thought per
sentence. They will tell you when copy is bad, and they are usually right —
`docs/copy.md` holds the resulting rules and every string on the site.

## Applied to the database

- `20260911162431` — closed cases are Admin/Superadmin only: 11 policies, plus
  `is_case_closed`, `is_assigned_to_client`, `can_access_client_files`,
  `close_case`. Source: `docs/a-closed-case-belongs-to-admin.sql`.
- `20260911165601` — `calendar_feed_subscriptions` and
  `rotate_calendar_feed_token`. Source: `docs/a-calendar-you-can-subscribe-to.sql`.
- `20260911174326` — stripped the "Touchpoint — " prefix from existing event
  titles.
- The `calendar-feed` edge function is deployed.

## Waiting to be run

`docs/hsp-dates-are-authorization-dates.sql` — mirrors hsp_150_date and
hsp_180_date into the authorization columns for clients already carrying them,
and writes the client_authorizations rows that go with them (including the
initial_30 rows that were never created). Tested on a throwaway Postgres
against a client with the HSP date only, one with a period already recorded by
hand, and a deleted client. Everything else written this session has been run.

## Three things that will bite you

**1. Postgres applies a table's SELECT policy to the new row of an UPDATE.**
You cannot update a row into a state where you could no longer see it. Because
the read policy hides closed cases from staff, no staff `UPDATE` can ever turn
a case closed — with or without a `WITH CHECK` of its own. That is why closing
goes through `close_case()`, a security-definer function, rather than through
the table. Any future "hide X from role Y" policy has the same trap waiting.

**2. Authorizations live in two places and neither is complete.**
`clients` has `auth_30_*`, `auth_150_*`, `auth_180_*` — one of each, which
cannot represent a second reauthorization. `client_authorizations` is the real
history but rows go missing (clients with no `initial_30` row are common).
`authorizationCycles()` in `src/lib/compliance.ts` **merges** them: the record
wins where both describe the same days, the columns fill its gaps. Do not go
back to preferring one.

**3. The HSP date fields are not the authorization columns.**
The form shows "150-day start" and writes `hsp_150_date`, but
`syncAuthorizationsFromLegacyColumns()` reads `auth_150_start`. The IAT field
has always mirrored into `auth_30_start`, which is the only reason editing the
30-day date ever worked; the other two wrote a column nothing downstream read,
so the edit saved and went nowhere. They mirror now, but only when the field
was actually edited — writing them on every save would let a stale form value
overwrite a start date recorded precisely under Authorizations, on a save that
was about a phone number. Note the 180 is still gated on `auth_180_approved`
inside the sync: a start date alone will not create that authorization.

**4. A change to an authorization date needs two calls, in order.**
`syncAuthorizationsFromLegacyColumns()` then `resyncDerivedSchedules()`. Doing
one without the other is the most repeated source of defects in this app.
`saveClientEdit()` fires both on any authorization date or number change, and
again on a retry.

**5. Status is carried through a save verbatim, and must stay that way.**
`initialValues` once mapped an unrecognised status to `'active'`. Saving a
phone number on a closed client would then have reopened the case silently.
Two tests in `tests/save-client-status.test.mjs` guard it. Never narrow
`ClientEditValues.status` to a union.

## The client record, as rebuilt

**`EditClientDialog` is gone.** The record and its editor are one screen:
`ClientOverview.tsx` renders each field as a value or an input depending on a
single `editing` flag, and **Update client** sits at the top. The save path it
calls lives in `src/lib/saveClientEdit.ts` — extracted from the deleted dialog
unchanged, and now the only way a client edit is written. `VisitAvailabilitySection`
was reachable only from inside that dialog; it moved into the overview rather
than being lost with it.

**Authorization numbers are editable in three places, on purpose.** The edit
form (`30-day auth #`, `150-day auth #`, `180-day auth #`), a dashed
**Update auth #** button standing in for a missing number on the Authorizations
tab, and a red **Add Auth Code** button on any uncovered cycle in the touchpoint
list. All three end at `recordAuthorization` / `authorizationNumberPatch` in
`src/lib/clientAuthorizationDates.ts`. A start date alone already creates the
authorization row — `syncAuthorizationsFromLegacyColumns` only requires
`period.start` — so the number is always allowed to arrive later.

**Status closes a case.** Choosing Closed in the Status dropdown opens
`CloseCaseDialog` instead of writing the status, because closing takes a reason
and has to go through `close_case()`. Case manager is a dropdown calling
`reassign_client` directly; the Reassign button in the header still works and
was left alone.

## Open work

**The touchpoint compliance spec — diagnosed, and one day is one touchpoint.**
The user pasted a full specification; it is in the conversation, not the repo.
Findings:

- Already correct: cycles anchored to `serviceStartDate`; compliance read only
  from `client_contacts`; every scheduling protection; `calendar_event_id`
  already exists on `client_contacts` and is already written.
- **Settled, and not to be reopened:** the spec asks for two contacts on the
  same day to count as two. The agency decided they count as **one**, which is
  what `distinctDays()` already does. Leave `windowProgress`, `computeProgress`,
  `cycleStatus` and `overdueReasons` counting days. "Not enough days left in
  billing window" therefore stays a valid overdue reason — it only stops making
  sense if same-day contacts ever start counting separately. The ≥7-day spacing
  on in-person visits is unaffected either way.
- Completion is matched by **date**, not by `calendar_event_id`. That is the
  unreliability the spec's item 5 is aimed at; the column exists and nothing
  reads it. This one is still open.
- `calendar_event_id` has no foreign key and no index, and nothing stops two
  contacts linking to one event.

**There is a test runner now.** `npm test` runs `node --test tests/*.test.mjs`
— 29 tests across four files, bundled with esbuild against a mocked Supabase.
It covers the cycle maths, authorization dates, authorization numbers, and the
status-carry-through above. Add to it rather than standing up vitest.

**Auto-reading an uploaded document** — the user asked, and the machinery
already exists (`DocumentIntakeDialog`, `documentIntake.ts`,
`authorizationProposals.ts`). Only the wiring is missing. The recommendation
given, not yet accepted: read on upload, then show "3 proposed changes —
review", rather than writing to the record silently. These documents set
authorization dates and levels of need, which drive billing and touchpoint
quotas; a misread date would reshape a client's cycles with nobody told.

**Closed clients on the calendar.** The user reported them still appearing.
Could not be reproduced from here — no database access. The filter was changed
to consult a set of closed client ids rather than read status off the joined
row, because the join could fail open. **If they are still there, ask what the
status badge on that client's record says.** If it reads `inactive` rather than
`closed`, it is a different bug: nothing in this codebase treats inactive as
closed.

**An "intake" event type does not exist.** The user asked for logged intake
events to be coloured on the calendar. The event types are client_visit,
phone_call, team_meeting, follow_up, administrative, other, touch_point.
Completed touchpoints were given grey instead, and the question was put back to
the user unanswered.

**`audit_logs` is admin-only.** Case history therefore shows staff the
assignments, the touchpoints, and *that* a case is closed — not when. Widening
that policy for a client's own case manager is one small SQL script if it
matters.

## Where things are

| Thing | File |
|---|---|
| Cycle maths, phases, compliance counting | `src/lib/compliance.ts` |
| Auto-scheduling and its protections | `src/lib/touchpoints.ts` |
| Closed-case helper used everywhere | `isCaseClosed` in `src/lib/workflow.ts` |
| The client record and its section bar | `src/components/ClientDetails.tsx` |
| Agency calendar, search, day dialog | `src/components/CaseManagerCalendar.tsx` |
| The 30-day cycle list | `src/components/TouchpointCycles.tsx` |
| Case history | `src/components/CaseHistory.tsx` |
| Calendar subscription feed | `supabase/functions/calendar-feed/index.ts` |
| The client record, inline editor included | `src/components/ClientOverview.tsx` |
| The one client save path | `src/lib/saveClientEdit.ts` |
| Authorization dates and numbers | `src/lib/clientAuthorizationDates.ts` |
| Every string on the site | `docs/copy.md` |
