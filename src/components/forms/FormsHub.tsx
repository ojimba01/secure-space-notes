import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Plus,
  Search,
} from 'lucide-react';
import {
  EXTERNAL_STATUS_CLASS,
  EXTERNAL_STATUS_LABEL,
  FORM_STATUS_CLASS,
  FORM_STATUS_LABEL,
  FORM_STATUS_SHORT_LABEL,
  FORM_TYPES,
} from '@/lib/formSigning';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UploadFormDialog } from '@/components/forms/UploadFormDialog';
import { FormDetailDialog } from '@/components/forms/FormDetailDialog';
import {
  PDF_TEMPLATES,
  TemplateFillDialog,
  type PdfTemplate,
} from '@/components/forms/TemplateFillDialog';
import { formDownloadName } from '@/lib/formAutofill';
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
import { X } from 'lucide-react';

const PDFPreviewDialog = React.lazy(() => import('@/components/PDFPreviewDialog'));

export interface FormRow {
  id: string;
  client_id: string;
  employee_id: string;
  form_type: string;
  title: string;
  file_path: string | null;
  original_file_path: string | null;
  /** Internal review status only — never an MCO decision. */
  status: string;
  external_status?: string | null;
  sent_to_mco_at?: string | null;
  mco_response_at?: string | null;
  due_date?: string | null;
  workflow_purpose?: string | null;
  source?: string | null;
  source_filename?: string | null;
  template_version?: string | null;
  authorization_id?: string | null;
  signature_name: string | null;
  signed_at: string | null;
  approved_at: string | null;
  review_note: string | null;
  created_at: string;
  /** How far the background reader has got with this document. */
  processing_status?: string | null;
  processing_error?: string | null;
  text_char_count?: number | null;
  page_count?: number | null;
  ocr_applied?: boolean | null;
  text_truncated?: boolean | null;
  clients?: { first_name: string; last_name: string } | null;
  profiles?: { first_name: string | null; last_name: string | null } | null;
}

/**
 * Every column a document list needs, and deliberately not `*`.
 *
 * `extracted_text` can run to hundreds of thousands of characters per row, so
 * selecting it for a list of two thousand documents would move tens of
 * megabytes to draw a table that never shows a word of it. Searching the text
 * happens in Postgres, against the index — see the full-text lookup below.
 */
export const FORM_LIST_COLUMNS =
  'id, client_id, employee_id, form_type, title, file_path, original_file_path, status, ' +
  'external_status, sent_to_mco_at, mco_response_at, due_date, workflow_purpose, source, ' +
  'source_filename, template_version, authorization_id, signature_name, signed_at, ' +
  'approved_at, review_note, created_at, processing_status, processing_error, ' +
  'text_char_count, page_count, ocr_applied, text_truncated';

const PAGE_SIZE = 10;

const statusVariant = (status: string) => FORM_STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground';


interface FormsHubProps {
  /**
   * Which half of this screen to show.
   *
   * 'forms' is the blank templates and filling one in, which is what staff
   * come here for. 'archive' is the table of every form ever filed, which
   * answers an administrator's question, not a case manager's - the forms on a
   * client are on that client, where somebody looking for them would look.
   */
  view?: 'forms' | 'archive';
}

export const FormsHub: React.FC<FormsHubProps> = ({ view = 'forms' }) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [intakeQuery, setIntakeQuery] = useState('');
  const { isViewingAs } = useViewAs();
  const profileId = useEffectiveProfileId();

  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [fillingTemplate, setFillingTemplate] = useState<PdfTemplate | null>(null);
  const [editingForm, setEditingForm] = useState<FormRow | null>(null);
  const [detail, setDetail] = useState<FormRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FormRow | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    file_name: string;
    file_path: string;
    file_type?: string;
  } | null>(null);
  const [signerName, setSignerName] = useState('');
  /** Ids of documents whose text matches the search, from Postgres. */
  const [textHits, setTextHits] = useState<Set<string> | null>(null);
  const [searchingText, setSearchingText] = useState(false);

  // Admins reviewing the queue see everything; employees (and view-as sessions)
  // only ever see their own submissions.
  const reviewMode = isAdmin && !isViewingAs;

  /**
   * Remove a form and the file behind it.
   *
   * A form filled in here can be wrong - the wrong client, the wrong template,
   * a second copy - and until now the only way out was to leave it there. The
   * database decides who may: staff can remove their own drafts, an
   * administrator can remove anything.
   */
  const removeForm = async (form: FormRow) => {
    try {
      if (form.file_path) {
        await supabase.storage.from('client-files').remove([form.file_path]);
      }
      const { error } = await supabase.from('client_forms').delete().eq('id', form.id);
      if (error) throw error;
      toast({ title: 'Form removed' });
      setConfirmDelete(null);
      fetchForms();
    } catch (err: any) {
      toast({ title: 'Could not remove it', description: err.message, variant: 'destructive' });
    }
  };

  const fetchForms = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('client_forms')
        .select(
          `${FORM_LIST_COLUMNS}, clients:client_id (first_name, last_name), profiles:employee_id (first_name, last_name)`,
        )
        .order('created_at', { ascending: false });

      if (!reviewMode) {
        if (!profileId) {
          setForms([]);
          return;
        }
        query = query.eq('employee_id', profileId);
      }

      const { data, error } = await query;
      if (error) throw error;
      setForms((data as unknown as FormRow[]) ?? []);
    } catch (err: any) {
      toast({ title: 'Could not load forms', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!reviewMode && !profileId) return;
    fetchForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, reviewMode]);

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

  /**
   * Search inside the documents themselves, in Postgres against the GIN index.
   *
   * The list already filters on titles and names as you type, with no round
   * trip. This adds the documents whose *contents* match, which the browser
   * cannot do because the text is deliberately not loaded. Two characters is
   * too short to be worth a query, and the wait keeps it to one query per
   * pause rather than one per keystroke.
   */
  useEffect(() => {
    const term = search.trim();
    if (term.length < 3) {
      setTextHits(null);
      setSearchingText(false);
      return;
    }
    let cancelled = false;
    setSearchingText(true);
    const timer = setTimeout(async () => {
      try {
        let q = supabase
          .from('client_forms')
          .select('id')
          // websearch accepts what a person actually types, quotes included,
          // and never throws on syntax the way the plain tsquery parser does.
          .textSearch('text_search', term, { type: 'websearch' })
          .limit(500);
        if (!reviewMode && profileId) q = q.eq('employee_id', profileId);
        const { data, error } = await q;
        if (cancelled) return;
        setTextHits(error ? null : new Set((data ?? []).map((r) => r.id)));
      } catch {
        if (!cancelled) setTextHits(null);
      } finally {
        if (!cancelled) setSearchingText(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, reviewMode, profileId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return forms.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (typeFilter !== 'all' && f.form_type !== typeFilter) return false;
      if (!term) return true;
      const haystack = [
        f.title,
        f.form_type,
        f.clients ? `${f.clients.first_name} ${f.clients.last_name}` : '',
        f.profiles ? `${f.profiles.first_name ?? ''} ${f.profiles.last_name ?? ''}` : '',
      ]
        .join(' ')
        .toLowerCase();
      // Either the row's own words match, or the document's contents do.
      return haystack.includes(term) || (textHits?.has(f.id) ?? false);
    });
  }, [forms, search, statusFilter, typeFilter, textHits]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, typeFilter]);

  const handleDownload = async (form: FormRow) => {
    if (!form.file_path) return;
    try {
      const { data, error } = await supabase.storage.from('client-files').download(form.file_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = formDownloadName(
        form.clients?.first_name,
        form.clients?.last_name,
        form.form_type,
        form.created_at,
      );
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    }
  };

  const openPreview = (form: FormRow) => {
    if (!form.file_path) return;
    setPreview({
      id: form.id,
      file_name: `${form.form_type}.pdf`,
      file_path: form.file_path,
      file_type: 'application/pdf',
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Forms</h1>
          <p className="text-sm text-muted-foreground">
            {reviewMode
              ? 'Review signed forms submitted by your team.'
              : 'Upload and track your completed forms.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => setUploadOpen(true)} disabled={!profileId}>
          <Plus className="h-4 w-4 mr-2" />
          Upload Form
        </Button>
      </div>


      {/*
        Secondary route only. Ordinary IAT/LoN/HSP work starts from the
        client's own lifecycle card, which already knows the client and
        pre-fills the template — this is the escape hatch for everything else.
      */}
      <div className="rounded-md border">
        <div className="px-4 py-3 text-sm font-medium">Start a blank form</div>
        <div className="border-t p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Opens an empty official template. For a client's required assessments, open the
            client and use their case lifecycle card instead — the form arrives already linked
            to them, with their details filled in.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PDF_TEMPLATES.map((t) => (
              <Card key={t.file} className="p-4 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-sm font-medium leading-tight">{t.label}</div>
                    <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  </div>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setFillingTemplate(t)}
                    disabled={!profileId}
                  >
                    Fill out &amp; submit
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={t.file} download aria-label={`Download blank ${t.label}`}>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {view === 'archive' && (
        <>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, form, staff, or words inside a document"
            className="pl-9"
          />
          {searchingText && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              Searching documents
            </span>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(FORM_STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All form types</SelectItem>
            {FORM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Client</th>
              <th className="px-3 py-2 font-medium">Form Type</th>
              {reviewMode && <th className="px-3 py-2 font-medium">Employee</th>}
              <th className="px-3 py-2 font-medium">Submitted</th>
              <th className="px-3 py-2 font-medium">Internal review</th>
              <th className="px-3 py-2 font-medium">MCO status</th>

              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Loading forms...
                </td>
              </tr>
            ) : current.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  No forms yet.
                </td>
              </tr>
            ) : (
              current.map((form) => (
                <tr key={form.id} className="border-t">
                  <td className="px-3 py-2">
                    {form.clients
                      ? `${form.clients.last_name}, ${form.clients.first_name}`
                      : 'Unknown'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{form.form_type}</span>
                    </div>
                  </td>
                  {reviewMode && (
                    <td className="px-3 py-2">
                      {form.profiles
                        ? `${form.profiles.first_name ?? ''} ${form.profiles.last_name ?? ''}`.trim()
                        : '—'}
                    </td>
                  )}
                  <td className="px-3 py-2">{new Date(form.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className={statusVariant(form.status)}>
                      {FORM_STATUS_SHORT_LABEL[form.status] ?? form.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="secondary"
                      className={EXTERNAL_STATUS_CLASS[form.external_status ?? 'not_sent'] ?? ''}
                    >
                      {EXTERNAL_STATUS_LABEL[form.external_status ?? 'not_sent']}
                    </Badge>
                  </td>

                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDetail(form)}>
                        {reviewMode && form.status !== 'approved' ? 'Review' : 'Details'}
                      </Button>
                      {!reviewMode && form.status === 'changes_requested' && (
                        <Button size="sm" onClick={() => setEditingForm(form)}>
                          Edit & resubmit
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleDownload(form)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {(isAdmin || form.status === 'draft' || form.status === 'changes_requested') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Remove this form"
                          onClick={() => setConfirmDelete(form)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
        </>
      )}

      {fillingTemplate && profileId && (
        <TemplateFillDialog
          template={fillingTemplate}
          profileId={profileId}
          signerName={signerName}
          onClose={() => setFillingTemplate(null)}
          onSubmitted={fetchForms}
        />
      )}

      {editingForm && profileId && (
        <TemplateFillDialog
          existing={editingForm}
          profileId={profileId}
          signerName={signerName}
          onClose={() => setEditingForm(null)}
          onSubmitted={fetchForms}
        />
      )}

      {uploadOpen && profileId && (
        <UploadFormDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          profileId={profileId}
          signerName={signerName}
          onSubmitted={fetchForms}
        />
      )}

      {detail && (
        <FormDetailDialog
          form={detail}
          isAdmin={reviewMode}
          approverName={signerName}
          onClose={() => setDetail(null)}
          onChanged={fetchForms}
          onDownload={handleDownload}
          onPreview={openPreview}
          onEdit={setEditingForm}
        />
      )}

      {preview && (
        <React.Suspense fallback={null}>
          <PDFPreviewDialog
            file={preview}
            onClose={() => setPreview(null)}
            onDownload={() => {
              const match = forms.find((f) => f.id === preview.id);
              if (match) handleDownload(match);
            }}
          />
        </React.Suspense>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this form?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.form_type} for{' '}
              {`${confirmDelete?.clients?.first_name ?? ''} ${confirmDelete?.clients?.last_name ?? ''}`.trim() ||
                'this client'}{' '}
              will be deleted, along with the stored file. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && removeForm(confirmDelete)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FormsHub;
