# Move-in Supports: making the two request forms fillable

Work in progress. Neither form is wired into the app yet.

## What is here

| File | What it is |
|---|---|
| `move-in-supports-request-blank.pdf` | Horizon's nine-page Move-in Supports Request Form (January 2026 revision, file dated February 2026), printed to PDF from Word itself, so the pages break exactly where Word breaks them. The Word file is a Word form, but none of its fields survive the printout, so they are placed here instead. |
| `wellpoint-move-in-request.pdf` | Wellpoint's seven-page form. Already a working AcroForm: 344 check boxes and 51 text fields, no length caps, 17 of them multi-line. It needs checking, not rebuilding. |
| `place-fields.py` | Places the fields on the Horizon form. Needs `pip install pymupdf`. |

## What the script does

392 fields: 299 tick boxes and 93 typing boxes.

- **Pages 5–8**: every tick box, 262 of them, one for each ☐ on the page.
  Names come from the label beside each box (`ketchup`,
  `lunch_meat_ham`), taken from the innermost table that holds the box, so a
  grocery item is not named after the notice printed across the top of it.
- **"# of Each"**: Horizon fills some of these cells black and leaves the
  rest for a number (grey in Word, where each one is a text input). A box
  goes only in a cell that is not black — 21 of them, shaded grey as Word
  shows it, named for the row (`1_couch_qty`).
- **Pages 1–3 and 9**: a typing blank is the room after a label ending in a
  colon (or a lone `a.` `b.` `c.`), running to the next words on the line,
  the cell's edge or the margin. A few headings that end in a colon without
  asking anything are left out by name. Tick boxes are the little drawn
  squares, each named from whichever side its words are nearer:
  `application_fee` reads leftwards, `private_residence` rightwards.
- **Page 4**: each of the three questions gets a box in the space beneath
  it. The third gets most of the sheet, which is Horizon's layout rather
  than a choice made here.

A ticked box shows an **X** rather than a check: its "on" appearance is two
strokes corner to corner, and `/MK /CA (8)` says the same thing again for a
viewer that redraws the appearance instead of using the one it was given.

## What is not done

- **Wiring.** Neither form is in `PDF_TEMPLATES`, so the app does not offer
  them yet. The map between the client record and the Horizon form's fields
  is in `src/lib/moveIn.ts`.
- **Wellpoint's form** has not been checked against the client record.

One version of the form, as close to Horizon's as possible. An earlier
build worked from a LibreOffice rendering, which broke the grocery pages
in the wrong places; that was the rendering, not Horizon, and it is gone.

The Word file itself has two typos, left as they are: `Coffe e` and `Bee f`.

Neither form has a signature field or a signature line. The Horizon form ends
with a certification backed only by Member Name and Date.
