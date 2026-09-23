"""Make Horizon's Move-in Supports Request Form fillable.

The Word original is already a Word form — 269 text inputs, 74 check boxes and
524 check-box content controls — but a PDF export carries only 49 of them over,
so the fields are placed onto the rendered page here instead.

Two things in the rendering make that reliable rather than guesswork:

  * every typing blank is a run of en-spaces, which is what Word's text inputs
    render as, so the blanks are found rather than inferred from labels;
  * every tick box on the grocery and furniture pages is the character U+2610,
    and every tick box on the front pages is a little drawn square.

A ticked box shows an X, which is how the form is filled in by hand.

    pip install pymupdf
    python3 scripts/move-in/place-fields.py

Writes `public/form-templates/move-in-supports-request.pdf`.
"""
import re
import sys

import pymupdf

SOURCE = 'scripts/move-in/move-in-supports-request-blank.pdf'
OUT = 'public/form-templates/move-in-supports-request.pdf'

BOX = '☐'
BLUE = (0.933333, 0.952941, 0.976471)   # the pale fill the other templates use
GREY = (0.541176, 0.541176, 0.541176)
FIELD_GREY = (0.85, 0.85, 0.85)          # Word's shading for a form field
LINE = 0.9
RIGHT_MARGIN = 558.0

is_blank = lambda t: bool(t) and t.strip('   ') == ''

# Page 4 asks three questions and leaves the rest of the sheet empty. In Word
# the answer fields grow; on a fixed page they cannot, so each question gets a
# box in the space beneath it. The third gets what is left, which is most of
# the page — that is Horizon's layout, not a choice made here.
PAGE_4_BOXES = [
    ('remediation_description', 116.0, 142.0),
    ('alternatives_exhausted', 172.0, 198.0),
    ('landlord_response', 214.0, 714.0),
]


# A name derived from the label beside a blank is good enough to tell two
# grocery boxes apart, but the fields the client record reads and writes need
# names that will not move when the form is re-rendered. These are those.
RENAMES = {
    # Three pages ask for the member's name. They are named apart rather than
    # together: giving them one name here produces three separate fields that
    # merely look alike, which share no value and leave the form ambiguous
    # about which is which. The app fills all three when it pre-fills, so
    # nobody types it three times anyway.
    'member': 'member_name',
    'member_name': 'member_name_remediation',
    'member_name_2': 'member_name_allergy',
    'member_s_height_and_weight': 'member_height_weight',
    'member_s_street': 'new_street_address',
    'city_town_and_zip_code': 'new_city_town_zip',
    'apartment': 'apartment_complex_name',
    'name': 'provider_contact_name',
    'telephone_number': 'provider_contact_phone',
    'email_address': 'provider_contact_email',
    'name_2': 'mco_housing_specialist_name',
    'name_3': 'key_contact_name',
    'telephone_number_2': 'key_contact_phone',
    'name_of_representative': 'landlord_representative_name',
    'telephone_number_3': 'landlord_phone',
    'email_address_2': 'landlord_email',
    'name_of_representative_2': 'realtor_representative_name',
    'telephone_number_4': 'realtor_phone',
    'email_address_3': 'realtor_email',
    'name_of_representative_3': 'mover_representative_name',
    'telephone_number_5': 'mover_phone',
    'email_address_4': 'mover_email',
}


def slug(s):
    s = re.sub(r'\(.*?\)', ' ', s).replace('&', ' and ').replace('#', ' number ')
    # The footnote marks on "Application Fee¹" number the instructions at the
    # top of the form; they are not part of what the box is for.
    s = re.sub(r'[^\x00-\x7f]+', ' ', s)
    s = re.sub(r"[^\w\s]+", ' ', s).strip().lower()
    return re.sub(r'\s+', '_', s)[:40].strip('_')


class Sheet:
    """One page, and the fields put on it — one to a spot, one to a name."""

    def __init__(self, page, seen):
        self.page = page
        self.seen = seen
        self.taken = []
        self.qty = []   # "# of Each" cells, which own the blanks inside them

    def free(self, rect):
        for x, y in self.taken:
            if abs(x - rect.x0) < 3 and abs(y - rect.y0) < 3:
                return False
        self.taken.append((rect.x0, rect.y0))
        return True

    def name(self, base):
        base = base or 'field'
        if base not in self.seen:
            self.seen.add(base)
            return base
        n = 2
        while f'{base}_{n}' in self.seen:
            n += 1
        self.seen.add(f'{base}_{n}')
        return f'{base}_{n}'

    def check(self, rect, label):
        if not self.free(rect):
            return False
        w = pymupdf.Widget()
        w.field_name = self.name(slug(label))
        w.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
        w.rect = rect
        w.border_color = GREY
        w.border_width = LINE
        w.field_value = False
        annot = self.page.add_widget(w)
        cross(self.page.parent, annot, rect)
        return True

    def text(self, rect, label, multiline=False, maxlen=None, fill=BLUE):
        if not self.free(rect):
            return False
        w = pymupdf.Widget()
        w.field_name = self.name(slug(label))
        w.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
        w.rect = rect
        w.text_font = 'Helv'
        # 0 is "size it to fit", which is what keeps a long answer on the page.
        w.text_fontsize = 0 if multiline else 10
        w.text_color = (0, 0, 0)
        w.fill_color = fill
        w.border_color = GREY
        w.border_width = LINE
        w.border_style = 'u'
        if maxlen:
            w.text_maxlen = maxlen
        if multiline:
            w.field_flags = 4096
        self.page.add_widget(w)
        return True


def cross(doc, annot, rect):
    """Make a ticked box show an X rather than a check mark.

    A viewer draws whatever the box's "on" appearance says, and what is written
    there by default is a check. It is replaced with two strokes corner to
    corner; the caption is set as well, for a viewer that regenerates the
    appearance instead of using the one it was handed.
    """
    doc.xref_set_key(annot.xref, 'MK', '<</CA(8)>>')
    ap = doc.xref_get_key(annot.xref, 'AP/N')
    if ap[0] != 'dict':
        return
    w, h = rect.width, rect.height
    pad = min(w, h) * 0.22
    art = (f'q 1.1 w 0 G {pad:.2f} {pad:.2f} m {w - pad:.2f} {h - pad:.2f} l S '
           f'{pad:.2f} {h - pad:.2f} m {w - pad:.2f} {pad:.2f} l S Q')
    for name, xref in re.findall(r'/([^\s/<>]+)\s+(\d+) 0 R', ap[1]):
        if name != 'Off':
            doc.update_stream(int(xref), art.encode(), compress=True)


def tables_innermost_first(page):
    """A grocery table sits inside a banner table; the inner one knows what a
    box is actually for, so it gets to claim the box and name it."""
    return sorted(page.find_tables().tables,
                  key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1]))


def cells_of(page):
    return [pymupdf.Rect(c) for t in page.find_tables().tables
            for row in t.rows for c in row.cells if c]


def ticked_lists(sheet):
    """Pages of tick boxes with a label each, and a "# of Each" beside some."""
    page = sheet.page
    for t in tables_innermost_first(page):
        rows = t.extract()
        for ri, row in enumerate(rows):
            labels = [c for c in row if c and BOX not in c]
            label = max(labels, key=len) if labels else ''
            for ci, cell in enumerate(row):
                if not t.rows[ri].cells[ci]:
                    continue
                r = pymupdf.Rect(t.rows[ri].cells[ci])
                if cell and BOX in cell:
                    for hit in page.search_for(BOX, clip=r):
                        own = [c for c in row[ci:] if c and BOX not in c]
                        nm = re.sub(r'_or$', '', slug(own[0] if own else label))
                        parent = re.sub(r'_or$', '', slug(label))
                        # "Juice … Apple or / Orange": the choice belongs to the
                        # thing it is a choice about, so it is named for both.
                        if parent and nm and parent != nm and not nm.startswith(parent):
                            nm = f'{parent}_{nm}'[:44]
                        sheet.check(pymupdf.Rect(hit.x0, hit.y0 + 1,
                                                 hit.x0 + 10, hit.y0 + 11), nm)
                elif ci == len(row) - 1 and not cell and label and r.width > 18:
                    # "# of Each": Horizon shades the cells that take a number
                    # grey — those are Word text inputs, and render as a blank —
                    # and fills the rest black. Only a grey one gets a box.
                    if any(is_blank(w[4]) for w in page.get_text('words', clip=r)):
                        sheet.qty.append(r)
                        sheet.text(pymupdf.Rect(r.x0 + 1, r.y0 + 1, r.x1 - 1, r.y1 - 1),
                                   slug(label) + '_qty', maxlen=6, fill=FIELD_GREY)


def blanks_and_squares(sheet):
    """The front pages: labelled blanks, and tick boxes drawn as squares."""
    page = sheet.page
    words = page.get_text('words')
    real = [w for w in words if not is_blank(w[4])]
    cells = cells_of(page)

    for b in (w for w in words if is_blank(w[4])):
        cy = (b[1] + b[3]) / 2
        # A "# of Each" input is one box for its cell, placed by ticked_lists,
        # however many lines its en-spaces happened to wrap onto.
        if any(q.contains(pymupdf.Point((b[0] + b[2]) / 2, cy)) for q in sheet.qty):
            continue
        line = [w for w in real if abs((w[1] + w[3]) / 2 - cy) < 6]
        left = sorted([w for w in line if w[2] <= b[0] + 1], key=lambda w: w[2])
        right = sorted([w for w in line if w[0] >= b[2] - 1], key=lambda w: w[0])

        phrase = []
        for w in reversed(left):
            phrase.insert(0, w[4])
            if len(phrase) > 1 and w[4].endswith(':'):
                phrase.pop(0)
                break
        # A tall cell puts the label on the line above its blank.
        if not phrase:
            above = [w for w in real if w[3] <= b[1] and b[1] - w[3] < 22
                     and w[0] < b[2] and w[2] > b[0] - 60]
            phrase = [w[4] for w in sorted(above, key=lambda w: (w[1], w[0]))[-4:]]

        edge = min([w[0] - 2 for w in right] + [RIGHT_MARGIN])
        for c in cells:
            if c.x0 - 1 <= b[0] <= c.x1 and c.y0 - 1 <= cy <= c.y1 + 1:
                edge = min(edge, c.x1 - 1)
        sheet.text(pymupdf.Rect(b[0], b[1] - 1, max(edge, b[0] + 20), b[3] + 1),
                   ' '.join(phrase))

    squares = []
    for dr in page.get_drawings():
        r = dr['rect']
        if (7 < r.width < 14 and 7 < r.height < 14 and abs(r.width - r.height) < 3
                and not any(abs(s.x0 - r.x0) < 2 and abs(s.y0 - r.y0) < 2 for s in squares)):
            squares.append(r)
    for s in squares:
        cy = (s.y0 + s.y1) / 2
        line = [w for w in real if abs((w[1] + w[3]) / 2 - cy) < 6]
        after = sorted([w for w in line if w[0] >= s.x1 - 1], key=lambda w: w[0])
        before = sorted([w for w in line if w[2] <= s.x0 + 1], key=lambda w: w[2])
        # A box is labelled on whichever side the words are nearer. "Application
        # Fee ☐" reads leftwards and "☐ Private Residence" rightwards, and the
        # gap is what says which — there is no rule about the words themselves.
        gap_left = s.x0 - before[-1][2] if before else 1e6
        gap_right = after[0][0] - s.x1 if after else 1e6
        if gap_left < gap_right:
            # The words running back from the box, as far as a reader would go:
            # "Application Fee ☐" is named for the words before it, and stopping
            # at a wide gap keeps the previous item's words out of it.
            phrase = []
            for w in reversed(before):
                if s.x0 - w[2] > 60:
                    break
                phrase.insert(0, w[4])
            label = ' '.join(phrase[-4:])
        else:
            label = ' '.join(w[4] for w in after[:4])
        sheet.check(s, label or 'box')


def build(source=SOURCE, out=OUT):
    doc = pymupdf.open(source)
    seen = set()
    for page in doc:
        sheet = Sheet(page, seen)
        if page.number == 3:
            for name, top, bottom in PAGE_4_BOXES:
                sheet.text(pymupdf.Rect(36, top, 572, bottom), name, multiline=True)
            continue
        ticked_lists(sheet)
        blanks_and_squares(sheet)

    for page in doc:
        for widget in page.widgets():
            better = RENAMES.get(widget.field_name)
            if better:
                widget.field_name = better
                widget.update()

    doc.save(out)
    return doc


if __name__ == '__main__':
    doc = build(*(sys.argv[1:3] or []))
    import collections
    kinds = collections.Counter(w.field_type_string for p in doc for w in p.widgets())
    per_page = collections.Counter(p.number + 1 for p in doc for w in p.widgets())
    print(f'{OUT}: {sum(kinds.values())} fields {dict(kinds)}')
    print('  by page:', dict(sorted(per_page.items())))
