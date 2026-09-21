# Move-in Supports: making the two request forms fillable

Work in progress. Neither form is wired into the app yet.

## What is here

| File | What it is |
|---|---|
| `move-in-supports-request-blank.pdf` | Horizon's nine-page Move-in Supports Request Form, rendered from the Word original (`docProps/app.xml` names Horizon Blue Cross Blue Shield of New Jersey; created 2026-01-28, revision 83). The Word file is a Word form — 269 text inputs, 74 check boxes, 524 check-box content controls — but a PDF export carries only 49 of them over, so the fields are placed here instead. |
| `wellpoint-move-in-request.pdf` | Wellpoint's seven-page form. Already a working AcroForm: 344 check boxes and 51 text fields, no length caps, 17 of them multi-line. It needs checking, not rebuilding. |
| `place-fields.py` | Places the fields on the Horizon form. Needs `pip install pymupdf`. |

## What the script does

445 fields: 299 tick boxes and 146 typing boxes.

- **Pages 5–9**: every tick box — 262 of them, matching the Word original page
  for page — and the 53 "# of Each" boxes beside the furniture and essentials.
  Names come from the label beside each box (`ketchup`, `lunch_meat_ham`,
  `1_twin_bed_set_qty`), taken from the innermost table that holds the box, so
  a grocery item is not named after the notice printed across the top of it.
- **Pages 1–3**: every typing blank, found as the run of en-spaces that Word's
  text inputs render as rather than guessed at from labels, and every tick box
  drawn as a little square. A box is named from whichever side its words are
  nearer: `application_fee` reads leftwards, `private_residence` rightwards.
- **Page 4**: the three questions each get a box in the space beneath them.
  The third gets most of the sheet, which is Horizon's layout rather than a
  choice made here.

A ticked box shows an **X** rather than a check: its "on" appearance is two
strokes corner to corner, and `/MK /CA (8)` says the same thing again for a
viewer that redraws the appearance instead of using the one it was given.

## What is not done

- **The corrected variant.** Two versions are wanted: Horizon's layout
  untouched, which is what this builds, and one with the page 7/8 break fixed.
- **A few names.** The blank under a tall cell takes its label from the line
  above, which gives `member` where `member_name` was meant. The handful that
  the client record maps onto are worth setting by hand.
- **Wiring.** Neither form is in `PDF_TEMPLATES`, and nothing maps their fields
  to or from the client record.

## The layout faults, for whoever fixes them

Found in the Word file itself, not in the rendering:

- `Coffe e` and `Bee f` — a stray space inside each word.

Found in the rendering, and probably but not certainly in Word too (Word
reports the same nine pages, but the exact break may differ):

- **Meats** is headed on page 7 and continues on page 8 with no heading, which
  is why `Lunch Meat / Ham or Salami or Turkey` sits on its own at the top
  right of page 8.
- **Various Groceries** splits mid-row, leaving an unlabelled fragment at the
  top right of page 8 that is really the tail of the `Broth` row.

Neither form has a signature field or a signature line. The Horizon form ends
with a certification backed only by Member Name and Date.
