"""Add the client's phone number to the top of the Client Intake.

The form asked for an emergency contact's phone but never the client's own.
This splits the Birth Date / SS# row in three: the SS# box is shortened and a
Phone box is added beside it, drawn in the same hand as the rest of the page.
The new field is named client_phone. Safe to run twice.

    pip install pymupdf
    python3 scripts/add-intake-phone.py
"""
import re
import sys

import pymupdf

TEMPLATE = 'public/form-templates/client-intake.pdf'
PAGE_HEIGHT = 792.0
BLUE = (0.933333, 0.952941, 0.976471)
GREY = (0.541176, 0.541176, 0.541176)
WHITE = (1, 1, 1)
LINE_WIDTH = 0.9
FIELD_DA = '/Helv 10 Tf 0 0 0 rg'

# The Birth Date / SS# row, top-left coordinates.
ROW_TOP, ROW_BOTTOM = 168.0, 184.0
SSN_X0, SSN_X1 = 291.0, 404.0
PHONE_LABEL_X = 414.0
PHONE_X0, PHONE_X1 = 449.0, 558.0


def appearance_xref(doc, xref):
    return int(re.search(r'(\d+) 0 R', doc.xref_get_key(xref, 'AP')[1]).group(1))


def main():
    doc = pymupdf.open(TEMPLATE)
    page = doc[0]
    widgets = {w.field_name: w.xref for w in page.widgets()}
    if 'client_phone' in widgets:
        print('client-intake.pdf: already has the client phone')
        return 0

    # Clear the right end of the SS# box, then draw the Phone label and box.
    page.draw_rect(pymupdf.Rect(SSN_X1, ROW_TOP - 2, 562, ROW_BOTTOM + 2), color=None, fill=WHITE)
    foot = ROW_BOTTOM - LINE_WIDTH / 2
    page.draw_line(pymupdf.Point(SSN_X0, foot), pymupdf.Point(SSN_X1, foot), color=GREY, width=LINE_WIDTH)
    phone = pymupdf.Rect(PHONE_X0, ROW_TOP, PHONE_X1, ROW_BOTTOM)
    page.draw_rect(phone, color=None, fill=BLUE)
    page.draw_line(pymupdf.Point(phone.x0, foot), pymupdf.Point(phone.x1, foot), color=GREY, width=LINE_WIDTH)
    page.insert_text(pymupdf.Point(PHONE_LABEL_X, ROW_TOP + 11.5), 'Phone:', fontname='helv', fontsize=10, color=(0, 0, 0))

    # Shorten the SS# field to its new box.
    doc.xref_set_key(widgets['ssn'], 'Rect', '[%g %g %g %g]' % (
        SSN_X0, PAGE_HEIGHT - ROW_BOTTOM, SSN_X1, PAGE_HEIGHT - ROW_TOP))

    # The Phone field, behaving like the Birth Date field beside it.
    widget = pymupdf.Widget()
    widget.field_name = 'client_phone'
    widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    widget.rect = phone
    widget.text_font = 'Helv'
    widget.text_fontsize = 10
    widget.text_color = (0, 0, 0)
    widget.text_maxlen = 100
    widget.fill_color = BLUE
    widget.border_color = GREY
    widget.border_width = LINE_WIDTH
    widget.border_style = 'u'
    annot = page.add_widget(widget)
    doc.xref_set_key(annot.xref, 'DA', pymupdf.get_pdf_str(FIELD_DA))
    model = appearance_xref(doc, widgets['birth_date'])
    mine = appearance_xref(doc, annot.xref)
    doc.update_object(mine, doc.xref_object(model, compressed=False))
    doc.update_stream(mine, doc.xref_stream(model), compress=True)
    # The model is wider; keep the drawing to this box.
    doc.xref_set_key(mine, 'BBox', '[0 0 %g %g]' % (phone.width, phone.height))

    doc.saveIncr()
    print('client-intake.pdf: added the client phone')
    return 0


if __name__ == '__main__':
    sys.exit(main())
