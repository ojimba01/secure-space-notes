"""Give question 52 of the Client Intake six household members instead of four.

The form asks who else will be living with the member and then leaves room for
four names. Four is not a large family, so this adds a fifth and a sixth row in
the same hand as the first four, and moves question 53 — Additional Information
/ Comments — two rows down the page to make space for them. Everything else on
page 6 is left where it was.

The template is a generated artefact whose own generator is not in this
repository, so this patches it rather than rebuilding it. It is safe to run
twice: a template that already has six rows is left alone.

    pip install pymupdf
    python3 scripts/extend-household-rows.py

Afterwards, run scripts/relax-form-templates.mjs if the big answer boxes have
not already been relaxed.
"""
import re
import sys

import pymupdf

TEMPLATE = 'public/form-templates/client-intake.pdf'
PAGE = 5  # page 6, counting from zero

# How the existing rows are drawn. Row four is the one the new rows copy.
PITCH = 47.0                                    # from one Name row to the next
BLUE = (0.933333, 0.952941, 0.976471)           # the pale fill of an answer box
GREY = (0.541176, 0.541176, 0.541176)           # its rule and border
WHITE = (1, 1, 1)
LINE_WIDTH = 0.9
LABEL_BASELINE = 11.5                           # below the top of its box
NAME_BOX = (99.45, 464.0, 468.43, 480.0)
AGE_BOX = (503.0, 464.0, 558.0, 480.0)
RELATIONSHIP_BOX = (127.8, 486.0, 327.8, 502.0)
LABEL_X = 66.0
AGE_LABEL_X = 478.43

# Question 53, which has to move down by the two new rows.
SHIFT = 2 * PITCH
Q53_HEADING = '53. Additional Information / Comments:'
Q53_HEADING_BASELINE = 521.0
Q53_BOX = pymupdf.Rect(54, 525, 558, 621)
# Wide enough to take in the heading and the box, clear of row four above
# (which ends at 502) and of the footer rule below (at 750).
Q53_AREA = pymupdf.Rect(50, 504, 562, 626)

FIELD_DA = '/Helv 10 Tf 0 0 0 rg'
FIELD_MAX_LEN = 100
PAGE_HEIGHT = 792.0


def shifted(box, dy):
    x0, y0, x1, y1 = box
    return pymupdf.Rect(x0, y0 + dy, x1, y1 + dy)


def draw_answer_box(page, rect):
    """A one-line answer box: the pale fill, then the rule along its foot."""
    page.draw_rect(rect, color=None, fill=BLUE)
    foot = rect.y1 - LINE_WIDTH / 2
    page.draw_line(pymupdf.Point(rect.x0, foot), pymupdf.Point(rect.x1, foot),
                   color=GREY, width=LINE_WIDTH)


def label(page, x, baseline, text, bold=False):
    page.insert_text(pymupdf.Point(x, baseline), text,
                     fontname='hebo' if bold else 'helv',
                     fontsize=10, color=(0, 0, 0))


def appearance_xref(doc, xref):
    """The object holding a widget's drawn appearance."""
    return int(re.search(r'(\d+) 0 R', doc.xref_get_key(xref, 'AP')[1]).group(1))


def add_field(doc, page, name, rect, modelled_on):
    """A text field drawn and behaving exactly like the four above it."""
    widget = pymupdf.Widget()
    widget.field_name = name
    widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    widget.rect = rect
    widget.text_font = 'Helv'
    widget.text_fontsize = 10
    widget.text_color = (0, 0, 0)
    widget.text_maxlen = FIELD_MAX_LEN
    widget.fill_color = BLUE
    widget.border_color = GREY
    widget.border_width = LINE_WIDTH
    widget.border_style = 'u'
    annot = page.add_widget(widget)

    # pymupdf writes the colour before the font; the rest of the form writes it
    # after. Same instruction either way, but keep the file uniform.
    doc.xref_set_key(annot.xref, 'DA', pymupdf.get_pdf_str(FIELD_DA))

    # It also underlines a field by drawing a box around it, which would make
    # the new rows the only boxed ones on the page. The row above is the same
    # size, so take its drawing wholesale.
    model = appearance_xref(doc, modelled_on)
    mine = appearance_xref(doc, annot.xref)
    doc.update_object(mine, doc.xref_object(model, compressed=False))
    doc.update_stream(mine, doc.xref_stream(model), compress=True)


def main():
    doc = pymupdf.open(TEMPLATE)
    page = doc[PAGE]

    if any(w.field_name == 'member_5_name' for w in page.widgets()):
        print('client-intake.pdf: already has six household rows')
        return 0

    by_name = {w.field_name: w.xref for w in page.widgets()}
    comments = by_name['additional_comments']
    # Row four is what rows five and six are copied from, down to its drawing.
    models = {part: by_name[f'member_4_{part}'] for part in ('name', 'age', 'relationship')}

    # 1. Take question 53's heading out of the page's text, and hide the box it
    #    was drawn over. Redaction lifts the text cleanly; it leaves vector art
    #    behind, so the box is covered instead — the page under it is blank.
    page.add_redact_annot(Q53_AREA)
    page.apply_redactions(text=pymupdf.PDF_REDACT_TEXT_REMOVE,
                          graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                          images=pymupdf.PDF_REDACT_IMAGE_NONE)
    page.draw_rect(pymupdf.Rect(53, 524, 559, 622), color=None, fill=WHITE)

    # 2. Rows five and six, one and two pitches below row four.
    for row, dy in ((5, PITCH), (6, 2 * PITCH)):
        name = shifted(NAME_BOX, dy)
        age = shifted(AGE_BOX, dy)
        relationship = shifted(RELATIONSHIP_BOX, dy)
        for rect in (name, age, relationship):
            draw_answer_box(page, rect)
        label(page, LABEL_X, name.y0 + LABEL_BASELINE, 'Name:')
        label(page, AGE_LABEL_X, name.y0 + LABEL_BASELINE, 'Age:')
        label(page, LABEL_X, relationship.y0 + LABEL_BASELINE, 'Relationship:')

    # 3. Question 53, two rows further down.
    page.draw_rect(shifted(tuple(Q53_BOX), SHIFT), color=GREY, fill=BLUE,
                   width=LINE_WIDTH)
    label(page, 54, Q53_HEADING_BASELINE + SHIFT, Q53_HEADING, bold=True)

    # 4. The fields themselves. The comments box only moves, so its rectangle is
    #    rewritten rather than the widget rebuilt: rebuilding it would redraw
    #    the field and put back the fixed font size it was deliberately given
    #    up (see src/lib/pdfFormFields.ts).
    for row, dy in ((5, PITCH), (6, 2 * PITCH)):
        add_field(doc, page, f'member_{row}_name', shifted(NAME_BOX, dy), models['name'])
        add_field(doc, page, f'member_{row}_age', shifted(AGE_BOX, dy), models['age'])
        add_field(doc, page, f'member_{row}_relationship',
                  shifted(RELATIONSHIP_BOX, dy), models['relationship'])

    moved = shifted(tuple(Q53_BOX), SHIFT)
    doc.xref_set_key(comments, 'Rect', '[%g %g %g %g]' % (
        moved.x0, PAGE_HEIGHT - moved.y1, moved.x1, PAGE_HEIGHT - moved.y0))

    doc.saveIncr()
    print('client-intake.pdf: question 52 now takes six household members')
    return 0


if __name__ == '__main__':
    sys.exit(main())
