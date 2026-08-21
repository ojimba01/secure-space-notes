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
import { FORM_STATUS_LABEL, FORM_TYPES, type FormType } from '@/lib/formSigning';
import { UploadFormDialog } from '@/components/forms/UploadFormDialog';
import { FormDetailDialog } from '@/components/forms/FormDetailDialog';
import {
  PDF_TEMPLATES,
  TemplateViewerDialog,
  type PdfTemplate,
} from '@/components/forms/TemplateViewerDialog';

const PDFPreviewDialog = React.lazy(() => import('@/components/PDFPreviewDialog'));

export interface FormRow {
  id: string;
  client_id: string;
  employee_id: string;
  form_type: string;
  title: string;
  file_path: string | null;
  original_file_path: string | null;
  status: string;
  signature_name: string | null;
  signed_at: string | null;
  approved_at: string | null;
  review_note: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string } | null;
  profiles?: { first_name: string | null; last_name: string | null } | null;
}

const PAGE_SIZE = 10;

const statusVariant = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800';
    case 'changes_requested':
      return 'bg-red-100 text-red-800';
    case 'submitted':
      return 'bg-amber-100 text-amber-900';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export const FormsHub: React.FC = () => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const profileId = useEffectiveProfileId();

  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFormType, setUploadFormType] = useState<string | undefined>(undefined);
  const [viewingTemplate, setViewingTemplate] = useState<PdfTemplate | null>(null);
  const [detail, setDetail] = useState<FormRow | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    file_name: string;
    file_path: string;
    file_type?: string;
  } | null>(null);
  const [signerName, setSignerName] = useState('');

  // Admins reviewing the queue see everything; employees (and view-as sessions)
  // only ever see their own submissions.
  const reviewMode = isAdmin && !isViewingAs;

  const fetchForms = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('client_forms')
        .select(
          `*, clients:client_id (first_name, last_name), profiles:employee_id (first_name, last_name)`,
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
      return haystack.includes(term);
    });
  }, [forms, search, statusFilter, typeFilter]);

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
      a.download = `${form.form_type.replace(/[^\w\- ]+/g, '')}.pdf`;
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
        <Button
          onClick={() => {
            setUploadFormType(undefined);
            setUploadOpen(true);
          }}
          disabled={!profileId}
        >
          <Plus className="h-4 w-4 mr-2" />
          Upload Form
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PDF_TEMPLATES.map((t) => (
          <Card key={t.formType} className="p-4 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm font-medium leading-tight">{t.formType}</div>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setViewingTemplate(t)}
              >
                Fill in browser
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <a href={t.file} download aria-label={`Download blank ${t.formType}`}>
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, form or staff"
            className="pl-9"
          />
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
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Loading forms...
                </td>
              </tr>
            ) : current.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
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
                      {FORM_STATUS_LABEL[form.status] ?? form.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setDetail(form)}>
                        {reviewMode && form.status !== 'approved' ? 'Review' : 'Details'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload(form)}>
                        <Download className="h-4 w-4" />
                      </Button>
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

      {viewingTemplate && (
        <TemplateViewerDialog
          template={viewingTemplate}
          onClose={() => setViewingTemplate(null)}
          onUpload={(formType: FormType) => {
            setViewingTemplate(null);
            setUploadFormType(formType);
            setUploadOpen(true);
          }}
        />
      )}

      {uploadOpen && profileId && (
        <UploadFormDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          profileId={profileId}
          signerName={signerName}
          onSubmitted={fetchForms}
          initialFormType={uploadFormType}
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
    </div>
  );
};

export default FormsHub;
