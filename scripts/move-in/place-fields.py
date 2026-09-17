"""Place AcroForm fields onto the rendered Move-in Supports Request form."""
import pymupdf, re, sys, json, collections

BOX = '☐'
BLUE = (0.933333, 0.952941, 0.976471)
GREY = (0.541176, 0.541176, 0.541176)

def slug(s):
    s = re.sub(r'\(.*?\)', ' ', s)          # drop "(Est Value $550)"
    s = s.replace('&', ' and ')
    s = re.sub(r'[^\w\s]+', ' ', s).strip().lower()
    s = re.sub(r'\s+', '_', s)
    return s[:40].strip('_')

def unique(base, seen):
    name = base or 'box'
    if name not in seen:
        seen.add(name); return name
    n = 2
    while f'{name}_{n}' in seen: n += 1
    seen.add(f'{name}_{n}'); return f'{name}_{n}'

def checkbox(page, rect, name):
    """A box that takes an X when it is clicked, rather than a typed one."""
    w = pymupdf.Widget()
    w.field_name = name
    w.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
    w.rect = rect
    w.border_color = GREY
    w.border_width = 0.9
    w.field_value = False
    annot = page.add_widget(w)
    cross(page.parent, annot, rect)
    return annot


def cross(doc, annot, rect):
    """Make a ticked box show an X, which is how this form is filled in by hand.

    A viewer draws whatever the box's "on" appearance says, and what pymupdf
    writes there is a check mark. The stream is replaced with two strokes
    corner to corner; the caption is set as well, for a viewer that regenerates
    the appearance rather than using the one it was given.
    """
    doc.xref_set_key(annot.xref, 'MK', '<</CA(8)>>')
    ap = doc.xref_get_key(annot.xref, 'AP/N')
    if ap[0] != 'dict':
        return
    w, h = rect.width, rect.height
    pad = min(w, h) * 0.22
    art = (f'q 1.1 w 0 G {pad:.2f} {pad:.2f} m {w - pad:.2f} {h - pad:.2f} l S '
           f'{pad:.2f} {h - pad:.2f} m {w - pad:.2f} {pad:.2f} l S Q')
    for state in re.findall(r'/([^\s/<>]+)\s+(\d+) 0 R', ap[1]):
        name, xref = state[0], int(state[1])
        if name in ('Off',):
            continue
        doc.update_stream(xref, art.encode(), compress=True)

def textfield(page, rect, name, multiline=False, maxlen=None):
    w = pymupdf.Widget()
    w.field_name = name
    w.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
    w.rect = rect
    w.text_font = 'Helv'
    w.text_fontsize = 0 if multiline else 10
    w.text_color = (0, 0, 0)
    w.fill_color = BLUE
    w.border_color = GREY
    w.border_width = 0.9
    w.border_style = 'u'
    if maxlen: w.text_maxlen = maxlen
    if multiline: w.field_flags = 4096
    page.add_widget(w)

def build(src, out):
    doc = pymupdf.open(src)
    seen = set()
    stats = collections.Counter()

    for page in doc:
        # Nested tables are reported twice, so the same glyph comes round
        # again; one field per spot on the page.
        taken = []
        def free(r):
            for t in taken:
                if abs(t[0] - r.x0) < 3 and abs(t[1] - r.y0) < 3:
                    return False
            taken.append((r.x0, r.y0)); return True
        # Smallest first: a grocery table sits inside a banner table, and it
        # is the inner one that knows a box is for bagels rather than for the
        # notice printed across the top of the page.
        tables = sorted(page.find_tables().tables,
                        key=lambda t: (t.bbox[2] - t.bbox[0]) * (t.bbox[3] - t.bbox[1]))
        for t in tables:
            cells = t.extract()
            for ri, row in enumerate(cells):
                # The label for this row is its longest non-box cell.
                labels = [c for c in row if c and BOX not in c]
                label = max(labels, key=len) if labels else ''
                for ci, cell in enumerate(row):
                    rect = t.rows[ri].cells[ci]
                    if not rect:
                        continue
                    r = pymupdf.Rect(rect)
                    if cell and BOX in cell:
                        # the box sits at the left of its own cell
                        hits = [h for h in page.search_for(BOX, clip=r)]
                        for h in hits:
                            box = pymupdf.Rect(h.x0, h.y0 + 1, h.x0 + 10, h.y0 + 11)
                            if not free(box):
                                continue
                            own = [c for c in row[ci:] if c and BOX not in c]
                            # "Juice … Apple or / Orange": the choice belongs to
                            # the thing it is a choice about, so it is named for
                            # both. The trailing "or" is grammar, not a name.
                            nm = slug(own[0]) if own else slug(label)
                            nm = re.sub(r'_or$', '', nm)
                            parent = slug(label)
                            parent = re.sub(r'_or$', '', parent)
                            if parent and nm and parent != nm and not nm.startswith(parent):
                                nm = f'{parent}_{nm}'[:44]
                            checkbox(page, box, unique(nm, seen))
                            stats['checkbox'] += 1
                    elif (not cell and label and ci == len(row) - 1
                          and all(c for c in row[:-1])
                          and ' or' not in label.lower()
                          and r.width > 18 and r.height > 8):
                        # The rightmost empty cell of a fully-filled row is the
                        # "# of Each" column. A row whose label ends in "or" is
                        # a choice between two things, not a count of one.
                        qty = pymupdf.Rect(r.x0 + 1, r.y0 + 1, r.x1 - 1, r.y1 - 1)
                        if free(qty):
                            textfield(page, qty, unique(slug(label) + '_qty', seen), maxlen=6)
                            stats['quantity'] += 1
    doc.save(out)
    print(f'{out}: {dict(stats)}  total {sum(stats.values())}')
    return stats

build('mis.pdf', 'mis_fields.pdf')
