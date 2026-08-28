"""Turn the agency's document manifest into importer-ready CSVs.

The manifest describes 2,034 documents across six ZIPs. The bulk importer wants
different column names and one manifest per upload, so this emits one CSV per
ZIP, named to match it.

    python3 scripts/convert_manifest.py

Nothing about the source spreadsheet needs changing — it is read as it is.
"""

import collections
import csv
import os
import re
import sys

import openpyxl

SRC = ('/Users/miskiyatjimba/Library/CloudStorage/GoogleDrive-mdajimba@gmail.com/'
       'My Drive/ALL MCO/_MANIFEST - all documents.xlsx')
OUT_DIR = os.path.expanduser('~/Desktop/Claude Workspace/Projects/'
                             'Supportive Care Management/import-manifests')

COLUMNS = ['source_file', 'client_name', 'date_of_birth', 'member_id', 'mco',
           'form_type', 'form_date', 'lon_score', 'diagnosis_code', 'notes']


def app_document_types():
    """The names in src/lib/documentRecognition.ts, so a drift between the
    manifest and the app is reported instead of discovered after an import."""
    src = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'src', 'lib', 'documentRecognition.ts')
    try:
        body = open(src, encoding='utf-8').read()
    except OSError:
        return set()
    block = re.search(r'export const DOCUMENT_TYPES = \[(.*?)\] as const;', body, re.S)
    if not block:
        return set()
    # Drop `//` comments first. An apostrophe inside one ("Availity's receipt")
    # otherwise reads as an opening quote and swallows the names around it.
    code = re.sub(r'//[^\n]*', '', block.group(1))
    return set(re.findall(r"'([^']+)'", code))


def text(v):
    if v is None:
        return ''
    if hasattr(v, 'strftime'):
        return v.strftime('%Y-%m-%d')
    return str(v).strip()


def main():
    wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
    rows = wb['DOCUMENT MANIFEST'].iter_rows(values_only=True)
    header = [text(h) for h in next(rows)]
    records = [dict(zip(header, r)) for r in rows]

    os.makedirs(OUT_DIR, exist_ok=True)
    by_zip = collections.defaultdict(list)
    unmapped = collections.Counter()

    known = app_document_types()
    for r in records:
        raw = text(r.get('document_type'))
        # Straight through. A name the app does not carry is reported rather
        # than silently blanked, because that is a real disagreement between
        # the manifest and DOCUMENT_TYPES and someone has to settle it.
        if raw and known and raw not in known:
            unmapped[raw] += 1
        by_zip[text(r.get('zip_file'))].append({
            'source_file': text(r.get('relative_path')),
            'client_name': text(r.get('client_name')),
            'date_of_birth': text(r.get('date_of_birth')),
            'member_id': text(r.get('member_id')),
            'mco': text(r.get('mco')),
            'form_type': raw,
            'form_date': text(r.get('document_date')),
            'lon_score': text(r.get('lon_score')),
            'diagnosis_code': text(r.get('diagnosis_code')),
            # Kept so a reviewer can see where a document sat in the old filing.
            'notes': ' | '.join(x for x in [text(r.get('pipeline_stage')),
                                            text(r.get('case_status'))] if x),
        })

    for zip_name, rs in sorted(by_zip.items()):
        stem = os.path.splitext(zip_name)[0] or 'unsorted'
        path = os.path.join(OUT_DIR, f'{stem} - manifest.csv')
        with open(path, 'w', newline='', encoding='utf-8') as fh:
            w = csv.DictWriter(fh, fieldnames=COLUMNS)
            w.writeheader()
            w.writerows(rs)
        with_id = sum(1 for r in rs if r['member_id'])
        typed = sum(1 for r in rs if r['form_type'])
        print(f'{len(rs):>5} rows  {with_id:>5} with member ID  {typed:>5} typed  ->  {os.path.basename(path)}')

    if unmapped:
        print('\ndocument types in the manifest that DOCUMENT_TYPES does not '
              'carry. They are still written out as they are; add them to '
              'src/lib/documentRecognition.ts or correct the manifest:')
        for name, count in unmapped.most_common():
            print(f'  {count:>5}  {name}')
    print(f'\nwritten to {OUT_DIR}')


if __name__ == '__main__':
    sys.exit(main())
