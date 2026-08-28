"""Turn the agency's intake PDF into a fillable template.

The source is a printed form: typed underscores and empty ballot boxes, no form
fields. This finds each blank and each box and lays a named AcroForm widget over
it, so the app can fill it, read it back, and store the answers as data.

Field names are the `client_intakes` column names, exactly. That is the whole
trick: the reader needs no lookup table, and a field named wrongly fails loudly
instead of silently dropping an answer.

  <column>              a text field
  <column>__yes / __no  the two halves of a Yes/No question
  <column>__<Option>    one option of a multiple-choice question

Re-run after replacing the source PDF:
    python3 scripts/build_intake_template.py
"""

import json
import sys
import pymupdf

SRC = ('/Users/miskiyatjimba/Desktop/Claude Workspace/Projects/'
       'Supportive Care Management/housingsupportforms/'
       'INTAKE -HOUSING AND SUPPORTIVE SERVICES.pdf')
OUT = ('/Users/miskiyatjimba/Desktop/Claude Workspace/Projects/'
       'Supportive Care Management/secure-space-notes/public/form-templates/'
       'client-intake.pdf')

# blanks / boxes, in reading order, for each line of the form that has any.
MAP = {
  0:  (['full_name'], []),
  1:  (['birth_date', 'ssn'], []),
  2:  ([], ['gender__Male', 'gender__Female']),
  3:  (['marital_status_other'], ['marital_status__Single', 'marital_status__Married',
                                  'marital_status__Divorced', 'marital_status__Other']),
  4:  (['emergency_contact_name'], []),
  5:  (['emergency_contact_relationship', 'emergency_contact_phone'], []),
  6:  ([], ['has_birth_certificate__yes', 'has_birth_certificate__no']),
  7:  ([], ['has_valid_id__yes', 'has_valid_id__no']),
  8:  ([], ['has_social_security_card__yes', 'has_social_security_card__no']),
  9:  (['mco_number', 'medicaid_number'], []),
  10: (['birth_city', 'birth_state'], []),
  11: (['birth_country'], []),
  12: (['race'], []),
  13: ([], ['us_citizen__yes', 'us_citizen__no']),
  14: (['alien_number'], []),
  15: (['pcp_name'], []),
  16: (['pcp_phone'], []),
  17: (['pcp_practice'], []),
  18: ([], ['developmental_disability__yes', 'developmental_disability__no']),
  19: (['developmental_disability_detail'], []),
  20: ([], ['physical_condition__yes', 'physical_condition__no']),
  21: (['physical_condition_detail'], []),
  22: ([], ['mental_health_condition__yes', 'mental_health_condition__no']),
  23: (['mental_health_provider'], []),
  24: (['mental_health_provider_phone'], []),
  25: (['psychiatrist_name'], []),
  26: (['psychiatrist_phone'], []),
  27: ([], ['has_income_proof__yes', 'has_income_proof__no']),
  28: (['income_type'], []),
  29: ([], ['has_bank_account__yes', 'has_bank_account__no']),
  30: (['bank_name'], []),
  31: ([], ['applied_for_voucher__yes', 'applied_for_voucher__no']),
  32: (['voucher_county'], []),
  33: ([], ['currently_employed__yes', 'currently_employed__no']),
  34: (['employer_name'], []),
  35: (['hours_per_week'], []),
  36: (['wage'], []),
  37: (['last_hospitalization_date'], []),
  38: ([], ['receives_benefits__yes', 'receives_benefits__no']),
  39: (['benefit_type'], []),
  40: ([], ['housing_status__At Risk of Homelessness']),
  41: ([], ['housing_status__Already Homeless']),
  42: ([], ['housing_status__Temporarily Housed']),
  43: ([], ['housing_status__Permanently Housed']),
  44: (['housing_status_other'], ['housing_status__Other']),
  45: ([], ['living_unsheltered__yes', 'living_unsheltered__no']),
  46: (['living_unsheltered_detail'], []),
  47: ([], ['has_eviction_or_record__yes', 'has_eviction_or_record__no']),
  48: (['eviction_or_record_detail'], []),
  49: ([], ['needs_accommodation__yes', 'needs_accommodation__no']),
  50: ([], ['accommodations__Wheelchair accessible']),
  51: ([], ['accommodations__Walker']),
  52: ([], ['accommodations__Elevator']),
  53: ([], ['accommodations__Ground-level unit']),
  54: (['accommodation_other'], ['accommodations__Other']),
  55: ([], ['has_application_fee_funds__yes', 'has_application_fee_funds__no']),
  56: ([], ['voucher_types__NED voucher']),
  57: ([], ['voucher_types__811 Mainstream voucher']),
  58: ([], ['voucher_types__TRA voucher']),
  59: ([], ['voucher_types__SRAP voucher']),
  60: (['voucher_type_other'], ['voucher_types__Other']),
  61: ([], ['housing_for_self_only__yes', 'housing_for_self_only__no']),
  62: (['county_1'], ['county_1__checked']),
  63: (['county_2'], ['county_2__checked']),
  64: (['county_3'], ['county_3__checked']),
  65: (['county_4'], ['county_4__checked']),
  66: (['county_other'], ['county_other__checked']),
  67: ([], ['hiv_aids__yes', 'hiv_aids__no']),
  68: ([], ['substance_use__yes', 'substance_use__no']),
  69: (['substance_use_detail'], []),
  70: ([], ['domestic_violence_victim__yes', 'domestic_violence_victim__no']),
  71: ([], ['pregnant__yes', 'pregnant__no', 'pregnant__na']),
  72: ([], ['veteran__yes', 'veteran__no']),
  73: ([], ['in_school__yes', 'in_school__no']),
  74: (['school_program'], []),
  75: ([], ['in_vocational_training__yes', 'in_vocational_training__no']),
  76: (['vocational_program'], []),
  77: ([], ['preferred_housing_type__Apartment']),
  78: ([], ['preferred_housing_type__Individual home']),
  79: ([], ['preferred_housing_type__Family house']),
  80: (['preferred_housing_type_other'], ['preferred_housing_type__Other']),
  81: ([], ['has_transportation__yes', 'has_transportation__no']),
  82: (['transportation_other'], ['transportation_types__Personal vehicle',
                                  'transportation_types__Public transportation',
                                  'transportation_types__Family/friend',
                                  'transportation_types__Other']),
  83: ([], ['preferred_apartment_type__Lower level / ground floor']),
  84: ([], ['preferred_apartment_type__Upper level']),
  85: ([], ['preferred_apartment_type__Wheelchair accessible']),
  86: ([], ['preferred_apartment_type__Elevator required']),
  87: ([], ['preferred_apartment_type__No preference']),
  88: ([], ['bedrooms_needed__Studio']),
  89: ([], ['bedrooms_needed__1 bedroom']),
  90: ([], ['bedrooms_needed__2 bedrooms']),
  91: ([], ['bedrooms_needed__3 bedrooms']),
  92: ([], ['bedrooms_needed__4+ bedrooms']),
  93: ([], ['has_household_members__yes', 'has_household_members__no']),
  94: (['household_1_name', 'household_1_age'], []),
  95: (['household_1_relationship'], []),
  96: (['household_2_name', 'household_2_age'], []),
  97: (['household_2_relationship'], []),
  98: (['household_3_name', 'household_3_age'], []),
  99: (['household_3_relationship'], []),
  100:(['household_4_name', 'household_4_age'], []),
  101:(['household_4_relationship'], []),
  102:(['client_signature_name'], []),
  103:(['client_signature', 'client_signed_date'], []),
  104:(['staff_signature_name'], []),
  105:(['staff_signature', 'staff_signed_date'], []),
}


# Questions answered in prose have no underscores to sit on — the form just
# leaves space. Each gets one box filling the gap between the question and
# whatever follows it, so it reads as somewhere to write a paragraph.
MULTILINE = [
    ('10. List all medical', 'medical_diagnoses'),
    ('15. What is your schedule', 'therapy_schedule'),
    ('17. List all mental health', 'mental_health_diagnoses'),
    ('23. Last Address', 'last_address'),
    ('24. How long did you live', 'last_address_duration'),
    ('25. Present Address', 'present_address'),
    ('28. How is your health', 'health_impact'),
    ('29. How many months', 'homeless_duration'),
    ('30. Homelessness was caused', 'homelessness_cause'),
    ('45. Highest Grade', 'highest_grade'),
    ('53. Additional Information', 'additional_comments'),
    ('Additional Notes', 'additional_notes'),
]


def add_multiline(doc, names):
    """One roomy box per prose question, filling the space the form leaves."""
    added = 0
    for pno, page in enumerate(doc):
        lines = []
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                t = ''.join(sp["text"] for sp in l["spans"]).strip()
                if t:
                    lines.append((l["bbox"][1], l["bbox"][3], l["bbox"][0], l["bbox"][2], t))
        lines.sort()
        left = min((l[2] for l in lines), default=72)
        right = max((l[3] for l in lines), default=540)
        for i, (y0, y1, x0, x1, t) in enumerate(lines):
            for anchor, name in MULTILINE:
                if not t.startswith(anchor):
                    continue
                bottom = lines[i + 1][0] if i + 1 < len(lines) else page.rect.height - 36
                top = y1 + 3
                if bottom - top < 18:
                    continue
                w = pymupdf.Widget()
                w.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
                w.field_name = name
                w.field_flags = pymupdf.PDF_TX_FIELD_IS_MULTILINE
                w.rect = pymupdf.Rect(left, top, right, bottom - 3)
                w.text_fontsize = 9
                w.border_width = 0
                page.add_widget(w)
                names.append(name)
                added += 1
    return added


def survey(doc):
    """Every line carrying a blank or a ballot box, in reading order."""
    out = []
    for pno, pg in enumerate(doc):
        lines = {}
        for w in pg.get_text("words"):
            lines.setdefault((w[5], w[6]), []).append(w)
        for key in sorted(lines, key=lambda k: (min(w[1] for w in lines[k]),
                                                min(w[0] for w in lines[k]))):
            ws = sorted(lines[key], key=lambda w: w[0])
            blanks = [w for w in ws if set(w[4]) <= set('_') and len(w[4]) >= 3]
            boxes = [w for w in ws if '☐' in w[4]]
            if blanks or boxes:
                out.append((pno, blanks, boxes))
    return out


def main():
    doc = pymupdf.open(SRC)
    rows = survey(doc)
    if len(rows) != len(MAP):
        sys.exit(f'form changed: {len(rows)} input lines, map covers {len(MAP)}')

    added, names = 0, []
    for i, (pno, blanks, boxes) in enumerate(rows):
        want_blanks, want_boxes = MAP[i]
        if len(want_blanks) != len(blanks) or len(want_boxes) != len(boxes):
            sys.exit(f'line {i} on page {pno}: form has {len(blanks)} blanks / '
                     f'{len(boxes)} boxes, map expects {len(want_blanks)} / {len(want_boxes)}')
        page = doc[pno]
        for name, w in zip(want_blanks, blanks):
            r = pymupdf.Rect(w[0], w[1] - 1, w[2], w[3] + 1)
            widget = pymupdf.Widget()
            widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
            widget.field_name = name
            widget.rect = r
            widget.text_fontsize = 9
            widget.border_width = 0
            page.add_widget(widget)
            added += 1
            names.append(name)
        for name, w in zip(want_boxes, boxes):
            r = pymupdf.Rect(w[0], w[1], w[0] + (w[3] - w[1]), w[3])
            widget = pymupdf.Widget()
            widget.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
            widget.field_name = name
            widget.rect = r
            page.add_widget(widget)
            added += 1
            names.append(name)

    added += add_multiline(doc, names)

    dupes = {n for n in names if names.count(n) > 1}
    if dupes:
        sys.exit(f'duplicate field names: {sorted(dupes)}')

    doc.save(OUT)
    print(f'wrote {OUT}')
    print(f'fields added: {added}')
    json.dump(sorted(names), open('/tmp/intake_field_names.json', 'w'), indent=0)


if __name__ == '__main__':
    main()
