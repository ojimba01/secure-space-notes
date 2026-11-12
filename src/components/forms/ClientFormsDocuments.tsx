import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, ChevronDown, ChevronRight, FileText, MoreHorizontal, Upload, X } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  EXTERNAL_STATUS_LABEL,
  FORM_STATUS_CLASS,
  FORM_STATUS_LABEL,
  goesToMco,
} from '@/lib/formSigning';

const isCompleted = (f: { status: string }) =>
  f.status !== 'draft' && f.status !== 'changes_requested';
import { formDownloadName } from '@/lib/formAutofill';
import { recordFormVersion } from '@/lib/formVersions';
import { CHECKLIST_TYPES, loadManualTicks } from '@/lib/formChecklist';
import { FORM_LIST_COLUMNS, type FormRow } from '@/components/forms/FormsHub';
import { UploadFormDialog } from '@/components/forms/UploadFormDialog';
import {
  PDF_TEMPLATES,
  TemplateFillDialog,
  type PdfTemplate,
} from '@/components/forms/TemplateFillDialog';
import { nextFormTitle } from '@/lib/formTitles';
import { UhcMoveInDialog, type UhcExistingForm } from '@/components/forms/UhcMoveInDialog';
import { fetchClientAuthorizations, formatAuthDate, type ClientAuthorization } from '@/lib/authorizations';
import { FORMS_FOR_RESTART, latestRestart, pendingRestart, type PendingRestart } from '@/lib/restartAuthorization';
import { UHC_FORM_LABEL, UHC_FORM_TYPE, UHC_MCO } from '@/lib/uhcMoveIn/model';

const PDFPreviewDialog = React.lazy(() => import('@/components/PDFPreviewDialog'));

/** Read off the documents themselves, shown above the list rather than behind a click. */
const FIELD_COLUMNS =
  'field_member_name, field_member_id, field_medicaid_id, field_member_dob, ' +
  'field_icd10_code, field_authorization_number, field_service_start, field_service_end, ' +
  'fields_extracted_at, form_data';

type DocumentRow = FormRow & Partial<Record<
  | 'field_member_name'
  | 'field_member_id'
  | 'field_medicaid_id'
  | 'field_member_dob'
  | 'field_icd10_code'
  | 'field_authorization_number'
  | 'field_service_start'
  | 'field_service_end'
  | 'fields_extracted_at',
  string | null
>> & { form_data?: unknown };

interface Props {
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
  /** Bumped when something else on the record files or removes a form. */
  refreshKey?: number;
  /** Called after this screen files or removes one, so the rest can catch up. */
  onChanged?: () => void;
  /** Shown inside Case overview: no card of its own, a small heading instead. */
  embedded?: boolean;
  /** Buttons beside the heading, such as Upload documents. */
  actions?: React.ReactNode;
}

/** Whether the client has a form: the label on its checklist row. */
const CHECKLIST_STATUS = {
  none: { label: 'Not started', className: 'bg-muted text-muted-foreground' },
  draft: { label: 'Draft started', className: 'bg-amber-100 text-amber-900' },
  done: { label: 'Completed', className: 'bg-green-100 text-green-800' },
} as const;

/**
 * One grid for every row in the list, so status, name, document count and
 * buttons line up whatever a row offers. Empty cells keep their width.
 * Columns: status, name, documents, action, upload, more.
 *
 * The list switches by its own width, not the screen's (src/index.css): with
 * the side panel open a laptop screen leaves it too narrow for the grid.
 */
const ROW_GRID = 'forms-row-wide grid-cols-[96px_minmax(0,1fr)_124px_168px_36px_36px] items-center gap-x-3';
const ROW_STACK = 'forms-row-narrow';

type ActionStyle = 'filled' | 'link' | 'green' | 'draft';

const ACTION_CLASS: Record<ActionStyle, string> = {
  filled: '',
  link: 'text-muted-foreground underline underline-offset-4 hover:bg-transparent hover:text-foreground',
  green: 'bg-green-600 text-white hover:bg-green-700',
  // Continue: amber, like the Draft started label, so it is not mistaken for Begin.
  draft: 'bg-amber-500 text-white hover:bg-amber-600',
};

interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
}

/** One row of the list: the form or collection, and what can be done with it. */
interface RowSpec {
  /** Stable id for the open/closed state. */
  id: string;
  name: string;
  items: DocumentRow[];
  status?: { label: string; className: string };
  /**
   * The one action. Begin is blue, Continue amber, Request authorization green, and
   * Add additional form underlined gray text.
   */
  action?: { label: React.ReactNode; title?: string; onClick: () => void; style: ActionStyle };
  upload?: { label: string; onClick: () => void };
  menu?: MenuItem[];
}

const StatusLabel: React.FC<{ status: { label: string; className: string } }> = ({ status }) => (
  <span className={`w-24 shrink-0 rounded-md px-2 py-0.5 text-center text-xs ${status.className}`}>
    {status.label}
  </span>
);

/** The ⋯ menu. Renders nothing when it would be empty. */
const MoreMenu: React.FC<{ label: string; items: MenuItem[]; rounds?: React.ReactNode; className: string }> = ({
  label,
  items,
  rounds,
  className,
}) => {
  if (!items.length && !rounds) return null;
  const last = items.filter((i) => i.destructive);
  const first = items.filter((i) => !i.destructive);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={`p-0 ${className}`} aria-label={`More actions for ${label}`} title="More actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {first.map((i) => (
          <DropdownMenuItem key={i.label} onSelect={i.onSelect}>
            {i.label}
          </DropdownMenuItem>
        ))}
        {rounds}
        {last.map((i) => (
          <DropdownMenuItem key={i.label} onSelect={i.onSelect} className="text-destructive focus:text-destructive">
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const AUTH_GROUP = 'MCO referrals and authorizations';

/** Collections below the checklist: documents that arrive, rather than forms owed. */
const EXTRA_GROUPS: { title: string; match: (f: DocumentRow) => boolean }[] = [
  {
    title: AUTH_GROUP,
    // Imported authorization paperwork the classifier could not place arrives
    // as "Unsorted" with no workflow purpose, so the filename is the only signal.
    match: (f) =>
      f.form_type === 'Approval Letter' ||
      f.form_type === 'Approval Notice (Wellpoint)' ||
      f.form_type === 'Denial Letter' ||
      f.form_type === 'Prior Authorization Request' ||
      (f.form_type === 'Unsorted' &&
        /authorization|referral|auth\b/i.test(`${f.title} ${f.source_filename ?? ''}`)),
  },
  { title: 'Other documents', match: () => true },
];

/**
 * Not shown for now: document rows no longer offer the MCO buttons. Kept,
 * with setMcoStatus, so they can be brought back.
 *
 * The MCO's answer, one step at a time.
 *
 * Six words in a dropdown asked somebody to pick a status. There is only one
 * thing to do next: it has gone, or it has not. Once it has gone, the only
 * thing left is what came back.
 */
const McoStep: React.FC<{
  form: DocumentRow;
  onSet: (form: DocumentRow, status: string) => void;
}> = ({ form, onSet }) => {
  const status = form.external_status ?? 'not_sent';

  if (status === 'accepted' || status === 'denied') {
    return (
      <span
        className={`rounded-md px-2 py-1 text-xs ${
          status === 'accepted' ? 'bg-green-100 text-green-800' : 'bg-destructive/15 text-destructive'
        }`}
      >
        {EXTERNAL_STATUS_LABEL[status]}
      </span>
    );
  }

  if (status === 'sent_to_mco' || status === 'awaiting_response') {
    return (
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onSet(form, 'accepted')}>
          Accepted by MCO
        </Button>
        <Button variant="outline" size="sm" onClick={() => onSet(form, 'denied')}>
          Denied by MCO
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={() => onSet(form, 'sent_to_mco')}>
      Sent to MCO
    </Button>
  );
};

/**
 * A client's forms and documents.
 *
 * The four forms every client should have sit at the top as a checklist. A box
 * is ticked by a document being filed, and can be ticked by hand when the form
 * was completed somewhere this app cannot see — on paper, or in Availity before
 * this app existed. Pressing a row opens the documents behind it.
 */
export const ClientFormsDocuments: React.FC<Props> = ({
  clientId,
  clientFirstName,
  clientLastName,
  refreshKey = 0,
  onChanged,
  embedded = false,
  actions,
}) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const { isAdmin } = useIsAdmin();
  const [forms, setForms] = useState<DocumentRow[]>([]);
  const [manualTicks, setManualTicks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<DocumentRow | null>(null);
  /** The form type a document is being uploaded for, from a checklist row. */
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  /** The blank template being filled in, from a checklist row. */
  const [filling, setFilling] = useState<PdfTemplate | null>(null);
  /** A draft picked up again, to finish and complete. */
  const [continuing, setContinuing] = useState<DocumentRow | null>(null);
  /** The UHC request being filled in: a new one, or a saved one opened again. */
  const [uhc, setUhc] = useState<UhcExistingForm | 'new' | null>(null);
  /** The client's MCO, which decides whose move-in request they fill in. */
  const [mco, setMco] = useState<string | null>(null);
  /** The client's latest authorization, when it restarted services after a gap. */
  const [restart, setRestart] = useState<ClientAuthorization | null>(null);
  /** The client's current round, and a restart still waiting for its date. */
  const [round, setRound] = useState(1);
  const [pending, setPending] = useState<PendingRestart | null>(null);
  const [signerName, setSignerName] = useState('Case manager');
  const [preview, setPreview] = useState<{
    id: string;
    file_name: string;
    file_path: string;
    file_type?: string;
  } | null>(null);

  /** Staff names by profile id, for who filled each form out. */
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const clientRow = await supabase
        .from('clients')
        .select('insurance, billing_round, restart_pending_at, restart_pending_type')
        .eq('id', clientId)
        .maybeSingle();
      const currentRound = clientRow.data?.billing_round ?? 1;
      const [formsResult, ticks] = await Promise.all([
        supabase
          .from('client_forms')
          .select(`${FORM_LIST_COLUMNS}, ${FIELD_COLUMNS}`)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        loadManualTicks(clientId, currentRound).catch(() => new Set<string>()),
      ]);
      setMco(clientRow.data?.insurance ?? null);
      setRound(currentRound);
      setPending(pendingRestart(clientRow.data));
      setRestart(latestRestart(await fetchClientAuthorizations(clientId).catch(() => [])));
      if (formsResult.error) throw formsResult.error;
      const rows = (formsResult.data as unknown as DocumentRow[]) ?? [];
      setForms(rows);
      setManualTicks(ticks);

      const ids = [...new Set(rows.map((f) => f.employee_id).filter((id): id is string => !!id))];
      if (ids.length) {
        const { data: people } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', ids);
        setStaffNames(
          Object.fromEntries(
            (people ?? []).map((p) => [
              p.id,
              `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Unknown',
            ]),
          ),
        );
      }
    } catch (err: any) {
      toast({
        title: 'Could not load forms and documents',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Whose name goes on a form begun from here.
  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', profileId)
        .maybeSingle();
      setSignerName(
        `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim() || data?.email || 'Case manager',
      );
    })();
  }, [profileId]);

  const download = async (form: DocumentRow) => {
    if (!form.file_path) return;
    try {
      const { data, error } = await supabase.storage.from('client-files').download(form.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = form.form_data
        ? formDownloadName(clientFirstName, clientLastName, 'UHC Move-in Supports', form.created_at).replace(/\.pdf$/, '.xlsx')
        : formDownloadName(clientFirstName, clientLastName, form.form_type, form.created_at);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  /** Remove the stored file and the record together. */
  const remove = async (form: DocumentRow) => {
    try {
      if (form.file_path) {
        // A file left behind costs disk. A record pointing at a deleted file
        // breaks the client's tab, so the record is what must go.
        await supabase.storage.from('client-files').remove([form.file_path]);
      }
      const { error } = await supabase.from('client_forms').delete().eq('id', form.id);
      if (error) throw error;
      toast({ title: 'Document removed' });
      setConfirmDelete(null);
      load();
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Could not remove it', description: err.message, variant: 'destructive' });
    }
  };

  const setMcoStatus = async (form: DocumentRow, external_status: string) => {
    try {
      const now = new Date().toISOString();
      const payload: Record<string, unknown> = { external_status };
      if (external_status === 'sent_to_mco') payload.sent_to_mco_at = now;
      if (external_status === 'accepted' || external_status === 'denied') {
        payload.mco_response_at = now;
      }
      const { error } = await supabase.from('client_forms').update(payload).eq('id', form.id);
      if (error) throw error;

      // Snapshot exactly which file went to the MCO so it stays retrievable
      // even after later corrections repoint the form.
      if (external_status === 'sent_to_mco' && form.file_path) {
        await recordFormVersion({
          clientFormId: form.id,
          filePath: form.file_path,
          versionType: 'sent_to_mco',
        }).catch(() => undefined);
      }
      load();
    } catch (err: any) {
      toast({ title: 'Could not update the MCO status', description: err.message, variant: 'destructive' });
    }
  };

  /**
   * Record a form that was completed somewhere this app cannot see.
   *
   * A client_forms row with no file, which is what the case lifecycle card
   * writes too, so both screens agree and there is one way a form becomes
   * done. It does not need a document, and adding one later just adds one.
   */
  const markComplete = async (formType: string) => {
    if (!profileId) return;
    const { error } = await supabase.from('client_forms').insert({
      client_id: clientId,
      employee_id: profileId,
      form_type: formType,
      title: nextFormTitle(formType, forms.filter((f) => f.form_type === formType).map((f) => f.title)),
      status: 'approved',
      source: 'created_in_app',
      external_status: 'not_applicable',
    });
    if (error) {
      toast({ title: 'Could not record it', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: `${formType} marked complete`,
      description: 'Recorded without a file. Upload the document later if you have one.',
    });
    load();
    onChanged?.();
  };

  /** The move-in request for this client's MCO: UHC's in the app, Horizon's and Wellpoint's as PDFs. */
  const moveInStart = useMemo(() => {
    if (mco === UHC_MCO) return { label: UHC_FORM_LABEL, start: () => setUhc('new') };
    const t = PDF_TEMPLATES.find((x) => x.formType === UHC_FORM_TYPE && x.mco === mco);
    return t ? { label: t.label, start: () => setFilling(t) } : null;
  }, [mco]);

  /** This round's documents; earlier rounds' stay on record, folded away. */
  const current = useMemo(() => forms.filter((f) => (f.round ?? 1) >= round), [forms, round]);
  const earlier = useMemo(() => forms.filter((f) => (f.round ?? 1) < round), [forms, round]);

  /** The type of the restart that opened this round, once it is known. */
  const restartType = pending ? pending.type : round > 1 ? restart?.authorization_type ?? null : null;

  /** The forms this round's restart needs, and whether this round has one. */
  const restartForms = useMemo(() => {
    if (!restartType) return [];
    return (FORMS_FOR_RESTART[restartType] ?? []).map((type) => ({
      type,
      filed: current.some((f) => f.form_type === type && isCompleted(f)) || manualTicks.has(type),
    }));
  }, [restartType, current, manualTicks]);

  /** Admins move a document to the round it belongs to. */
  const moveToRound = async (form: DocumentRow, to: number) => {
    const { error } = await supabase.from('client_forms').update({ round: to } as never).eq('id', form.id);
    if (error) {
      toast({ title: 'Could not move the document', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: `Moved to round ${to}` });
    load();
    onChanged?.();
  };

  /** The MCO's own authorization request (Aetna, Wellpoint), started from here. */
  const authTemplate = useMemo(
    () => PDF_TEMPLATES.find((x) => x.formType === 'Prior Authorization Request' && x.mco === mco) ?? null,
    [mco],
  );

  /** The blank template this app ships for a checklist form, where it has one. */
  const templateFor = (formType: string): PdfTemplate | undefined =>
    PDF_TEMPLATES.find((t) => t.formType === formType && !t.mco);

  const byType = useMemo(() => {
    const map = new Map<string, DocumentRow[]>();
    for (const f of current) {
      const list = map.get(f.form_type) ?? [];
      list.push(f);
      map.set(f.form_type, list);
    }
    return map;
  }, [current]);

  /** Everything the checklist does not claim, in its own collections. */
  const extras = useMemo(() => {
    const claimed = new Set<string>([...CHECKLIST_TYPES, UHC_FORM_TYPE]);
    const rest = current.filter((f) => !claimed.has(f.form_type));
    return EXTRA_GROUPS.map(({ title }) => ({ title, items: [] as DocumentRow[] })).map(
      (group, i, all) => {
        for (const f of rest) {
          const idx = EXTRA_GROUPS.findIndex((g) => g.match(f));
          if ((idx === -1 ? all.length - 1 : idx) === i) group.items.push(f);
        }
        return group;
      },
    );
  }, [current]);

  const toggleOpen = (title: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  /** "Filled out by Dana Reyes · Sep 30, 2026, 2:14 PM", or uploaded or imported. */
  const filledOutLine = (form: DocumentRow) => {
    const who = form.employee_id ? staffNames[form.employee_id] : undefined;
    const when = new Date(form.created_at).toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    if (form.source === 'bulk_import') return round > 1 ? `Imported · ${when} · Round ${form.round ?? 1}` : `Imported · ${when}`;
    const verb = form.source === 'manual_upload' ? 'Uploaded' : 'Filled out';
    const line = who ? `${verb} by ${who} · ${when}` : `${verb} · ${when}`;
    return round > 1 ? `${line} · Round ${form.round ?? 1}` : line;
  };

  /** Opening a document: a draft goes back into the editor, anything else is previewed. */
  const openDocument = (form: DocumentRow) =>
    form.form_data
      ? setUhc({ id: form.id, client_id: form.client_id, status: form.status, form_data: form.form_data })
      : !isCompleted(form) && form.file_path
        ? setContinuing(form)
        : form.file_path &&
          setPreview({
            id: form.id,
            file_name: form.title || `${form.form_type}.pdf`,
            file_path: form.file_path,
            file_type: 'application/pdf',
          });

  const documentRow = (form: DocumentRow) => {
    const canOpen = !!form.file_path || !!form.form_data;
    // A draft is unfinished work: the way back into it is the row's button.
    const continues = !isCompleted(form) && !!form.file_path && !form.form_data;
    const title = form.title || form.form_type;
    const statusLabel = (
      <span className={`w-fit rounded-md px-2 py-0.5 text-xs ${FORM_STATUS_CLASS[form.status] ?? ''}`}>
        {FORM_STATUS_LABEL[form.status] ?? form.status}
      </span>
    );
    const menu: MenuItem[] = [
      ...(continues && form.file_path ? [{ label: 'Download', onSelect: () => void download(form) }] : []),
      { label: 'Remove', onSelect: () => setConfirmDelete(form), destructive: true },
    ];
    const rounds =
      isAdmin && round > 1 ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to round</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {Array.from({ length: round }, (_, i) => i + 1).map((n) => (
              <DropdownMenuItem key={n} disabled={(form.round ?? 1) === n} onSelect={() => void moveToRound(form, n)}>
                Round {n}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : undefined;
    const name = (wide: boolean) => (
      <button
        type="button"
        disabled={!canOpen}
        onClick={() => openDocument(form)}
        title={canOpen ? 'Open this document' : 'No file is stored for this document'}
        className="flex min-w-0 items-start gap-2 text-left disabled:cursor-default"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <div className={`text-sm ${wide ? 'truncate' : ''} ${canOpen ? 'hover:underline' : ''}`}>{title}</div>
          <div className="text-xs text-muted-foreground">{filledOutLine(form)}</div>
        </div>
      </button>
    );
    const button = (className: string) =>
      continues ? (
        <Button size="sm" className={`${ACTION_CLASS.draft} ${className}`} onClick={() => setContinuing(form)}>
          Continue
        </Button>
      ) : (
        <Button size="sm" variant="secondary" className={className} disabled={!form.file_path} onClick={() => void download(form)}>
          Download
        </Button>
      );
    return (
      <div key={form.id}>
        <div className={`${ROW_GRID} p-2 pl-2.5`}>
          <span />
          {name(true)}
          {statusLabel}
          {button('w-full')}
          <span />
          <div>
            <MoreMenu label={title} items={menu} rounds={rounds} className="h-9 w-9" />
          </div>
        </div>
        <div className={`${ROW_STACK} space-y-2 p-3`}>
          {name(false)}
          {statusLabel}
          <div className="flex items-center gap-2">
            {button('h-11 flex-1')}
            <MoreMenu label={title} items={menu} rounds={rounds} className="size-11" />
          </div>
        </div>
      </div>
    );
  };

  const groupRow = (row: RowSpec) => {
    const isOpen = open.has(row.id);
    const has = row.items.length > 0;
    const count = has ? `${row.items.length} document${row.items.length === 1 ? '' : 's'}` : 'None filed';
    const Chevron = isOpen ? ChevronDown : ChevronRight;
    const documents = (className: string) => (
      <button
        type="button"
        disabled={!has}
        onClick={() => toggleOpen(row.id)}
        aria-expanded={has ? isOpen : undefined}
        aria-label={has ? `${isOpen ? 'Hide' : 'Show'} ${row.name} documents` : undefined}
        className={`flex items-center justify-between gap-1.5 text-xs text-muted-foreground disabled:cursor-default ${className}`}
      >
        <span>{count}</span>
        <Chevron className={`h-4 w-4 shrink-0 ${has ? '' : 'opacity-25'}`} />
      </button>
    );
    const action = (className: string) =>
      row.action ? (
        <Button
          size="sm"
          variant={row.action.style === 'link' ? 'ghost' : 'default'}
          className={`${ACTION_CLASS[row.action.style]} ${className}`}
          title={row.action.title}
          onClick={row.action.onClick}
        >
          {row.action.label}
        </Button>
      ) : null;
    const upload = (className: string) =>
      row.upload ? (
        <Button
          variant="ghost"
          className={`p-0 ${className}`}
          title={row.upload.label}
          aria-label={row.upload.label}
          onClick={row.upload.onClick}
        >
          <Upload className="h-4 w-4" />
        </Button>
      ) : null;
    const menu = row.menu ?? [];
    return (
      <div key={row.id} className="rounded-md border">
        <div className={`${ROW_GRID} p-2 pl-2.5`}>
          {row.status ? <StatusLabel status={row.status} /> : <span />}
          <span className="truncate text-sm font-medium" title={row.name}>
            {row.name}
          </span>
          {documents('h-9 w-full')}
          {action('w-full') ?? <span />}
          {upload('h-9 w-9') ?? <span />}
          <div>
            <MoreMenu label={row.name} items={menu} className="h-9 w-9" />
          </div>
        </div>
        <div className={`${ROW_STACK} space-y-2 p-3`}>
          <div className="flex items-start justify-between gap-2">
            <span className="pt-2.5 text-sm font-medium">{row.name}</span>
            <MoreMenu label={row.name} items={menu} className="size-11 shrink-0" />
          </div>
          <div className="flex items-center justify-between gap-2">
            {row.status ? <StatusLabel status={row.status} /> : <span />}
            {documents('h-11 min-w-[124px]')}
          </div>
          {(row.action || row.upload) && (
            <div className="flex items-center gap-2">
              {action('h-11 flex-1')}
              {upload('size-11 shrink-0')}
            </div>
          )}
        </div>
        {isOpen && has && <div className="divide-y border-t bg-muted/40">{row.items.map(documentRow)}</div>}
      </div>
    );
  };

  /** A completed form opened again to correct it. Admins, or its author until it is approved. */
  const canEdit = (f: DocumentRow) =>
    isCompleted(f) && !!f.file_path && !f.form_data && !!templateFor(f.form_type) &&
    (isAdmin || (f.employee_id === profileId && f.status !== 'approved'));

  return (
    <Card className={embedded ? 'border-0 bg-transparent shadow-none' : undefined}>
      {embedded ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Forms and documents</p>
          {actions}
        </div>
      ) : (
        <CardHeader>
          <CardTitle className="text-lg">Forms and Documents</CardTitle>
        </CardHeader>
      )}
      <CardContent className={embedded ? 'space-y-4 p-0' : 'space-y-4'}>
        {/* A restart needs some forms filed again; each is ticked once this round has one. */}
        {!loading && pending && !pending.type && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            Restart pending. The forms it needs show once the type is chosen.
          </div>
        )}
        {!loading && restartForms.some((f) => !f.filed) && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-medium">
              {pending || !restart ? 'Needed for the restart' : `Needed for the restart on ${formatAuthDate(restart.start_date)}`}
            </p>
            <div className="flex flex-wrap gap-2">
              {restartForms.map((f) => (
                <span key={f.type} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2 py-1">
                  {f.filed ? <Check className="h-4 w-4 text-green-600" aria-label="Filed" /> : <X className="h-4 w-4 text-destructive" aria-label="Not filed" />}
                  {f.type}
                  {!f.filed && templateFor(f.type) && (
                    <Button size="sm" variant="outline" className="ml-1 h-7" onClick={() => setFilling(templateFor(f.type) as PdfTemplate)}>
                      Begin
                    </Button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : (
          <>
            <div className="forms-list space-y-2">
              {CHECKLIST_TYPES.map((type) => {
                const items = byType.get(type) ?? [];
                const hasDocument = items.length > 0;
                // A draft is not the form done: only a completed copy ticks it.
                const hasDraftOnly = hasDocument && !items.some(isCompleted);
                const ticked = items.some(isCompleted) || manualTicks.has(type);
                const template = templateFor(type);
                // Back into this person's own draft, and a completed copy to correct.
                const ownDraft = items.find(
                  (f) => !isCompleted(f) && f.employee_id === profileId && !!f.file_path && !f.form_data,
                );
                const editable = items.find(canEdit);
                // A client can need the same form twice (a continuation's plan,
                // a level of need redone), so a filed form still offers another.
                const fill = template
                  ? {
                      label: hasDocument ? 'Add additional form' : 'Begin',
                      title: hasDocument ? `Fill in an additional ${type}` : `Fill in the ${type}`,
                      onClick: () => setFilling(template),
                      style: (hasDocument ? 'link' : 'filled') as ActionStyle,
                    }
                  : undefined;
                const menu: MenuItem[] = [];
                if (ownDraft && template) menu.push({ label: 'Add additional form', onSelect: () => setFilling(template) });
                if (editable) menu.push({ label: 'Edit', onSelect: () => setContinuing(editable) });
                if (!ticked && !hasDraftOnly) menu.push({ label: 'Mark as complete', onSelect: () => void markComplete(type) });
                return groupRow({
                  id: type,
                  name: type,
                  items,
                  status: CHECKLIST_STATUS[ticked ? 'done' : hasDraftOnly ? 'draft' : 'none'],
                  action: ownDraft
                    ? { label: 'Continue', onClick: () => setContinuing(ownDraft), style: 'draft' }
                    : fill,
                  upload: { label: `Upload a completed ${type}`, onClick: () => setUploadFor(type) },
                  menu,
                });
              })}

              {/* Move-in supports: the request for this client's MCO. */}
              {(() => {
                const items = byType.get(UHC_FORM_TYPE) ?? [];
                return groupRow({
                  id: 'move-in',
                  name: mco ? `Move-in Supports Request (${mco})` : 'Move-in Supports Request',
                  items,
                  action: moveInStart
                    ? {
                        label: items.length ? 'Add additional form' : 'Begin',
                        title: moveInStart.label,
                        onClick: moveInStart.start,
                        style: items.length ? 'link' : 'filled',
                      }
                    : undefined,
                  upload: {
                    label: 'Upload a completed Move-in Supports Request',
                    onClick: () => setUploadFor(UHC_FORM_TYPE),
                  },
                });
              })()}

              {extras
                .filter((g) => g.items.length > 0 || (g.title === AUTH_GROUP && authTemplate))
                .map((g) =>
                  groupRow({
                    id: g.title === AUTH_GROUP ? 'auth' : 'other',
                    name: g.title,
                    items: g.items,
                    action:
                      g.title === AUTH_GROUP && authTemplate
                        ? {
                            label: 'Request authorization',
                            title: authTemplate.label,
                            onClick: () => setFilling(authTemplate),
                            style: 'green',
                          }
                        : undefined,
                  }),
                )}

              {earlier.length > 0 && groupRow({ id: 'earlier', name: 'Earlier rounds', items: earlier })}
            </div>

            {forms.length === 0 && manualTicks.size === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing has been filed for this client yet.
              </p>
            )}
          </>
        )}
      </CardContent>

      {uploadFor && profileId && (
        <UploadFormDialog
          open
          onClose={() => setUploadFor(null)}
          profileId={profileId}
          signerName={signerName}
          initialFormType={uploadFor}
          initialClientId={clientId}
          onSubmitted={() => {
            setUploadFor(null);
            load();
          }}
        />
      )}

      {filling && profileId && (
        <TemplateFillDialog
          template={filling}
          profileId={profileId}
          signerName={signerName}
          lockedClientId={clientId}
          lockedClientName={`${clientLastName}, ${clientFirstName}`}
          onClose={() => setFilling(null)}
          onSubmitted={() => {
            setFilling(null);
            load();
            onChanged?.();
          }}
        />
      )}

      {continuing && profileId && (
        <TemplateFillDialog
          existing={continuing}
          profileId={profileId}
          signerName={signerName}
          onClose={() => setContinuing(null)}
          onSubmitted={() => {
            setContinuing(null);
            load();
            onChanged?.();
          }}
        />
      )}

      {uhc && profileId && (
        <UhcMoveInDialog
          profileId={profileId}
          lockedClientId={clientId}
          lockedClientName={`${clientLastName}, ${clientFirstName}`}
          existing={uhc === 'new' ? null : uhc}
          onClose={() => setUhc(null)}
          onSaved={() => {
            load();
            onChanged?.();
          }}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this document?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.title || confirmDelete?.form_type} will be deleted from this client,
              along with the stored file. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {preview && (
        <React.Suspense fallback={null}>
          <PDFPreviewDialog
            file={preview}
            onClose={() => setPreview(null)}
            onDownload={() => {
              const match = forms.find((f) => f.id === preview.id);
              if (match) download(match);
            }}
          />
        </React.Suspense>
      )}
    </Card>
  );
};
