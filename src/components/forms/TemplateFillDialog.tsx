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
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { ClientPicker } from '@/components/ClientPicker';
import { loadCaseManagerFacts, loadClientFacts } from '@/lib/clientFacts';
import { SignOnForm } from '@/components/forms/SignOnForm';
import { WebFormView } from '@/components/forms/WebFormView';
import { WEB_FORMS, webFormFor } from '@/lib/webForms';
import type { WebFormSchema } from '@/lib/webForms/types';
import {
  defaultPlacement,
  stampSignature,
  type SignaturePlacement,
} from '@/lib/signatureStamp';
import { useToast } from '@/hooks/use-toast';
import { useTaskActivity } from '@/hooks/useStaffActivity';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { CloudAlert, CloudUpload, Download, LifeBuoy, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react';

/** A cloud with a check mark: the form is saved. Drawn like the other icons. */
const CloudCheck: React.FC<{ className?: string; 'aria-hidden'?: boolean }> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    <path d="m8.5 14.5 2.5 2.5 4.5-4.5" />
  </svg>
);
import { COMPLETED_STATUS, type FormType } from '@/lib/formSigning';
import type { FormRow } from '@/components/forms/FormsHub';
import {
  extractPdfFieldValues,
  formDownloadName,
  prefillTemplate,
  fillBlankIds,
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
import { nextFormTitle } from '@/lib/formTitles';
import { fitMultilineText, relaxPdfFormFields } from '@/lib/pdfFormFields';
import { wireAutoGrowFields } from '@/lib/pdfAutoGrow';
import { isLonScoreChange, updateLonTotal } from '@/lib/pdfLonTotal';
import { fillFromLon } from '@/lib/lonToRecord';
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
  {
    // Horizon's form is a Word form whose fields do not survive the trip to
    // PDF; scripts/move-in/place-fields.py puts them back, on Word's own pages.
    formType: 'Move-In Supports Request',
    mco: 'Horizon',
    file: '/form-templates/move-in-supports-request.pdf',
    label: 'Horizon Move-in Supports Request',
    description: 'Deposits, fees, moving costs, furniture and groceries for a member moving in.',
  },
  {
    formType: 'Move-In Supports Request',
    mco: 'Wellpoint',
    file: '/form-templates/wellpoint-move-in-supports-request.pdf',
    label: 'Wellpoint Move-in Supports Request',
    description: 'Wellpoint request for one-time transitional move-in expenses.',
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
  const finishTask = useTaskActivity(
    true,
    'form',
    `Filling out ${template?.formType ?? existing?.form_type ?? "a form"}`,
    existing?.client_id ?? lockedClientId ?? null,
  );
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
  /**
   * A copy of a reopened form's file, kept for measuring where a signature
   * goes. The viewer takes the bytes it is given for its own worker, leaving
   * existingBytes empty ("detached"), which made Add signature fail with
   * "Cannot perform Construct on a detached ArrayBuffer".
   */
  const existingCopyRef = useRef<Uint8Array | null>(null);
  const [hasFields, setHasFields] = useState<boolean | null>(null);
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  // New-form mode: template pre-filled with the client's identity fields.
  const [prefilledBytes, setPrefilledBytes] = useState<Uint8Array | null>(null);
  const [clientRecord, setClientRecord] = useState<
    (AutofillClient & { id: string }) | null
  >(null);

  // Saving as people go. Answers used to live only in the open window until
  // someone pressed Save draft or Complete form, so a click outside the form,
  // Escape, Cancel or a closed tab threw away everything typed or pasted in.
  /** The form row this window saves into: the one opened, or the draft autosave made. */
  const savedIdRef = useRef<string | null>(existing?.id ?? null);
  /** Answers changed since the last save. */
  const dirtyRef = useRef(false);
  const [editTick, setEditTick] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'failed'>('idle');
  const autosaveRunning = useRef<Promise<void> | null>(null);
  /** A file only autosave points at, removed once a later save replaces it. */
  const autosaveFileRef = useRef<string | null>(null);
  const lastSaveTimeRef = useRef(Date.now());
  const [confirmClose, setConfirmClose] = useState(false);
  /** Support is open over the form: Escape there closes support, not the form. */
  const [supportInUse, setSupportInUse] = useState(false);
  useEffect(() => {
    const onSupport = (e: Event) => setSupportInUse(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener('support-in-use', onSupport);
    return () => window.removeEventListener('support-in-use', onSupport);
  }, []);
  /** Anything saved without the window closing, so the list is refreshed on close. */
  const autosavedRef = useRef(false);
  /** The file the latest autosave wrote, not yet kept as a version. */
  const unrecordedFileRef = useRef<{ path: string; hash: string; size: number } | null>(null);

  const formType = existing ? existing.form_type : template?.formType ?? '';
  /** Forms with a web version open on it; the PDF view is one press away. */
  const webCandidates = WEB_FORMS[formType] ?? [];
  /**
   * The web form for the PDF opened: picked from its boxes once it loads,
   * since one form type can be several MCOs' forms. Undefined until then.
   */
  const [matchedSchema, setMatchedSchema] = useState<WebFormSchema | null | undefined>(undefined);
  const webSchema = matchedSchema ?? null;
  const [view, setView] = useState<'form' | 'pdf'>(webCandidates.length ? 'form' : 'pdf');
  /** Bumped on the way into the PDF view, so its boxes show the web form's answers. */
  const [pagesKey, setPagesKey] = useState(0);
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
      // Drafts saved before the intake's answer boxes were uncapped still
      // carry the cap; lift it on the way in so reopening one is not a step
      // backwards.
      const relaxed = await relaxPdfFormFields(await data.arrayBuffer());
      // An IAT, LON or HSP started before the client's numbers were known:
      // its blank Medicaid number and MCO member ID boxes are filled from the
      // client record (or their intake). A box with anything in it stays.
      let bytes: Uint8Array | ArrayBuffer = relaxed;
      if (existing?.client_id) {
        const facts = await loadClientFacts(existing.client_id).catch(() => null);
        const filled = facts ? await fillBlankIds(relaxed, existing.form_type, facts).catch(() => null) : null;
        if (filled) bytes = filled;
      }
      existingCopyRef.current = (bytes as Uint8Array).slice();
      setExistingBytes(bytes as typeof relaxed);
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

        // The record first; where it is blank, the client's other filed
        // documents and their intake fill in.
        const client = await loadClientFacts(clientId);
        if (cancelled) return;
        setClientRecord(client);
        const cm = await loadCaseManagerFacts(client.assigned_employee_id ?? profileId);

        // The registry decides which blank form this is, so a template an
        // admin has replaced is the one staff fill in.
        const blank = await loadBlankTemplate(template.formType, template.mco, template.file);
        const bytes = await prefillTemplate(blank, template.formType, client, {
          ...cm,
          name: cm.name || signerName,
        });
        // The registry copy is whatever an admin last uploaded, so it is
        // relaxed here rather than trusted to have been built that way.
        const relaxed = await relaxPdfFormFields(bytes);
        // Loading the client's details takes a few seconds, and swapping in
        // the pre-filled copy replaces the form on screen. Anything typed or
        // pasted into the blank one meanwhile would go with it, so the blank
        // one stays.
        const typedSince =
          dirtyRef.current ||
          ((docRef.current as unknown as { annotationStorage?: { size?: number } } | null)
            ?.annotationStorage?.size ?? 0) > 0;
        if (!cancelled && !typedSince) setPrefilledBytes(relaxed);
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
  }, [existing, template, clientId, signerName, profileId]);

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

  // The LON's TOTAL SCORE is added up from its score dropdowns as they change
  // (src/lib/pdfLonTotal.ts). The fields are pdf.js's, not React's, so the
  // listener is a plain one; pdf.js stores the choice first, so the sum runs
  // just after.
  const pagesRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || formType !== 'Level of Need (LON)') return;
    const onChange = (e: Event) => {
      if (isLonScoreChange(e.target)) window.setTimeout(() => void updateLonTotal(docRef.current as never), 0);
    };
    el.addEventListener('change', onChange);
    el.addEventListener('input', onChange);
    return () => {
      el.removeEventListener('change', onChange);
      el.removeEventListener('input', onChange);
    };
  }, [formType, numPages]);

  /** The current PDF bytes including everything typed into the form fields. */
  const collectFilledPdf = async (): Promise<Blob> => {
    const doc = docRef.current;
    if (!doc) throw new Error('The form is still loading — try again in a moment.');
    const bytes = await doc.saveDocument();
    // The viewer draws a long answer's last line just below its box, where it
    // prints as nothing. Redraw the big boxes to fit before the form is filed.
    const fitted = await fitMultilineText(bytes);
    return new Blob([fitted as unknown as BlobPart], { type: 'application/pdf' });
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

  /** Opened with Edit on a completed form: the button updates it. */
  const updating = !!existing && existing.status !== 'draft' && existing.status !== 'changes_requested';



  const handleSubmit = async (asDraft = false) => {
    // An autosave still writing would otherwise race this save for the row.
    await autosaveRunning.current;
    await saveForm(asDraft, false);
  };

  const saveForm = async (asDraft: boolean, silent: boolean) => {
    if (silent) {
      await writeForm(asDraft, true);
      return;
    }
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
      await writeForm(asDraft, false);
    } catch (err: any) {
      const raw = err?.message ?? '';
      toast({
        title: 'Could not submit the form',
        // Permission errors used to be reported as the client not being
        // assigned, whatever the reason. Say what the database said.
        description: raw.includes('row-level security')
          ? `You don't have permission to save this form for this client. If this client is assigned to you, report this message using Support. (${raw})`
          : raw,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  /** Write the form to storage and its row. Silent is autosave: no messages, the window stays open. */
  const writeForm = async (asDraft: boolean, silent: boolean) => {
    // Edits made while this save runs belong to the next one.
    dirtyRef.current = false;
    {
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
          blob = new Blob([stamped.slice().buffer], { type: 'application/pdf' });
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
      const targetId = savedIdRef.current;
      if (targetId) {
        // Repoint the same row at the corrected file; the previously
        // submitted file stays in storage as history. original_file_path
        // keeps the first submission for the audit trail.
        // Autosave on a completed form, or one sent back for changes, saves
        // the answers and leaves its status and signature as they are.
        const keepStatus = silent && !!existing && existing.status !== 'draft';
        const { error } = await supabase
          .from('client_forms')
          .update({
            file_path: filePath,
            file_size: blob.size,
            file_hash: fileHash,
            ...(keepStatus
              ? {}
              : {
                  status: asDraft ? 'draft' : COMPLETED_STATUS,
                  signature_name: asDraft ? null : signerName,
                  signed_by: asDraft ? null : profileId,
                  signed_at: asDraft ? null : new Date().toISOString(),
                }),
          })
          .eq('id', targetId);
        if (error) throw error;
        formId = targetId;
      } else {
        // A second form of a kind is filed beside the first, not over it, so
        // it needs a name of its own to be told apart by.
        const { data: sameType } = await supabase
          .from('client_forms')
          .select('title')
          .eq('client_id', clientId)
          .eq('form_type', formType);

        const { data: inserted, error } = await supabase
          .from('client_forms')
          .insert({
            client_id: clientId,
            employee_id: profileId,
            form_type: formType,
            title: nextFormTitle(formType, (sameType ?? []).map((f) => f.title)),
            file_path: filePath,
            original_file_path: filePath,
            file_size: blob.size,
            file_hash: fileHash,
            status: asDraft ? 'draft' : COMPLETED_STATUS,
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
        savedIdRef.current = formId;
      }

      // The file the previous autosave wrote is no longer pointed at by
      // anything, so it goes. Never a file a person saved.
      const replaced = autosaveFileRef.current;
      autosaveFileRef.current = silent && targetId ? filePath : null;
      if (replaced) void supabase.storage.from('client-files').remove([replaced]).catch(() => {});
      lastSaveTimeRef.current = Date.now();

      unrecordedFileRef.current = silent ? { path: filePath, hash: fileHash, size: blob.size } : null;
      if (silent) {
        autosavedRef.current = true;
        setLastSavedAt(new Date());
        return;
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
      // A completed LON is the new assessment: its level of need and score go
      // on the client record (src/lib/lonToRecord.ts).
      if (!asDraft && formType === 'Level of Need (LON)') {
        await fillFromLon(clientId, { overwrite: true }).catch(() => null);
      }

      // The Medicaid number and MCO member ID typed on an intake go on the
      // client record as soon as it is saved, a draft included, wherever the
      // record has none, so the IAT and LON carry them.
      if ((asDraft || silent) && formType === 'Client Intake') {
        try {
          const values = await extractPdfFieldValues(await blob.arrayBuffer());
          const { draft } = intakeDraftFromPdfFields(values);
          const { data: clientRow } = await supabase
            .from('clients')
            .select('date_of_birth, member_id, medicaid_id, phone')
            .eq('id', clientId)
            .maybeSingle();
          await applyWriteThrough(clientId, writeThroughPlan(draft, clientRow ?? {}, values.client_phone).fill);
        } catch {
          // The form is saved; the record catches up when it is completed.
        }
      }

      if (!asDraft && formType === 'Client Intake') {
        try {
          const values = await extractPdfFieldValues(await blob.arrayBuffer());
          if (Object.keys(values).length) {
            const { draft, household } = intakeDraftFromPdfFields(values);
            await saveIntake({ clientId, draft, household, profileId, complete: true });
            await markLifecycleIntakeComplete(clientId);

            const { data: clientRow } = await supabase
              .from('clients')
              .select('date_of_birth, member_id, medicaid_id, phone')
              .eq('id', clientId)
              .maybeSingle();
            const plan = writeThroughPlan(draft, clientRow ?? {}, values.client_phone);
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
          : updating
            ? 'Form updated'
            : 'Form completed',
        description: asDraft
          ? 'Saved to the client record as a draft. Open it again to finish it.'
          : 'Saved to the client record. To change it later, select Edit on it under Forms.',
      });
      finishTask(asDraft ? 'draft' : 'completed');
      onSubmitted();
      onClose();
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
      } else if (existingCopyRef.current) {
        geometry = existingCopyRef.current.slice();
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
      toast({
        title: `Signed with ${label}`,
        description: view === 'form' && webSchema ? 'Select PDF to see it or move it.' : 'Drag it to where it belongs.',
      });
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
  /**
   * Every form saves itself. New forms and drafts save as a draft; a completed
   * form being edited, or one sent back for changes, keeps its status.
   */
  const canAutosave =
    hasFields !== false &&
    !!clientId &&
    numPages > 0;

  // Every answer typed, pasted or picked in the form marks it as changed.
  useEffect(() => {
    const el = pagesRef.current;
    if (!el) return;
    const changed = () => {
      dirtyRef.current = true;
      setEditTick((t) => t + 1);
    };
    el.addEventListener('input', changed);
    el.addEventListener('change', changed);
    return () => {
      el.removeEventListener('input', changed);
      el.removeEventListener('change', changed);
    };
  }, [numPages]);

  // Placing, moving or removing a signature is a change too.
  const firstSignatures = useRef(true);
  useEffect(() => {
    if (firstSignatures.current) {
      firstSignatures.current = false;
      return;
    }
    dirtyRef.current = true;
    setEditTick((t) => t + 1);
  }, [signatures]);

  const runAutosave = () => {
    if (!canAutosave || saving || autosaveRunning.current || !dirtyRef.current) return;
    setAutosaveState('saving');
    autosaveRunning.current = saveForm(true, true)
      .then(() => setAutosaveState('idle'))
      .catch(() => {
        dirtyRef.current = true;
        setAutosaveState('failed');
      })
      .finally(() => {
        autosaveRunning.current = null;
      });
  };
  const runAutosaveRef = useRef(runAutosave);
  runAutosaveRef.current = runAutosave;

  // Saved 10 seconds after the last change, and at least once a minute while
  // someone keeps typing.
  useEffect(() => {
    if (!canAutosave || !dirtyRef.current) return;
    const overdue = Date.now() - lastSaveTimeRef.current > 60_000;
    const timer = window.setTimeout(() => runAutosaveRef.current(), overdue ? 0 : 10_000);
    return () => window.clearTimeout(timer);
  }, [editTick, canAutosave]);

  // Closing the tab or reloading with unsaved answers asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current && !autosaveRunning.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /** Close, letting the list know about a draft autosave made. */
  const closeNow = () => {
    // What autosave wrote is kept as a version, so Edit history shows who
    // made these changes rather than the next person to save.
    const last = unrecordedFileRef.current;
    if (last && savedIdRef.current) {
      unrecordedFileRef.current = null;
      autosaveFileRef.current = null;
      void recordFormVersion({
        clientFormId: savedIdRef.current,
        filePath: last.path,
        versionType: existing && existing.status !== 'draft' ? 'corrected' : 'draft',
        createdBy: profileId,
        fileHash: last.hash,
        fileSize: last.size,
      }).catch(() => {});
    }
    if (!existing && savedIdRef.current) {
      finishTask('draft');
      onSubmitted();
    } else if (existing && autosavedRef.current) {
      onSubmitted();
    }
    onClose();
  };

  /** Cancel, the X, Escape: ask first when there is anything unsaved. */
  const requestClose = () => {
    if (saving) return;
    if (dirtyRef.current || autosaveRunning.current || (replacementFile && !lastSavedAt)) {
      setConfirmClose(true);
      return;
    }
    closeNow();
  };

  const saveAndClose = async () => {
    setConfirmClose(false);
    await autosaveRunning.current;
    if (existing && existing.status !== 'draft') {
      // Saved as autosave does, so a completed form stays completed.
      setSaving(true);
      try {
        await saveForm(true, true);
        closeNow();
      } catch (err: unknown) {
        toast({
          title: 'Could not save the form',
          description: err instanceof Error ? err.message : String(err),
          variant: 'destructive',
        });
      } finally {
        setSaving(false);
      }
      return;
    }
    await saveForm(true, false);
  };
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
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        // A click outside the form never closes it: people click away to copy
        // from another window and come back.
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          if (!supportInUse) requestClose();
        }}
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

        {existing?.status === 'changes_requested' && existing.review_note && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div className="text-xs font-medium">Note on this form</div>
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
            {webSchema && hasFields !== false && (
              <div className="flex rounded-lg border bg-muted/40 p-0.5 text-sm" role="tablist" aria-label="View">
                {(['form', 'pdf'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => {
                      if (v === 'pdf' && view !== 'pdf') setPagesKey((k) => k + 1);
                      setView(v);
                    }}
                    className={`rounded-md px-3 py-1 ${view === v ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
                  >
                    {v === 'form' ? 'Form' : 'PDF'}
                  </button>
                ))}
              </div>
            )}
            {view === 'pdf' && (<>
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
            </>)}
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
            lines. {existing && existing.status !== 'draft'
              ? 'Your changes save 10 seconds after you stop typing.'
              : 'Your answers save as a draft 10 seconds after you stop typing.'} If a handwritten
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
                  if (webCandidates.length) {
                    const match = webFormFor(formType, Object.keys(fields ?? {}));
                    setMatchedSchema(match);
                    if (!match) setView('pdf');
                  }
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
              {view === 'form' && webSchema && numPages > 0 && docRef.current && (
                <WebFormView
                  doc={docRef.current}
                  schema={webSchema}
                  // The LON's total adds itself up from its scores.
                  afterChange={
                    formType === 'Level of Need (LON)'
                      ? async () => {
                          await updateLonTotal(docRef.current as never);
                        }
                      : undefined
                  }
                  onChange={() => {
                    dirtyRef.current = true;
                    setEditTick((t) => t + 1);
                  }}
                />
              )}
              {/* Kept loaded behind the web form: it is the document saved. */}
              <div
                className={`flex flex-col items-center gap-4 ${view === 'form' && webCandidates.length && matchedSchema !== null ? 'hidden' : ''}`}
                ref={pagesRef}
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <div
                    key={`${i}-${pagesKey}`}
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
                      // The tall answer boxes hold more than they show, so
                      // each one grows to its text while it is being written
                      // in. Zooming re-renders the layer and builds new
                      // fields, hence wiring them up on every render.
                      onRenderAnnotationLayerSuccess={() =>
                        wireAutoGrowFields(pageRefs.current[i])
                      }
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
                            className={`absolute z-20 cursor-move touch-none rounded border border-dashed outline-none ${
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
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleDownloadCopy} disabled={!numPages}>
              <Download className="h-4 w-4 mr-1" />
              Download copy
            </Button>
            {/* The Support button sits under this window, so the window has its own. */}
            <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('open-support'))}>
              <LifeBuoy className="h-4 w-4 mr-1" />
              Support
            </Button>
            {canAutosave && (autosaveState !== 'idle' || lastSavedAt) && (
              <span
                className={`flex items-center gap-1.5 text-xs ${autosaveState === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}
                aria-live="polite"
              >
                {autosaveState === 'saving' ? (
                  <CloudUpload className="h-5 w-5" aria-hidden />
                ) : autosaveState === 'failed' ? (
                  <CloudAlert className="h-5 w-5" aria-hidden />
                ) : (
                  <CloudCheck className="h-5 w-5 text-green-600" aria-hidden />
                )}
                {autosaveState === 'saving'
                  ? 'Saving…'
                  : autosaveState === 'failed'
                    ? `Not saved. Select ${updating ? 'Update form' : 'Save draft'}.`
                    : `${existing && existing.status !== 'draft' ? 'Saved' : 'Draft saved'} ${lastSavedAt!.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requestClose} disabled={saving}>
              Close
            </Button>
            {/* Signing comes last, with the buttons that finish the form. */}
            {!showReplacementPicker && <SignOnForm compact count={signatures.length} onSign={sign} />}
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
              // Never finishable before it can be saved.
              disabled={saving || !clientId || (!numPages && !showReplacementPicker)}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {saving ? 'Saving...' : updating ? 'Update form' : 'Complete form'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your latest changes to this form have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                setConfirmClose(false);
                dirtyRef.current = false;
                closeNow();
              }}
            >
              Discard changes
            </Button>
            {clientId && (
              <Button onClick={() => void saveAndClose()}>
                {existing && existing.status !== 'draft' ? 'Save changes' : 'Save draft'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
