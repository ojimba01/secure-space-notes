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
import { ClientPicker } from '@/components/ClientPicker';
import { SignOnForm } from '@/components/forms/SignOnForm';
import {
  defaultPlacement,
  stampSignature,
  type SignaturePlacement,
} from '@/lib/signatureStamp';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { Download, Maximize2, Minimize2, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { FormType } from '@/lib/formSigning';
import type { FormRow } from '@/components/forms/FormsHub';
import {
  extractPdfFieldValues,
  formDownloadName,
  prefillTemplate,
  type AutofillClient,
} from '@/lib/formAutofill';
import {
  applyWriteThrough,
  intakeDraftFromPdfFields,
  markLifecycleIntakeComplete,
  saveIntake,
  writeThroughPlan,
} from '@/lib/clientIntake';
import { recordFormVersion, sha256Hex } from '@/lib/formVersions';
import { loadBlankTemplate } from '@/lib/formTemplates';

export interface PdfTemplate {
  formType: FormType;
  /** The copy shipped in the repository. A registry upload replaces it. */
  file: string;
  /**
   * Which payer this form belongs to, or null for the state's own forms.
   * The Aetna and Wellpoint requests are both a Prior Authorization Request,
   * so the type alone cannot key them apart — the payer does.
   */
  mco: string | null;
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
    mco: null,
    file: '/form-templates/client-intake.pdf',
    label: 'Client Intake',
    description: 'The intake questionnaire. Answers also save onto the client record.',
  },
  {
    formType: 'Initial Assessment (IAT)',
    mco: null,
    file: '/form-templates/initial-assessment-tool.pdf',
    label: 'Initial Assessment Tool (IAT)',
    description: 'Request Housing Supports services and document eligibility.',
  },
  {
    formType: 'Level of Need (LON)',
    mco: null,
    file: '/form-templates/level-of-need-assessment-tool.pdf',
    label: 'Level of Need Assessment Tool (LoN)',
    description: 'Scored assessment for authorization and reauthorization.',
  },
  {
    formType: 'Housing Stabilization Plan (HSP)',
    mco: null,
    file: '/form-templates/housing-stabilization-plan.pdf',
    label: 'Housing Stabilization Plan (HSP)',
    description: 'Individualized goals and activities plan built with the member.',
  },
  {
    formType: 'Prior Authorization Request',
    mco: 'Aetna',
    file: '/form-templates/aetna-prior-authorization.pdf',
    label: 'Aetna Prior Authorization',
    description: 'Aetna prior authorization request for Housing Supports.',
  },
  {
    // The agency's provider block and Shade Dickson's contact details are
    // already on this template, exactly as Wellpoint expects them. Only the
    // previous client's answers were cleared.
    formType: 'Prior Authorization Request',
    mco: 'Wellpoint',
    file: '/form-templates/wellpoint-support-services-request.pdf',
    label: 'Wellpoint Authorization Request',
    description: 'Wellpoint authorization request. Provider details already filled in.',
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
        .neq('status', 'closed')
        .order('first_name');

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
            'id, first_name, last_name, date_of_birth, phone, email, member_id, medicaid_id, address, insurance, county, njhmis_id',
          )
          .eq('id', clientId)
          .maybeSingle();
        if (error) throw error;
        if (!client || cancelled) return;
        setClientRecord(client as AutofillClient & { id: string });

        // The registry decides which blank form this is, so a template an
        // admin has replaced is the one staff fill in.
        const blank = await loadBlankTemplate(template.formType, template.mco, template.file);
        const bytes = await prefillTemplate(blank, template.formType, client, {
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
        // The mark goes on last, where it was left, so it lands on the answers
        // rather than under them.
        for (const sig of signatures) {
          const stamped = await stampSignature(
            await blob.arrayBuffer(),
            sig.png,
            sig.placement,
          );
          blob = new Blob([stamped], { type: 'application/pdf' });
        }
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

      // A submitted Client Intake is also the client's intake record. The PDF is
      // the form staff fill in; client_intakes is what the rest of the app reads
      // — the client header, the Availity claims page. A failure here never
      // loses the form, which is already saved above.
      if (!asDraft && formType === 'Client Intake') {
        try {
          const values = await extractPdfFieldValues(await blob.arrayBuffer());
          if (Object.keys(values).length) {
            const { draft, household } = intakeDraftFromPdfFields(values);
            await saveIntake({ clientId, draft, household, profileId, complete: true });
            await markLifecycleIntakeComplete(clientId);

            const { data: clientRow } = await supabase
              .from('clients')
              .select('date_of_birth, member_id, medicaid_id')
              .eq('id', clientId)
              .maybeSingle();
            const plan = writeThroughPlan(draft, clientRow ?? {});
            await applyWriteThrough(clientId, plan.fill);
            // Identifiers that already disagree are never overwritten silently —
            // a wrong member_id or medicaid_id is expensive to unpick later.
            if (plan.conflicts.length) {
              toast({
                title: 'The intake disagrees with the client record',
                description: `${plan.conflicts
                  .map((c) => `${c.label}: form says ${c.intakeValue}, record says ${c.clientValue}`)
                  .join('; ')}. The record was left as it is — check which is right.`,
              });
            }
          }
        } catch (intakeErr) {
          toast({
            title: 'Form saved, but the client record was not updated from it',
            description: intakeErr instanceof Error ? intakeErr.message : String(intakeErr),
            variant: 'destructive',
          });
        }
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

  /**
   * The signatures sitting on the form, before they are drawn into it.
   *
   * A list rather than one mark: a form can want a signature and a set of
   * initials, or the same hand on two lines, and signing again used to move
   * the one mark there was instead of adding another. Each is kept as a
   * placement rather than stamped straight away, so it can be dragged to
   * where it belongs. They are drawn into the PDF on submit, in the order
   * they were added, wherever they were left.
   */
  interface PlacedSignature {
    id: string;
    png: ArrayBuffer;
    url: string;
    label: string;
    placement: SignaturePlacement;
  }
  const [signatures, setSignatures] = useState<PlacedSignature[]>([]);
  const dragging = useRef<{ id: string; dx: number; dy: number } | null>(null);
  /**
   * The corner being pulled, and the corner staying put.
   *
   * `ratio` is width over height in fractions of the page, so holding it fixed
   * holds the shape of the mark: a signature stretched on one axis stops
   * looking like the person's hand.
   */
  const resizing = useRef<{
    id: string;
    ratio: number;
    ax: number;
    ay: number;
    east: boolean;
    south: boolean;
  } | null>(null);
  /** Every rendered page, so a signature can be dragged from one to another. */
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const scrollBox = useRef<HTMLDivElement | null>(null);
  /** The mark the corner handles and the Delete key act on, if any. */
  const [selectedSig, setSelectedSig] = useState<string | null>(null);

  const sign = async (png: ArrayBuffer, label: string) => {
    try {
      /**
       * Where the form wants a signature is read off the blank template, not
       * off the copy on screen.
       *
       * The copy on screen is pre-filled, and its bytes have been handed to
       * the PDF viewer, which takes the buffer for its own worker and leaves
       * nothing here to read. Measuring that instead of the template is what
       * dropped the mark at the foot of the last page rather than on the line
       * the form actually asks for.
       */
      let geometry: ArrayBuffer | Uint8Array | null = null;
      if (template) {
        geometry = await loadBlankTemplate(template.formType, template.mco, template.file);
      } else if (existingBytes) {
        geometry = new Uint8Array(existingBytes);
      }
      if (!geometry) {
        toast({ title: 'The form has not loaded yet', variant: 'destructive' });
        return;
      }

      const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
      const placement = await defaultPlacement(geometry, bitmap.width / bitmap.height, formType);

      // A second mark would otherwise land exactly on top of the first. Step
      // each one down its own height until the spot is free.
      const taken = (at: SignaturePlacement) =>
        signatures.some(
          (s) =>
            s.placement.pageIndex === at.pageIndex &&
            Math.abs(s.placement.x - at.x) < 0.01 &&
            Math.abs(s.placement.y - at.y) < 0.01,
        );
      while (taken(placement) && placement.y + placement.height * 2.2 < 1) {
        placement.y += placement.height * 1.2;
      }

      const id = crypto.randomUUID();
      setSignatures((list) => [
        ...list,
        {
          id,
          png,
          url: URL.createObjectURL(new Blob([png], { type: 'image/png' })),
          label,
          placement,
        },
      ]);
      setSelectedSig(id);
      toast({ title: `Signed with ${label}`, description: 'Drag it to where it belongs.' });
    } catch (err: any) {
      toast({ title: 'Could not sign it', description: err.message, variant: 'destructive' });
    }
  };

  /**
   * The marks as they stand, for handlers that outlive the render they were
   * made in. A gesture listens on the window, so it must not read a placement
   * captured when the button went down.
   */
  const sigsRef = useRef(signatures);
  useEffect(() => {
    sigsRef.current = signatures;
  });

  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const autoScroll = useRef<number | null>(null);

  /** Take one mark off the form. It can be added again from the button. */
  const removeSignature = (id: string) => {
    const gone = sigsRef.current.find((s) => s.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    setSignatures((list) => list.filter((s) => s.id !== id));
    setSelectedSig((cur) => (cur === id ? null : cur));
  };

  /** Change one mark's placement, leaving the rest of the list alone. */
  const updatePlacement = (
    id: string,
    change: (p: SignaturePlacement) => SignaturePlacement,
  ) =>
    setSignatures((list) =>
      list.map((s) => (s.id === id ? { ...s, placement: change(s.placement) } : s)),
    );

  /**
   * Move a signature with the pointer, in fractions of whichever page it is
   * over.
   *
   * Pages are stacked in one column, so dragging past the bottom of one lands
   * on the next. Without this the mark was stuck on the page it arrived on,
   * and the form that asks for it on page 6 of 10 would have been unfixable
   * if it landed anywhere else.
   */
  const placeAtPointer = (clientX: number, clientY: number) => {
    const held = dragging.current;
    if (!held) return;
    const sig = sigsRef.current.find((s) => s.id === held.id);
    if (!sig) return;

    let index = -1;
    let found: DOMRect | null = null;
    pageRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) {
        index = i;
        found = r;
      }
    });
    // Past the last page, or in the gap between two: keep the page it is on.
    if (index < 0 || !found) {
      const current = pageRefs.current[sig.placement.pageIndex];
      if (!current) return;
      index = sig.placement.pageIndex;
      found = current.getBoundingClientRect();
    }

    const rect = found as DOMRect;
    const nextX = (clientX - rect.left) / rect.width - held.dx;
    const nextY = (clientY - rect.top) / rect.height - held.dy;
    updatePlacement(held.id, (p) => ({
      ...p,
      pageIndex: index,
      x: Math.max(0, Math.min(1 - p.width, nextX)),
      y: Math.max(0, Math.min(1 - p.height, nextY)),
    }));
  };

  /**
   * Pull one corner. The opposite corner stays where it is and the shape of
   * the mark is kept, so the signature is only ever made larger or smaller.
   */
  const resizeAtPointer = (clientX: number, clientY: number) => {
    const r = resizing.current;
    const sig = r ? sigsRef.current.find((s) => s.id === r.id) : undefined;
    if (!r || !sig) return;
    const page = pageRefs.current[sig.placement.pageIndex];
    if (!page) return;
    const rect = page.getBoundingClientRect();

    const px = (clientX - rect.left) / rect.width;
    const py = (clientY - rect.top) / rect.height;

    // Whichever axis the hand pulled further decides the size; the other
    // follows from the shape.
    const pulledW = r.east ? px - r.ax : r.ax - px;
    const pulledH = r.south ? py - r.ay : r.ay - py;
    let width = Math.max(pulledW, pulledH * r.ratio, 0.03);

    // Nothing may run off the edge of the page it sits on.
    width = Math.min(width, r.east ? 1 - r.ax : r.ax);
    let height = width / r.ratio;
    height = Math.min(height, r.south ? 1 - r.ay : r.ay);
    width = height * r.ratio;

    updatePlacement(r.id, (p) => ({
      ...p,
      x: r.east ? r.ax : r.ax - width,
      y: r.south ? r.ay : r.ay - height,
      width,
      height,
    }));
  };

  const applyPointer = (clientX: number, clientY: number) => {
    if (resizing.current) resizeAtPointer(clientX, clientY);
    else placeAtPointer(clientX, clientY);
  };

  /**
   * Carry the page with you while a gesture is held near the top or bottom.
   *
   * On its own frame loop rather than on pointer moves: holding still at the
   * edge has to keep scrolling, and one step per mouse move scrolled slower
   * than the hand was asking for and left the mark trailing the page. Each
   * scroll re-places the mark under the pointer it never moved away from.
   */
  const edgeScroll = () => {
    autoScroll.current = requestAnimationFrame(edgeScroll);
    const view = scrollBox.current;
    const at = lastPointer.current;
    if (!view || !at) return;

    const box = view.getBoundingClientRect();
    const EDGE = 90;
    const MAX = 28;
    let step = 0;
    if (at.y < box.top + EDGE) step = -MAX * Math.min(1, (box.top + EDGE - at.y) / EDGE);
    else if (at.y > box.bottom - EDGE) step = MAX * Math.min(1, (at.y - (box.bottom - EDGE)) / EDGE);
    if (!step) return;

    const before = view.scrollTop;
    view.scrollTop = before + step;
    if (view.scrollTop !== before) applyPointer(at.x, at.y);
  };

  /**
   * Follow the pointer on the window until the button comes up.
   *
   * The mark moves between pages, which unmounts the box being dragged and
   * with it any capture or handler bound to it. Held on the window, the
   * gesture ends when the button does, instead of leaving the signature
   * following the mouse with nothing pressed.
   */
  const trackGesture = (e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };

    const move = (ev: PointerEvent) => {
      lastPointer.current = { x: ev.clientX, y: ev.clientY };
      applyPointer(ev.clientX, ev.clientY);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
      autoScroll.current = null;
      lastPointer.current = null;
      dragging.current = null;
      resizing.current = null;
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    autoScroll.current = requestAnimationFrame(edgeScroll);
  };

  useEffect(
    () => () => {
      if (autoScroll.current !== null) cancelAnimationFrame(autoScroll.current);
    },
    [],
  );

  const showReplacementPicker = existing && hasFields === false;

  /**
   * Fill the screen, or sit in the middle of it.
   *
   * A ten-page form in a box two thirds the height of the screen is read three
   * lines at a time. Remembered between forms, because somebody who wants the
   * whole page for one form wants it for the next as well.
   *
   * It is the same dialog either way, only wider. The page underneath is never
   * unmounted or navigated away from, so Cancel and Submit put you back on it
   * exactly where you were reading.
   */
  const EXPANDED_KEY = 'form-fill-full-page';
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleExpanded = () =>
    setExpanded((wide) => {
      try {
        localStorage.setItem(EXPANDED_KEY, wide ? '0' : '1');
      } catch {
        // A browser set to keep no site data still opens the form.
      }
      return !wide;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={
          expanded
            ? 'left-0 top-0 h-screen w-screen max-w-none translate-x-0 translate-y-0 flex flex-col gap-3 rounded-none border-0 p-4 sm:rounded-none'
            : 'max-w-5xl h-[94vh] flex flex-col gap-3'
        }
      >
        <DialogHeader>
          {/* Clear of the dialog's own close button, at the top right. */}
          <div className="flex items-center justify-between gap-3 pr-8">
            <DialogTitle>
              {existing ? `Edit & resubmit — ${formType}` : formType}
            </DialogTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleExpanded}
              title={expanded ? 'Show the form in a window' : 'Show the form on the whole page'}
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4 mr-2" />
              ) : (
                <Maximize2 className="h-4 w-4 mr-2" />
              )}
              {expanded ? 'Exit full page' : 'Full page'}
            </Button>
          </div>
        </DialogHeader>

        {/* Signing is part of filling the form in, so it sits with it. */}
        {!showReplacementPicker && <SignOnForm count={signatures.length} onSign={sign} />}

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
              <ClientPicker
                clients={clients}
                value={clientId || null}
                onChange={setClientId}
                className="w-full"
              />
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

        <div ref={scrollBox} className="flex-1 overflow-auto rounded-md border bg-muted/30 p-3">
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
                  <div
                    key={i}
                    ref={(el) => {
                      pageRefs.current[i] = el;
                    }}
                    className="relative shadow-sm"
                  >
                    <Page
                      pageNumber={i + 1}
                      width={BASE_PAGE_WIDTH * scale}
                      renderTextLayer={false}
                      renderAnnotationLayer
                      renderForms
                    />
                    {signatures
                      .filter((sig) => sig.placement.pageIndex === i)
                      .map((sig) => {
                        const selected = selectedSig === sig.id;
                        return (
                          <div
                            key={sig.id}
                            ref={(el) => {
                              // The box is remade when the mark crosses onto
                              // another page. Take the focus back, so Delete
                              // still reaches the thing that is plainly
                              // selected.
                              if (el && selected && document.activeElement === document.body) {
                                el.focus({ preventScroll: true });
                              }
                            }}
                            tabIndex={0}
                            onPointerDown={(e) => {
                              const box = e.currentTarget.parentElement?.getBoundingClientRect();
                              if (!box) return;
                              setSelectedSig(sig.id);
                              dragging.current = {
                                id: sig.id,
                                dx: (e.clientX - box.left) / box.width - sig.placement.x,
                                dy: (e.clientY - box.top) / box.height - sig.placement.y,
                              };
                              trackGesture(e);
                            }}
                            onFocus={() => setSelectedSig(sig.id)}
                            onBlur={(e) => {
                              // A corner handle is part of the box, not
                              // somewhere else on the form.
                              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                setSelectedSig((cur) => (cur === sig.id ? null : cur));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Delete' || e.key === 'Backspace') {
                                e.preventDefault();
                                removeSignature(sig.id);
                              }
                            }}
                            style={{
                              left: `${sig.placement.x * 100}%`,
                              top: `${sig.placement.y * 100}%`,
                              width: `${sig.placement.width * 100}%`,
                              height: `${sig.placement.height * 100}%`,
                            }}
                            className={`absolute cursor-move touch-none rounded border border-dashed outline-none ${
                              selected
                                ? 'border-primary bg-primary/10'
                                : 'border-primary/60 bg-primary/5'
                            }`}
                            title="Drag to move it. Pull a corner to resize it. Press Delete to remove it."
                          >
                            <img
                              src={sig.url}
                              alt={sig.label}
                              className="pointer-events-none h-full w-full object-contain"
                            />

                            {selected && (
                              <>
                                {/* Pull a corner to resize. They only appear
                                    once the mark is selected, so a form being
                                    read is not covered in handles. */}
                                {([
                                  { east: false, south: false, at: 'left-0 top-0', cursor: 'nwse-resize', label: 'Resize from the top left' },
                                  { east: true, south: false, at: 'right-0 top-0', cursor: 'nesw-resize', label: 'Resize from the top right' },
                                  { east: false, south: true, at: 'left-0 bottom-0', cursor: 'nesw-resize', label: 'Resize from the bottom left' },
                                  { east: true, south: true, at: 'right-0 bottom-0', cursor: 'nwse-resize', label: 'Resize from the bottom right' },
                                ] as const).map((h) => (
                                  <button
                                    key={h.label}
                                    type="button"
                                    aria-label={h.label}
                                    title={h.label}
                                    style={{
                                      cursor: h.cursor,
                                      transform: `translate(${h.east ? 50 : -50}%, ${h.south ? 50 : -50}%)`,
                                    }}
                                    onPointerDown={(e) => {
                                      e.stopPropagation();
                                      const p = sig.placement;
                                      resizing.current = {
                                        id: sig.id,
                                        ratio: p.width / p.height,
                                        ax: h.east ? p.x : p.x + p.width,
                                        ay: h.south ? p.y : p.y + p.height,
                                        east: h.east,
                                        south: h.south,
                                      };
                                      trackGesture(e);
                                    }}
                                    className={`absolute ${h.at} h-3 w-3 rounded-sm border border-primary bg-background shadow-sm`}
                                  />
                                ))}

                                {/* Or take it off the form altogether. */}
                                <button
                                  type="button"
                                  aria-label="Remove this signature"
                                  title="Remove this signature"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={() => removeSignature(sig.id)}
                                  className="absolute -right-7 -top-7 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                                >
                                  <X className="h-3 w-3" strokeWidth={3} />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
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
