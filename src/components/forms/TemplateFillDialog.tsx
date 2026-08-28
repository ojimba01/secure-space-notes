import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import '@/lib/pdfWorker';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { Download, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import type { FormType } from '@/lib/formSigning';
import type { FormRow } from '@/components/forms/FormsHub';
import {
  formDownloadName,
  prefillTemplate,
  type AutofillClient,
} from '@/lib/formAutofill';
import { recordFormVersion, sha256Hex } from '@/lib/formVersions';

export interface PdfTemplate {
  formType: FormType;
  file: string;
  description: string;
  /**
   * What the card calls it. Two MCO request forms share one document type, so
   * the type alone can neither title them nor key them apart.
   */
  label: string;
}

/**
 * Blank fillable copies of the official NJ Housing Supports PDFs, served from
 * /public and rendered in-page with interactive form fields.
 */
export const PDF_TEMPLATES: PdfTemplate[] = [
  {
    // Built from the agency's own printed intake by scripts/build_intake_template.py.
    // Its field names are the client_intakes column names, so answers can be read
    // straight back out of a submitted form.
    formType: 'Client Intake',
    file: '/form-templates/client-intake.pdf',
    label: 'Client Intake',
    description: 'The intake questionnaire. Answers also save onto the client record.',
  },
  {
    formType: 'Initial Assessment Tool',
    file: '/form-templates/initial-assessment-tool.pdf',
    label: 'Initial Assessment Tool (IAT)',
    description: 'Request Housing Supports services and document eligibility.',
  },
  {
    formType: 'Level of Need Assessment Tool',
    file: '/form-templates/level-of-need-assessment-tool.pdf',
    label: 'Level of Need Assessment Tool (LoN)',
    description: 'Scored assessment for authorization and reauthorization.',
  },
  {
    formType: 'Housing Stabilization Plan',
    file: '/form-templates/housing-stabilization-plan.pdf',
    label: 'Housing Stabilization Plan (HSP)',
    description: 'Individualized goals and activities plan built with the member.',
  },
  {
    formType: 'MCO Authorization Request',
    file: '/form-templates/aetna-prior-authorization.pdf',
    label: 'Aetna Prior Authorization',
    description: 'Aetna prior authorization request for Housing Supports.',
  },
  {
    // The agency's provider block and Shade Dickson's contact details are
    // already on this template, exactly as Wellpoint expects them. Only the
    // previous client's answers were cleared.
    formType: 'MCO Authorization Request',
    file: '/form-templates/wellpoint-support-services-request.pdf',
    label: 'Wellpoint Support Services Request',
    description: 'Wellpoint support services request. Provider details already filled in.',
  },
];

const BASE_PAGE_WIDTH = 820;
const MAX_BYTES = 20 * 1024 * 1024;

interface ClientOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface TemplateFillDialogProps {
  /** Blank template to start from. Omit when resubmitting an existing form. */
  template?: PdfTemplate | null;
  /**
   * Existing submission to correct and resubmit (changes requested). The
   * stored PDF is reopened with its previous answers intact, and submitting
   * updates the same row instead of creating a new one.
   */
  existing?: FormRow | null;
  profileId: string;
  signerName: string;
  /** Filing for one specific client (e.g. straight from their record). */
  lockedClientId?: string;
  lockedClientName?: string;
  /** Which lifecycle step this form belongs to, when opened from a workflow. */
  workflowPurpose?: string | null;
  /** The authorization/package this form belongs to, when known. */
  authorizationId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

export const TemplateFillDialog: React.FC<TemplateFillDialogProps> = ({
  template,
  existing,
  profileId,
  signerName,
  lockedClientId,
  lockedClientName,
  workflowPurpose,
  authorizationId,
  onClose,
  onSubmitted,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientId, setClientId] = useState(existing?.client_id ?? lockedClientId ?? '');
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);
  // Resubmit mode only:
  const [existingBytes, setExistingBytes] = useState<Uint8Array | null>(null);
  const [hasFields, setHasFields] = useState<boolean | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  // New-form mode: template pre-filled with the client's identity fields.
  const [prefilledBytes, setPrefilledBytes] = useState<Uint8Array | null>(null);
  const [clientRecord, setClientRecord] = useState<
    (AutofillClient & { id: string }) | null
  >(null);

  const formType = existing ? existing.form_type : template?.formType ?? '';
  const clientName = existing?.clients
    ? `${existing.clients.last_name}, ${existing.clients.first_name}`
    : lockedClientName ?? null;

  // New submissions: pick from the clients this employee can file against.
  useEffect(() => {
    if (existing || lockedClientId) return;
    (async () => {
      let query = supabase
        .from('clients')
        .select('id, first_name, last_name')
        .is('deleted_at', null)
        .order('last_name');

      // Employees can only file forms for clients assigned to them, so keep the
      // dropdown in sync with what the database will actually accept. Admins
      // previewing as an employee get that employee's list, not their own
      // all-clients view, so the preview matches the real experience.
      if ((!isAdmin || isViewingAs) && profileId) {
        query = query.eq('assigned_employee_id', profileId);
      }

      const { data } = await query;
      setClients(data ?? []);
    })();
  }, [existing, lockedClientId, isAdmin, isViewingAs, profileId]);

  // Resubmit mode: pull the previously submitted PDF back out of storage.
  useEffect(() => {
    if (!existing?.file_path) return;
    (async () => {
      const { data, error } = await supabase.storage
        .from('client-files')
        .download(existing.file_path!);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setExistingBytes(new Uint8Array(await data.arrayBuffer()));
    })();
  }, [existing?.file_path]);

  // New submissions: once a client is chosen, load their record and rewrite the
  // blank template's identity fields (name, DOB, IDs, MCO, case manager) so
  // nobody retypes data the app already knows. Only runs before anything has
  // been typed into the viewer — a prefill never overwrites user entries.
  useEffect(() => {
    if (existing || !template || !clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const modified =
          ((docRef.current as unknown as { annotationStorage?: { size?: number } } | null)
            ?.annotationStorage?.size ?? 0) > 0;
        if (modified) return;

        const { data: client, error } = await supabase
          .from('clients')
          .select(
            'id, first_name, last_name, date_of_birth, phone, email, member_id, insurance, county, njhmis_id',
          )
          .eq('id', clientId)
          .maybeSingle();
        if (error) throw error;
        if (!client || cancelled) return;
        setClientRecord(client as AutofillClient & { id: string });

        const res = await fetch(template.file);
        if (!res.ok) throw new Error(`Could not load the blank template (${res.status}).`);
        const bytes = await prefillTemplate(await res.arrayBuffer(), template.formType, client, {
          name: signerName,
        });
        if (!cancelled) setPrefilledBytes(bytes);
      } catch (err: any) {
        // The blank template still works; pre-fill is a convenience.
        if (!cancelled) {
          toast({
            title: 'Could not pre-fill the form',
            description: `${err.message ?? err} — the blank template opened instead.`,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, template, clientId, signerName]);

  // Stable identity so react-pdf doesn't reload the document on re-renders.
  const documentFile = useMemo(() => {
    if (existing) return existingBytes ? { data: existingBytes } : null;
    if (prefilledBytes) return { data: prefilledBytes };
    return template?.file ?? null;
  }, [existing, existingBytes, prefilledBytes, template?.file]);

  /**
   * Picking a client swaps the blank template for a pre-filled copy. Handing
   * react-pdf a new `file` while the previous one is still loading makes it
   * destroy that load mid-flight, and the worker throws
   * "PDFWorker.create - the worker is being destroyed" from a promise no
   * handler covers — `onLoadError` never sees it, so React unmounted the whole
   * app and the page went blank.
   *
   * Keying the Document on the source instead means the old one unmounts and
   * a fresh one mounts, so the two loads never overlap.
   */
  const documentKey = useMemo(() => {
    if (existing) return `existing:${existing.file_path ?? existing.id ?? ''}`;
    if (prefilledBytes) return `prefilled:${clientId}:${prefilledBytes.byteLength}`;
    return `blank:${template?.file ?? ''}`;
  }, [existing, prefilledBytes, clientId, template?.file]);

  /**
   * Keying alone is not enough: React unmounts the old Document and mounts the
   * new one in the same commit, so pdf.js is still tearing the old worker down
   * when the next one calls PDFWorker.create — the same crash, just later.
   *
   * So nothing is mounted until the previous document has actually finished
   * destroying. `activeKey` lags `documentKey` by exactly that await.
   */
  const [activeKey, setActiveKey] = useState<string | null>(documentKey);

  useEffect(() => {
    let cancelled = false;
    setActiveKey(null);
    // Stale state belongs to the document being torn down. docRef especially:
    // Save and Download read from it and must not see a destroyed document.
    setNumPages(0);
    setHasFields(null);
    setLoadError(null);

    (async () => {
      const previous = docRef.current;
      docRef.current = null;
      try {
        await previous?.destroy();
      } catch {
        // Already gone, or never finished loading. Either way there is
        // nothing left to wait for.
      }
      if (!cancelled) setActiveKey(documentKey);
    })();

    return () => {
      cancelled = true;
    };
  }, [documentKey]);

  /** The current PDF bytes including everything typed into the form fields. */
  const collectFilledPdf = async (): Promise<Blob> => {
    const doc = docRef.current;
    if (!doc) throw new Error('The form is still loading — try again in a moment.');
    const bytes = await doc.saveDocument();
    return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  };

  const handleDownloadCopy = async () => {
    try {
      const blob = await collectFilledPdf();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formDownloadName(
        clientRecord?.first_name ?? existing?.clients?.first_name,
        clientRecord?.last_name ?? existing?.clients?.last_name,
        formType,
      );
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Could not prepare the PDF', description: err.message, variant: 'destructive' });
    }
  };

  /** Anything typed into the form yet? pdf.js holds entries until they are saved. */
  const hasEntries = () =>
    ((docRef.current as unknown as { annotationStorage?: { size?: number } } | null)
      ?.annotationStorage?.size ?? 0) > 0;

  const handleSubmit = async (asDraft = false) => {
    if (!clientId) {
      toast({ title: 'Select a client', variant: 'destructive' });
      return;
    }
    if (asDraft && !hasEntries() && !replacementFile) {
      toast({
        title: 'Nothing to save yet',
        description: 'Fill in at least one answer before saving a draft.',
        variant: 'destructive',
      });
      return;
    }
    if (!asDraft && !attested) {
      toast({ title: 'Confirm the attestation to submit', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      let blob: Blob;
      if (existing && hasFields === false) {
        // Scanned/flattened PDFs have nothing to edit in-page; a corrected
        // copy is attached instead.
        if (!replacementFile) {
          throw new Error('Attach the corrected PDF before resubmitting.');
        }
        if (replacementFile.type !== 'application/pdf') {
          throw new Error('Only PDF files can be submitted.');
        }
        blob = replacementFile;
      } else {
        blob = await collectFilledPdf();
      }
      if (blob.size > MAX_BYTES) {
        throw new Error('The completed form is larger than 20 MB.');
      }

      const folder = `forms/${clientId}/${crypto.randomUUID()}`;
      const filePath = `${folder}/form.pdf`;
      const fileHash = await sha256Hex(await blob.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(filePath, blob, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      let formId: string;
      if (existing) {
        // Repoint the same row at the corrected file; the previously
        // submitted file stays in storage as history. original_file_path
        // keeps the first submission for the audit trail.
        const { error } = await supabase
          .from('client_forms')
          .update({
            file_path: filePath,
            file_size: blob.size,
            file_hash: fileHash,
            status: asDraft ? 'draft' : 'submitted',
            signature_name: asDraft ? null : signerName,
            signed_by: asDraft ? null : profileId,
            signed_at: asDraft ? null : new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
        formId = existing.id;
      } else {
        const { data: inserted, error } = await supabase
          .from('client_forms')
          .insert({
            client_id: clientId,
            employee_id: profileId,
            form_type: formType,
            title: formType,
            file_path: filePath,
            original_file_path: filePath,
            file_size: blob.size,
            file_hash: fileHash,
            status: asDraft ? 'draft' : 'submitted',
            workflow_purpose: workflowPurpose ?? null,
            authorization_id: authorizationId ?? null,
            signature_name: asDraft ? null : signerName,
            signed_by: asDraft ? null : profileId,
            signed_at: asDraft ? null : new Date().toISOString(),
          })
          .select('id')
          .single();
        if (error) throw error;
        formId = inserted.id;
      }

      // Every file the form has ever pointed at stays downloadable from
      // history; a failed version write is surfaced, never swallowed.
      try {
        await recordFormVersion({
          clientFormId: formId,
          filePath,
          versionType: existing ? 'corrected' : 'submitted',
          createdBy: profileId,
          fileHash,
          fileSize: blob.size,
        });
      } catch (versionErr: any) {
        toast({
          title: 'Form saved, but version history was not updated',
          description: versionErr.message,
          variant: 'destructive',
        });
      }

      toast({
        title: asDraft
          ? 'Draft saved'
          : existing
            ? 'Form resubmitted'
            : 'Form submitted',
        description: asDraft
          ? 'Saved to the client record. It has not been submitted for review.'
          : 'Your form is now awaiting manager approval.',
      });
      onSubmitted();
      onClose();
    } catch (err: any) {
      const raw = err?.message ?? '';
      toast({
        title: 'Could not submit the form',
        description: raw.includes('row-level security')
          ? 'You can only submit forms for clients assigned to you. Ask an administrator to assign this client to you first.'
          : raw,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const showReplacementPicker = existing && hasFields === false;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[94vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>
            {existing ? `Edit & resubmit — ${formType}` : formType}
          </DialogTitle>
        </DialogHeader>

        {existing?.status === 'changes_requested' && existing.review_note && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-xs font-medium">Your manager requested changes</div>
            <p className="text-sm">{existing.review_note}</p>
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          {existing || lockedClientId ? (
            <div className="space-y-1.5">
              <Label>Client</Label>
              <div className="text-sm font-medium">{clientName ?? '—'}</div>
            </div>
          ) : (
            <div className="space-y-1.5 min-w-[240px]">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.last_name}, {c.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clients.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No clients are assigned to you yet. Ask an administrator to assign a client.
                </p>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(2)))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {showReplacementPicker ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p className="text-sm">
              This submission is a scanned or flattened PDF, so it can't be edited here. Attach
              the corrected PDF below — it will replace the file on this same submission.
            </p>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setReplacementFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Type directly into the form fields below — including typing names on the signature
            lines. Your entries stay on this page until you press Submit. If a handwritten
            signature is required, use <span className="font-medium">Download copy</span> to
            print and sign, then submit it via Upload Form instead.
          </p>
        )}

        <div className="flex-1 overflow-auto rounded-md border bg-muted/30 p-3">
          {documentFile && activeKey ? (
            <Document
              key={activeKey}
              file={documentFile}
              onLoadSuccess={async (doc) => {
                docRef.current = doc;
                setNumPages(doc.numPages);
                try {
                  const fields = await doc.getFieldObjects();
                  setHasFields(!!fields && Object.keys(fields).length > 0);
                } catch {
                  setHasFields(true);
                }
              }}
              onLoadError={(err) => setLoadError(err?.message ?? String(err))}
              onSourceError={(err) => setLoadError(err?.message ?? String(err))}
              loading={<div className="p-8 text-center text-sm text-muted-foreground">Loading form...</div>}
              error={
                <div className="p-8 text-center text-sm text-destructive space-y-1">
                  <p>Failed to load the form. Try downloading the blank copy instead.</p>
                  {loadError && <p className="text-xs opacity-80">Details: {loadError}</p>}
                </div>
              }
            >
              <div className="flex flex-col items-center gap-4">
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} className="shadow-sm">
                    <Page
                      pageNumber={i + 1}
                      width={BASE_PAGE_WIDTH * scale}
                      renderTextLayer={false}
                      renderAnnotationLayer
                      renderForms
                    />
                  </div>
                ))}
              </div>
            </Document>
          ) : loadError ? (
            <div className="p-8 text-center text-sm text-destructive space-y-1">
              <p>Could not open the submitted PDF.</p>
              <p className="text-xs opacity-80">Details: {loadError}</p>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading form...</div>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={attested}
            onCheckedChange={(v) => setAttested(v === true)}
            className="mt-0.5"
          />
          <span>I attest this form is complete and accurate.</span>
        </label>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadCopy} disabled={!numPages}>
              <Download className="h-4 w-4 mr-1" />
              Download copy
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSubmit(true)}
              disabled={saving || !clientId || (!numPages && !showReplacementPicker)}
              title={clientId ? 'Keep what you have so far' : 'Select a client first'}
            >
              Save draft
            </Button>
            <Button
              onClick={() => handleSubmit(false)}
              disabled={saving || (!numPages && !showReplacementPicker)}
            >
              <Upload className="h-4 w-4 mr-2" />
              {saving ? 'Submitting...' : existing ? 'Resubmit form' : 'Submit form'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
