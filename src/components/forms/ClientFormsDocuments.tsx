import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Eye, FileText } from 'lucide-react';
import {
  EXTERNAL_STATUS_CLASS,
  EXTERNAL_STATUS_LABEL,
  FORM_SOURCE_LABEL,
  FORM_STATUS_CLASS,
  FORM_STATUS_SHORT_LABEL,
} from '@/lib/formSigning';
import { formDownloadName } from '@/lib/formAutofill';
import { FormDetailDialog } from '@/components/forms/FormDetailDialog';
import type { FormRow } from '@/components/forms/FormsHub';

const PDFPreviewDialog = React.lazy(() => import('@/components/PDFPreviewDialog'));

interface Props {
  clientId: string;
  clientFirstName: string;
  clientLastName: string;
}

/** Display groups, in lifecycle order. */
const GROUPS: { title: string; match: (f: FormRow) => boolean }[] = [
  { title: 'Intake / IAT', match: (f) => f.form_type === 'Initial Assessment Tool' },
  { title: 'Level of Need', match: (f) => f.form_type === 'Level of Need Assessment Tool' },
  { title: 'Housing Stabilization Plan', match: (f) => f.form_type === 'Housing Stabilization Plan' },
  {
    title: 'MCO referrals / authorizations',
    // Imported authorization paperwork arrives as "Other" with no workflow
    // purpose, so the filename/title is the only signal available.
    match: (f) =>
      f.form_type === 'Other' &&
      (f.workflow_purpose === 'initial_authorization' ||
        /authorization|referral|auth\b/i.test(`${f.title} ${f.source_filename ?? ''}`)),
  },
  { title: 'Other documents', match: () => true },
];

/**
 * The client's complete Forms & Documents history, grouped by category. Every
 * document ever filed for the client lives here — created in-app, uploaded, or
 * bulk-imported — with status, source, download, preview, and history.
 */
export const ClientFormsDocuments: React.FC<Props> = ({
  clientId,
  clientFirstName,
  clientLastName,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const profileId = useEffectiveProfileId();
  const [forms, setForms] = useState<FormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<FormRow | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    file_name: string;
    file_path: string;
    file_type?: string;
  } | null>(null);
  const [approverName, setApproverName] = useState('');

  const reviewMode = isAdmin && !isViewingAs;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_forms')
        .select(
          `*, clients:client_id (first_name, last_name), profiles:employee_id (first_name, last_name)`,
        )
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setForms((data as unknown as FormRow[]) ?? []);
    } catch (err: any) {
      toast({
        title: 'Could not load forms & documents',
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

  useEffect(() => {
    if (!profileId) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', profileId)
        .maybeSingle();
      setApproverName(
        `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim() || data?.email || 'Reviewer',
      );
    })();
  }, [profileId]);

  const download = async (form: FormRow) => {
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

  // Each form lands in its first matching group only.
  const grouped = GROUPS.map(({ title }) => ({ title, items: [] as FormRow[] }));
  for (const form of forms) {
    const idx = GROUPS.findIndex((g) => g.match(form));
    grouped[idx === -1 ? grouped.length - 1 : idx].items.push(form);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Forms &amp; Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        ) : forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No forms or documents have been filed for this client yet.
          </p>
        ) : (
          grouped
            .filter((g) => g.items.length > 0)
            .map((group) => (
              <div key={group.title} className="space-y-1.5">
                <div className="text-xs font-semibold uppercase text-muted-foreground">
                  {group.title}
                </div>
                <div className="divide-y rounded-md border">
                  {group.items.map((form) => (
                    <div
                      key={form.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm truncate">
                            {form.title || form.form_type}
                            {form.source === 'bulk_import' && (
                              <span className="text-xs text-muted-foreground">
                                {' '}
                                — Historical import
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(form.created_at).toLocaleDateString()}
                            {' · '}
                            {FORM_SOURCE_LABEL[form.source ?? 'created_in_app'] ??
                              'Created in app'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {form.source !== 'bulk_import' && (
                          <Badge
                            variant="secondary"
                            className={FORM_STATUS_CLASS[form.status] ?? ''}
                          >
                            {FORM_STATUS_SHORT_LABEL[form.status] ?? form.status}
                          </Badge>
                        )}
                        <Badge
                          variant="secondary"
                          className={EXTERNAL_STATUS_CLASS[form.external_status ?? 'not_sent'] ?? ''}
                        >
                          {EXTERNAL_STATUS_LABEL[form.external_status ?? 'not_sent']}
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => setDetail(form)}>
                          Details
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!form.file_path}
                          onClick={() =>
                            form.file_path &&
                            setPreview({
                              id: form.id,
                              file_name: `${form.form_type}.pdf`,
                              file_path: form.file_path,
                              file_type: 'application/pdf',
                            })
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!form.file_path}
                          onClick={() => download(form)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </CardContent>

      {detail && (
        <FormDetailDialog
          form={detail}
          isAdmin={reviewMode}
          approverName={approverName}
          onClose={() => setDetail(null)}
          onChanged={load}
          onDownload={download}
          onPreview={(f) =>
            f.file_path &&
            setPreview({
              id: f.id,
              file_name: `${f.form_type}.pdf`,
              file_path: f.file_path,
              file_type: 'application/pdf',
            })
          }
        />
      )}

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
