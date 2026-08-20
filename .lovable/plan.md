# Forms section: upload, sign, approve, download

A new **Forms** area in the sidebar. Employees upload a completed PDF form, tie it to a client, sign it on screen, and submit it. Admins and superadmins review a queue and approve or send it back. Once approved, the employee downloads the final signed PDF.

## Yes — virtual signatures work

The three uploaded PDFs (Initial Assessment Tool, Level of Need Assessment Tool, Housing Stabilization Plan) are real fillable PDFs, so signing inside the app is straightforward:

- The employee draws a signature with a mouse or finger on a canvas (or types a name rendered in a script font).
- On submit, the app stamps that signature image into the uploaded PDF along with the signer's name, role, and a UTC timestamp, then flattens the file so it can't be edited afterwards.
- The signed file, not the raw upload, is what gets stored and downloaded.
- This is an in-house e-signature suitable for internal attestation. It is not a DocuSign-style legally certified signature with a third-party audit certificate. If a payer ever requires that, it would be a separate integration.

Client signatures and manager signature stamps are not in this scope (employee signature only), but the schema leaves room to add them later.

## What each role sees

**Employee**
- Forms list: only their own submissions.
- Upload flow: pick a form type (Initial Assessment Tool, Level of Need Assessment Tool, Housing Stabilization Plan, Other), pick a client (required), attach the completed PDF, sign, submit.
- Status badge on each row: Draft, Submitted (awaiting approval), Approved, Changes requested.
- Download the signed PDF for any of their forms. Approved rows show the approval stamp in the file.

**Admin / superadmin**
- Review queue across all employees, filterable by status, form type, employee, and client, with search.
- Open a form, preview the PDF in the existing preview dialog, then Approve or Request changes with a note.
- Approving records who approved it and when, and stamps an approval line onto the last page.

## Screens

1. **Forms hub** — table of forms with columns: Client, Form type, Employee (admins only), Submitted, Status, Actions. Paginated 10 per page, matching the billing tables.
2. **Upload dialog** — form type, client picker, file input (PDF only, max 20 MB), signature pad, "I attest this form is complete and accurate" checkbox, Submit.
3. **Detail drawer / dialog** — PDF preview, metadata, signature block, approval history, and the approve / request-changes actions for admins.

## Technical notes

**Database** — new `public.client_forms` table: `client_id`, `employee_id`, `form_type`, `title`, `file_path` (signed PDF), `original_file_path`, `status` (`draft` | `submitted` | `approved` | `changes_requested`), `signed_at`, `signature_name`, `signed_by`, `approved_by`, `approved_at`, `review_note`, plus timestamps. RLS: employees read/insert/update only rows where `employee_id` is their profile and they are assigned to the client; admins and superadmins read all and update approval fields. Status transitions to `approved` are restricted to admins via a trigger so an employee can't self-approve. Audit trigger attached, matching the other tables.

**Storage** — reuse the existing private `client-files` bucket under a `forms/{client_id}/{form_id}/` prefix so current file policies and access controls apply. Downloads use short-lived signed URLs.

**Signing** — add `pdf-lib` and `react-signature-canvas`. The signature is captured as PNG, embedded on the last page with the typed name and UTC timestamp, and the form fields are flattened. All of this happens client-side, then the flattened file is uploaded; the raw upload is kept separately for audit.

**Approval stamp** — on approval, an edge function re-stamps the stored PDF with the approver's name and timestamp so the downloaded file is self-evidently approved.

**Reuse** — `PDFPreviewDialog` and `PDFPreview` for previews, the existing `Pager` pattern for pagination, `useIsAdmin` / `useIsSuperadmin` / `useEffectiveProfileId` for role and view-as behaviour, and Zod for validation of form type, title, and file size/MIME.

**Navigation** — a Forms item in the sidebar, placed after Clients and before Billing.

## Out of scope for this pass

- Filling the forms inside the app from blank templates (upload-only for now).
- Client or manager drawn signatures.
- Auto-populating client milestone dates (IAT / HSP / LON) from approved forms — a natural follow-up once forms are flowing.
