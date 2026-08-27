# Bulk document import

Admin/Superadmin only, at **Advanced Tools → Bulk document import** (`/advanced-tools`).
Case managers never see it, and the database policies refuse the import tables
to anyone who is not an admin.

Documents are uploaded inside the app, into the existing private `client-files`
bucket. Nothing goes through an outside chat, drive, or AI service.

## How a migration runs

1. **Add files** — a ZIP of client folders (nested paths preserved), a whole
   folder, or individual files. Hidden and empty entries are skipped, and a
   report of anything skipped is shown before you continue.
2. **Attach a manifest (recommended)** — an `.xlsx` or `.csv` prepared outside
   the app. `public/import-manifest-template.csv` is a working starting point.
   Only `source_file` is required; every other column improves the match.
3. **Analyze** — each file gets a proposed client, document type, date, and a
   confidence rating. The batch is saved at this point but nothing is stored
   against a client yet.
4. **Review** — correct any row, then commit. High-confidence rows are
   pre-selected so they can be accepted in bulk without opening each file.
5. **Commit** — the original file is stored unchanged, linked to the client,
   given a `historical` version row, and recorded in the import audit trail.

## How files are matched

Deterministic signals only, in strict priority order. No OCR and no AI.

| Priority | Signal | Confidence |
|---|---|---|
| 1 | Member ID read from the PDF's own form fields | High |
| 2 | Member ID from the manifest | High |
| 3 | Name + date of birth from the manifest | Medium |
| 4 | Name + date of birth read from the PDF's form fields | Medium |
| 5 | Name only, from the PDF's form fields | Low |
| 6 | Folder name matches exactly one client | Low |
| 7 | Client name appears in the filename | Low |

Low-confidence rows must be confirmed by hand. When the manifest and the PDF's
own member ID name **different** clients, the row is marked **Conflict** and
cannot be committed until someone resolves it.

## Document type recognition

Official templates are identified by their AcroForm field fingerprints — at
least two marker fields must match, which is why an IAT is never mistaken for
an HSP even though both carry a "Member Name" field. Filenames are only used
when the PDF itself is unrecognisable (flattened or scanned).

## Duplicates

Every file is hashed with SHA-256 before commit. A file whose hash already
exists on a stored form is marked **Duplicate — already imported** and skipped
by default. An administrator can tick *Import anyway* when the same document is
genuinely being preserved as a separate submission.

## What imported documents look like afterwards

They appear in the client's **Forms & Documents** tab, labelled *Historical
import*, with their known external/MCO state. They are not put through internal
review, because they were not created here. The original file is never
modified.

## Scanned and flattened PDFs

A flattened PDF has no form fields to read, so it will land in Low confidence
with no detected member ID. Use the manifest for those — that is what the
manifest is for. OCR is deliberately not a dependency of this workflow.
