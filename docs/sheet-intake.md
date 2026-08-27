# Sending clients from the workbook to the app

A **Case Notes** menu appears in the Housing Case Management workbook. Whoever
is keeping the sheet clicks **Preview**, reads what would happen, then clicks
**Send** — and complete new clients appear in the app with their billing cycles
already generated.

## The rules it works by

**One-way, insert-only.** The sheet creates clients. It never edits or deletes
one that already exists, so nobody can undo work done in the app by fixing a
typo in a spreadsheet.

**Member ID is the key.** It is filled on every row of the workbook and matched
46 of 47 clients on 2026-08-27, where matching on names needed 20 spelling
corrections first. IDs are compared with punctuation stripped, so `ID-2370491`,
`ID2370491` and `ID 2370491` are the same person.

**Rows already in the app are skipped.** That is what stops the existing
caseload being re-created — no cutoff row to maintain, because everyone already
here is matched by Member ID and reported as a duplicate.

**Columns are read by their heading, not their position.** Reordering columns,
or inserting one, does not break it. Renaming a heading does — the script names
the headings it looks for, and anything it cannot find is simply blank.

**Incomplete rows still create a client**, and the preview says what is missing.
A client without an approval status, a start date or a LON level is created but
is not yet workable — the app's Admin queues then show exactly what to chase.
Only two things are truly required: a **Client Name** with a first and last
name, and a **Member ID**.

**Only the MASTER tab is read.** The other tabs are views built from it.

## Columns it reads

| Sheet heading | Becomes |
|---|---|
| Client Name | First and last name |
| MCO | Insurance |
| Member ID | Member ID — **the match key** |
| Phone Number | Phone |
| Date of Birth | Date of birth |
| Intake Date (Assessment Start) | Intake date |
| Assessment Due Date | Assessment due date |
| Assigned Staff | Case manager, matched on their name in the app |
| 30-Day / 150-Day / 180-Day Auth Number, Start, End | The matching authorisation fields |
| LON Score | LoN score |
| LON Level | Level of need |
| Approval Status | `Submitted` or `Approved` sets HSP submitted |
| Current Case Status | Case stage |
| Next Action Due Date, Closed Date, Reason Closed, Notes | The same fields |

Everything else in the sheet is ignored, including the calculated columns
(Days Until Due, Overdue?) which the app works out itself, and `Denied Auth
Number` through `Evidence / Source`, which the agency confirmed are not needed
here.

> **A LoN Level typed in the sheet cannot raise anyone's billing rate.** The
> database forces Low Level whenever the score is under 18, so a mis-typed
> `High` is corrected on the way in. See the LoN score rule in the handoff.

## Setup — done once

**1. Deploy the function**

```bash
supabase functions deploy sheet-intake --project-ref gotwcbjywtdlyrtfjqnw
```

**2. Set a shared secret.** Generate one and keep it somewhere safe — it is the
only thing standing between the internet and creating clients.

```bash
supabase secrets set SHEET_INTAKE_SECRET="<paste a long random string>" --project-ref gotwcbjywtdlyrtfjqnw
```

**3. Add the script to the workbook.** In the sheet: **Extensions → Apps
Script**, replace the contents with the code below, put the *same* secret in
`SECRET`, save, then reload the sheet. A **Case Notes** menu appears.

The first click asks Google for permission to send data out of the sheet —
that is expected, and it is the only outbound call the script makes.

```javascript
const FUNCTION_URL = 'https://gotwcbjywtdlyrtfjqnw.supabase.co/functions/v1/sheet-intake';
const SECRET = 'PASTE THE SAME SECRET HERE';
const TAB = 'MASTER';

// Heading -> the name the app expects. Matched on the heading text, so moving
// a column is fine; renaming one means updating it here too.
const COLUMNS = {
  'Client Name': 'clientName',
  'MCO': 'mco',
  'Member ID': 'memberId',
  'Phone Number': 'phone',
  'Date of Birth': 'dateOfBirth',
  'Intake Date (Assessment Start)': 'intakeDate',
  'Assessment Due Date': 'assessmentDueDate',
  'Assigned Staff': 'assignedStaff',
  '30-Day Auth Number': 'auth30Number',
  '30-Day Start Date': 'auth30Start',
  '30-Day End Date': 'auth30End',
  'LON Score': 'lonScore',
  'LON Level': 'lonLevel',
  'Approval Status': 'approvalStatus',
  '150-Day Auth Number': 'auth150Number',
  '150-Day Start Date': 'auth150Start',
  '150-Day End Date': 'auth150End',
  '180-Day Auth Number': 'auth180Number',
  '180-Day Start Date': 'auth180Start',
  '180-Day End Date': 'auth180End',
  'Current Case Status': 'caseStatus',
  'Next Action Due Date': 'nextActionDueDate',
  'Closed Date': 'closedDate',
  'Reason Closed': 'reasonClosed',
  'Notes': 'notes',
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Case Notes')
    .addItem('Preview what would be sent', 'previewSend')
    .addItem('Send new clients', 'doSend')
    .addToUi();
}

function collectRows_() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TAB);
  if (!sheet) throw new Error('No tab named ' + TAB);
  const values = sheet.getDataRange().getDisplayValues();

  // The heading row is the first one containing "Client Name".
  let headerAt = -1;
  for (let i = 0; i < values.length; i++) {
    if (values[i].indexOf('Client Name') !== -1) { headerAt = i; break; }
  }
  if (headerAt === -1) throw new Error('Could not find a "Client Name" heading on ' + TAB);

  const headers = values[headerAt];
  const rows = [];
  for (let r = headerAt + 1; r < values.length; r++) {
    const row = { rowNumber: r + 1 };
    let hasName = false;
    for (let c = 0; c < headers.length; c++) {
      const key = COLUMNS[String(headers[c]).trim()];
      if (!key) continue;
      const val = String(values[r][c]).trim();
      if (key === 'clientName' && val) hasName = true;
      if (val) row[key] = val;
    }
    if (hasName) rows.push(row);
  }
  return rows;
}

function send_(dryRun) {
  const rows = collectRows_();
  if (!rows.length) { SpreadsheetApp.getUi().alert('No client rows found on ' + TAB + '.'); return; }

  const res = UrlFetchApp.fetch(FUNCTION_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-intake-secret': SECRET },
    payload: JSON.stringify({ rows: rows, dryRun: dryRun }),
    muteHttpExceptions: true,
  });

  const body = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert('Case Notes said: ' + (body.error || res.getContentText()));
    return;
  }

  const made = body.created || [];
  const lines = [];
  lines.push(dryRun
    ? 'PREVIEW — nothing has been sent yet.'
    : 'Sent. ' + made.length + ' client(s) created.');
  lines.push('');
  lines.push((dryRun ? 'Would create: ' : 'Created: ') + made.length);
  made.forEach(function (c) {
    lines.push('  - ' + c.name + (c.workable ? '' : '  [not workable yet: ' + c.stillNeeded.join('; ') + ']'));
  });
  lines.push('');
  lines.push('Skipped: ' + (body.skipped || []).length);
  (body.skipped || []).slice(0, 25).forEach(function (s) {
    lines.push('  - row ' + s.row + ' ' + s.name + ' — ' + s.reason);
  });
  if ((body.skipped || []).length > 25) lines.push('  ...and more');

  SpreadsheetApp.getUi().alert(lines.join('\n'));
}

function previewSend() { send_(true); }
function doSend() { send_(false); }
```

## If something goes wrong

**"Unauthorized."** The secret in the script and the one in Supabase differ.

**Everything is skipped as "Already in the app."** That is the normal result on
an established caseload — it means nobody new has been added since last time.

**A column is ignored.** Its heading was renamed. Update `COLUMNS` to match.

**Nothing is ever created by a preview.** `dryRun` defaults to true on the
server too, so a request that omits it cannot write.
