"""Make Horizon's Move-in Supports Request Form fillable.

The Word original is a Word form, but its fields do not survive the trip to
PDF, so they are placed onto the page here instead. The page is Word's own
printout (`move-in-supports-request-blank.pdf`), so the layout is Horizon's,
page for page.

  * a typing blank is the room after a label ending in a colon, up to the next
    words on the line, the cell's edge or the margin;
  * every tick box on the grocery and furniture pages is the character U+2610,
    and every tick box on the front pages is a little drawn square;
  * a "# of Each" cell takes a number unless Horizon filled it black.

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


PAGE_4_QUESTIONS = [
    ('remediation_description', 'Description of Requested Remediation'),
    ('alternatives_exhausted', 'What alternatives were exhausted'),
    ('landlord_response', "Housing Specialist"),
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
    'member_name_2': 'member_name_remediation',
    'member_name_3': 'member_name_allergy',
    'member_s_height_and_weight': 'member_height_weight',
    'street_address_and_apt': 'new_street_address',
    'city_town_and_zip_code': 'new_city_town_zip',
    'apartment_complex_name': 'apartment_complex_name',
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
    'i_have_the_following_known_food_allergie': 'known_food_allergies',
    'other': 'extermination_other',
    # Page 3's mover questions, named for what they ask rather than how.
    '1_tentative_move_date': 'tentative_move_date',
    'a': 'mover_window_1',
    'b': 'mover_window_2',
    'c': 'mover_window_3',
    '3_address_mover_is_picking_up_from': 'mover_pickup_address',
    'responsible_party_at_pickup': 'mover_pickup_contact',
    'backup_party': 'mover_pickup_backup',
    'no_drop_off_at_storage_units': 'mover_drop_off_address',
    'responsible_party_at_drop_off_location': 'mover_drop_off_contact',
    'backup_party_2': 'mover_drop_off_backup',
    'a_2': 'items_being_moved',
    '6_do_any_items_being_moved_need_to_be_as': 'items_need_assembly',
    'list_out_items_that_require_assembly': 'items_requiring_assembly',
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
    # The default reading drops a table's last row when its bottom rule is
    # drawn apart from the rest; the strict one keeps it but merges others.
    # Both are read, and a box that both find is placed once.
    tables = page.find_tables().tables + page.find_tables(strategy='lines_strict').tables
    return sorted(tables,
                  key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1]))


def cells_of(page):
    return [pymupdf.Rect(c) for t in page.find_tables().tables
            for row in t.rows for c in row.cells if c]


def dark_boxes(page):
    """The cells Horizon filled black, which take nothing."""
    return [dr['rect'] for dr in page.get_drawings()
            if dr.get('fill') and max(dr['fill']) < 0.2
            and dr['rect'].width > 8 and dr['rect'].height > 6]


def ticked_lists(sheet):
    """Pages of tick boxes with a label each, and a "# of Each" beside some."""
    page = sheet.page
    dark = dark_boxes(page)
    for t in tables_innermost_first(page):
        rows = t.extract()
        tx1 = t.bbox[2]
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

            # "# of Each": the room between a row's last words and the table's
            # right edge. Horizon fills it black where no number is wanted and
            # leaves it for a number where one is — grey in Word, white here.
            cells = [pymupdf.Rect(c) for c in t.rows[ri].cells if c]
            lead = [c for c in cells if BOX in page.get_textbox(c)]
            if not label or not lead or lead[0].x0 - t.bbox[0] > 30:
                continue
            worded = [c for c in cells if page.get_textbox(c).strip()]
            box = pymupdf.Rect(max(c.x1 for c in worded), t.rows[ri].bbox[1],
                               tx1, t.rows[ri].bbox[3])
            if not 18 <= box.width <= 50:
                continue
            centre = pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2)
            if any(q.contains(centre) for q in sheet.qty):
                continue
            if any(d.contains(pymupdf.Point((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2))
                   for d in dark):
                continue
            sheet.qty.append(box)
            sheet.text(pymupdf.Rect(box.x0 + 2, box.y0 + 2, box.x1 - 2, box.y1 - 2),
                       slug(label) + '_qty', maxlen=6, fill=FIELD_GREY)


# A label is the words up to a colon; its blank is the room after it, up to the
# next words on the line, the cell's edge or the margin. Word's typing blanks
# are invisible in a printed PDF, so this is where a person would write.
LABEL_END = re.compile(r'[:?]$')
LETTER = re.compile(r'^[a-z]\.$')      # "a." "b." "c." — a list to write into
MIN_BLANK = 40
# Headings and instructions that end in a colon without asking for an answer.
NOT_BLANKS = {'remediation_service_requested', 'move_in_supports_requested',
              'please_check_the_appropriate_box'}


def lines_of(words):
    lines = []
    for w in sorted(words, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        cy = (w[1] + w[3]) / 2
        if lines and abs(lines[-1][0] - cy) < 4:
            lines[-1][1].append(w)
        else:
            lines.append((cy, [w]))
    return [sorted(ws, key=lambda w: w[0]) for _, ws in lines]


def blanks_and_squares(sheet):
    """The front pages: labelled blanks, and tick boxes drawn as squares."""
    page = sheet.page
    words = [w for w in page.get_text('words') if w[4].strip()]
    cells = cells_of(page)

    squares = []
    for dr in page.get_drawings():
        r = dr['rect']
        if (7 < r.width < 14 and 7 < r.height < 14 and abs(r.width - r.height) < 3
                and not any(abs(s.x0 - r.x0) < 2 and abs(s.y0 - r.y0) < 2 for s in squares)):
            squares.append(r)

    for line in lines_of(words):
        start = 0
        for i, w in enumerate(line):
            nxt = line[i + 1] if i + 1 < len(line) else None
            if nxt and nxt[0] - w[2] > 30:
                ended = LABEL_END.search(w[4]) or LETTER.match(w[4])
            else:
                ended = (LABEL_END.search(w[4]) or (LETTER.match(w[4]) and i == start)) and True
            if not ended:
                if nxt and nxt[0] - w[2] > 30:
                    start = i + 1
                continue
            phrase = [x[4] for x in line[start:i + 1]]
            start = i + 1
            cy = (w[1] + w[3]) / 2
            edge = min([RIGHT_MARGIN]
                       + ([nxt[0] - 6] if nxt else [])
                       + [s.x0 - 4 for s in squares if s.x0 > w[2] and abs((s.y0 + s.y1) / 2 - cy) < 6])
            for c in cells:
                if c.x0 - 1 <= w[2] <= c.x1 and c.y0 - 1 <= cy <= c.y1 + 1:
                    edge = min(edge, c.x1 - 2)
            x0 = w[2] + 4
            if edge - x0 < MIN_BLANK:
                continue
            if any(q.contains(pymupdf.Point(x0 + 2, cy)) for q in sheet.qty):
                continue
            if slug(' '.join(phrase)) in NOT_BLANKS:
                continue
            sheet.text(pymupdf.Rect(x0, w[1] - 1.5, edge, w[3] + 1.5), ' '.join(phrase))

    real = words
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


def page_4_boxes(page):
    """Page 4 asks three questions into empty space. Each gets a box beneath
    it; the last gets the rest of the sheet, which is Horizon's layout."""
    starts = []
    for needle in PAGE_4_QUESTIONS:
        hit = page.search_for(needle[1])
        starts.append((needle[0], hit[0]))
    footer = page.search_for('This Document is Proprietary')[0].y0
    out = []
    for i, (name, hit) in enumerate(starts):
        # The question may wrap; its box starts under its last line.
        top = max(w[3] for w in page.get_text('words')
                  if hit.y0 - 1 <= w[1] and w[3] <= (starts[i + 1][1].y0 if i + 1 < len(starts) else footer)
                  and w[1] < hit.y0 + 30) + 3
        bottom = (starts[i + 1][1].y0 - 6) if i + 1 < len(starts) else footer - 12
        out.append((name, top, bottom))
    return out


def build(source=SOURCE, out=OUT):
    doc = pymupdf.open(source)
    seen = set()
    for page in doc:
        sheet = Sheet(page, seen)
        if page.number == 3:
            for name, top, bottom in page_4_boxes(page):
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
