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
import sys

import openpyxl

SRC = ('/Users/miskiyatjimba/Library/CloudStorage/GoogleDrive-mdajimba@gmail.com/'
       'My Drive/ALL MCO/_MANIFEST - all documents.xlsx')
OUT_DIR = os.path.expanduser('~/Desktop/Claude Workspace/Projects/'
                             'Supportive Care Management/import-manifests')

# The manifest's own document names, in the app's vocabulary.
DOC_TYPE = {
    'Initial Assessment (IAT)': 'Initial Assessment Tool',
    'Level of Need (LON)': 'Level of Need Assessment Tool',
    'Housing Stabilization Plan (HSP)': 'Housing Stabilization Plan',
    'Approval Letter': 'Authorization Approval',
    'Auth Request (Wellpoint)': 'MCO Authorization Request',
    'Auth Request (Aetna)': 'MCO Authorization Request',
    'Auth Request': 'MCO Authorization Request',
    'Signature Page': 'Signature Page',
    'Signature Page (HSP)': 'Signature Page',
    'Signature Page (IAT)': 'Signature Page',
    'Billing Schedule': 'Billing',
    'Claim Confirmation': 'Billing',
    'Lease or Housing Document': 'Lease / Occupancy',
    'Medicaid Eligibility': 'ID / Verification',
    'Benefit Award Letter': 'Income / Benefits',
    'Referral': 'Referral',
    'Face Sheet': 'Other',
    'Statement of Truth': 'Other',
    'Unsorted': 'Other',
    # Stragglers: one-off spellings from the original filing.
    'Signature Page (LON)': 'Signature Page',
    'Signature Page (HSP), Signed': 'Signature Page',
    'Signature Page, Signed': 'Signature Page',
    'Signed': 'Signature Page',
    'Progress Note': 'Progress Note',
    'Denial Letter': 'Correspondence',
    'Eviction Notice': 'Lease / Occupancy',
}

COLUMNS = ['source_file', 'client_name', 'date_of_birth', 'member_id', 'mco',
           'form_type', 'form_date', 'lon_score', 'diagnosis_code', 'notes']


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

    for r in records:
        raw = text(r.get('document_type'))
        mapped = DOC_TYPE.get(raw, '')
        if raw and not mapped:
            unmapped[raw] += 1
        by_zip[text(r.get('zip_file'))].append({
            'source_file': text(r.get('relative_path')),
            'client_name': text(r.get('client_name')),
            'date_of_birth': text(r.get('date_of_birth')),
            'member_id': text(r.get('member_id')),
            'mco': text(r.get('mco')),
            'form_type': mapped,
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
        print('\ndocument types with no equivalent in the app (left blank, the '
              'importer will fall back to reading the file):')
        for name, count in unmapped.most_common():
            print(f'  {count:>5}  {name}')
    print(f'\nwritten to {OUT_DIR}')


if __name__ == '__main__':
    sys.exit(main())
