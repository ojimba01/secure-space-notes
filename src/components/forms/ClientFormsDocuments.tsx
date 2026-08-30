import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
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
import { Check, ChevronDown, ChevronRight, Download, FileText, Upload, X } from 'lucide-react';
import { EXTERNAL_STATUS_LABEL, FORM_SOURCE_LABEL, goesToMco } from '@/lib/formSigning';
import { formDownloadName } from '@/lib/formAutofill';
import { recordFormVersion } from '@/lib/formVersions';
import { CHECKLIST_TYPES, loadManualTicks } from '@/lib/formChecklist';
import { FORM_LIST_COLUMNS, type FormRow } from '@/components/forms/FormsHub';
import { UploadFormDialog } from '@/components/forms/UploadFormDialog';

const PDFPreviewDialog = React.lazy(() => import('@/components/PDFPreviewDialog'));

/** Read off the documents themselves, shown above the list rather than behind a click. */
const FIELD_COLUMNS =
  'field_member_name, field_member_id, field_medicaid_id, field_member_dob, ' +
  'field_icd10_code, field_authorization_number, field_service_start, field_service_end, ' +
  'fields_extracted_at';

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
>>;

interface Props {
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
}

/** Collections below the checklist: documents that arrive, rather than forms owed. */
const EXTRA_GROUPS: { title: string; match: (f: DocumentRow) => boolean }[] = [
  {
    title: 'MCO referrals and authorizations',
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
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const profileId = useEffectiveProfileId();
  const [forms, setForms] = useState<DocumentRow[]>([]);
  const [manualTicks, setManualTicks] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<DocumentRow | null>(null);
  /** The form type a document is being uploaded for, from a checklist row. */
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    file_name: string;
    file_path: string;
    file_type?: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [formsResult, ticks] = await Promise.all([
        supabase
          .from('client_forms')
          .select(`${FORM_LIST_COLUMNS}, ${FIELD_COLUMNS}`)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        loadManualTicks(clientId).catch(() => new Set<string>()),
      ]);
      if (formsResult.error) throw formsResult.error;
      setForms((formsResult.data as unknown as DocumentRow[]) ?? []);
      setManualTicks(ticks);
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
  }, [load]);

  const download = async (form: DocumentRow) => {
    if (!form.file_path) return;
    try {
      const { data, error } = await supabase.storage.from('client-files').download(form.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = formDownloadName(clientFirstName, clientLastName, form.form_type, form.created_at);
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

  const byType = useMemo(() => {
    const map = new Map<string, DocumentRow[]>();
    for (const f of forms) {
      const list = map.get(f.form_type) ?? [];
      list.push(f);
      map.set(f.form_type, list);
    }
    return map;
  }, [forms]);

  /** Everything the checklist does not claim, in its own collections. */
  const extras = useMemo(() => {
    const claimed = new Set<string>(CHECKLIST_TYPES);
    const rest = forms.filter((f) => !claimed.has(f.form_type));
    return EXTRA_GROUPS.map(({ title }) => ({ title, items: [] as DocumentRow[] })).map(
      (group, i, all) => {
        for (const f of rest) {
          const idx = EXTRA_GROUPS.findIndex((g) => g.match(f));
          if ((idx === -1 ? all.length - 1 : idx) === i) group.items.push(f);
        }
        return group;
      },
    );
  }, [forms]);

  /** What the documents said about this client, once anything has been read. */
  const readFacts = useMemo(() => {
    const first = (key: keyof DocumentRow) =>
      forms.find((f) => f[key])?.[key] as string | undefined;
    return [
      { label: 'Name on the documents', value: first('field_member_name') },
      { label: 'Member ID', value: first('field_member_id') },
      { label: 'Medicaid ID', value: first('field_medicaid_id') },
      { label: 'Date of birth', value: first('field_member_dob') },
      { label: 'Diagnosis', value: first('field_icd10_code') },
      { label: 'Authorization number', value: first('field_authorization_number') },
    ].filter((f) => f.value);
  }, [forms]);

  const toggleOpen = (title: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const documentRow = (form: DocumentRow) => (
    <div key={form.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
      <button
        type="button"
        disabled={!form.file_path}
        onClick={() =>
          form.file_path &&
          setPreview({
            id: form.id,
            file_name: form.title || `${form.form_type}.pdf`,
            file_path: form.file_path,
            file_type: 'application/pdf',
          })
        }
        title={form.file_path ? 'Open this document' : 'No file is stored for this document'}
        className="flex items-center gap-2 min-w-0 text-left disabled:cursor-default"
      >
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <div className={`text-sm truncate ${form.file_path ? 'hover:underline' : ''}`}>
            {form.title || form.form_type}
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date(form.created_at).toLocaleDateString()}
            {' · '}
            {FORM_SOURCE_LABEL[form.source ?? 'created_in_app'] ?? 'Created in app'}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1.5">
        {goesToMco(form.form_type) && <McoStep form={form} onSet={setMcoStatus} />}

        <Button
          variant="ghost"
          size="sm"
          disabled={!form.file_path}
          onClick={() => download(form)}
          title="Download"
        >
          <Download className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmDelete(form)}
          title="Remove this document"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const collapsibleGroup = (
    title: string,
    items: DocumentRow[],
    lead: React.ReactNode,
    /** Set on a checklist row with nothing filed: offer a way to fix that. */
    uploadFor?: string,
  ) => {
    const isOpen = open.has(title);
    return (
      <div key={title} className="rounded-md border">
        <div className="flex items-center gap-2 p-2.5">
          {lead}
          <button
            type="button"
            onClick={() => items.length && toggleOpen(title)}
            className="flex flex-1 items-center justify-between gap-2 min-w-0 text-left"
          >
            <span className="text-sm font-medium truncate">{title}</span>
            <span className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
              {items.length === 0
                ? 'None filed'
                : `${items.length} document${items.length === 1 ? '' : 's'}`}
              {items.length > 0 &&
                (isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                ))}
            </span>
          </button>
          {uploadFor && (
            <Button
              variant="ghost"
              size="sm"
              title={`Upload a ${uploadFor}`}
              onClick={() => setUploadFor(uploadFor)}
            >
              <Upload className="h-4 w-4" />
            </Button>
          )}
        </div>
        {isOpen && items.length > 0 && <div className="divide-y border-t">{items.map(documentRow)}</div>}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Forms and Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : (
          <>
            {readFacts.length > 0 && (
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                  What the documents say
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
                  {readFacts.map((f) => (
                    <div key={f.label} className="text-sm">
                      <span className="text-muted-foreground">{f.label}: </span>
                      {f.value}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {CHECKLIST_TYPES.map((type) => {
                const items = byType.get(type) ?? [];
                const hasDocument = items.length > 0;
                const ticked = hasDocument || manualTicks.has(type);
                return collapsibleGroup(
                  type,
                  items,
                  // Not a control. It says whether the client has this form,
                  // and the way to change it is to add or remove a document.
                  ticked ? (
                    <Check className="h-5 w-5 text-green-600" aria-label="Filed" />
                  ) : (
                    <X className="h-5 w-5 text-destructive" aria-label="Not filed" />
                  ),
                  hasDocument ? undefined : type,
                );
              })}
            </div>

            <div className="space-y-2">
              {extras
                .filter((g) => g.items.length > 0)
                .map((g) => collapsibleGroup(g.title, g.items, <span className="w-4" />))}
            </div>

            {forms.length === 0 && manualTicks.size === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing has been filed for this client yet. Tick a form above to record one that
                was completed elsewhere.
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
          signerName={`${clientFirstName} ${clientLastName}`.trim()}
          initialFormType={uploadFor}
          initialClientId={clientId}
          onSubmitted={() => {
            setUploadFor(null);
            load();
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
