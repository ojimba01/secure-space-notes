// Forms staff have completed that an admin has not reviewed yet, newest first,
// on the Admin dashboard. Open takes the admin straight into the form to read
// and correct it; saving it there, or selecting Reviewed, takes it off the
// list. A form completed again after its review comes back.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TemplateFillDialog } from '@/components/forms/TemplateFillDialog';
import { UhcMoveInDialog, type UhcExistingForm } from '@/components/forms/UhcMoveInDialog';
import type { FormRow } from '@/components/forms/FormsHub';

const INTAKE = 'Client Intake';
const DAYS = 30;
const PAGE = 6;

type Filter = 'intakes' | 'all';

interface Submitted {
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
  form_data: unknown;
  clients: { first_name: string; last_name: string } | null;
}

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reviews = () => (supabase.from as any)('form_reviews');

export const FormsToReview: React.FC<{ onOpenClient: (clientId: string) => void }> = ({ onOpenClient }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [rows, setRows] = useState<Submitted[] | null>(null);
  const [staff, setStaff] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('intakes');
  const [page, setPage] = useState(0);
  const [opening, setOpening] = useState<Submitted | null>(null);
  const [signerName, setSignerName] = useState('Admin');

  const load = useCallback(async () => {
    const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('client_forms')
      .select(
        'id, client_id, employee_id, form_type, title, file_path, original_file_path, status, signature_name, signed_at, approved_at, review_note, created_at, form_data, source, clients(first_name, last_name)',
      )
      .in('status', ['submitted', 'approved'])
      .in('source', ['created_in_app', 'manual_upload'])
      .gte('signed_at', since)
      .order('signed_at', { ascending: false });
    if (error) {
      toast({ title: 'Could not load forms to review', description: error.message, variant: 'destructive' });
      setRows([]);
      return;
    }
    const forms = (data ?? []) as unknown as Submitted[];
    const ids = forms.map((f) => f.id);
    const reviewed = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data: r } = await reviews().select('client_form_id, reviewed_at').in('client_form_id', ids.slice(i, i + 200));
      for (const x of (r ?? []) as { client_form_id: string; reviewed_at: string }[]) reviewed.set(x.client_form_id, x.reviewed_at);
    }
    // Reviewed, unless it was completed again since.
    setRows(forms.filter((f) => {
      const at = reviewed.get(f.id);
      return !at || (!!f.signed_at && f.signed_at > at);
    }));

    const people = [...new Set(forms.map((f) => f.employee_id))];
    if (people.length) {
      const { data: p } = await supabase.from('profiles').select('id, first_name, last_name').in('id', people);
      setStaff(Object.fromEntries((p ?? []).map((x) => [x.id, `${x.first_name ?? ''} ${x.last_name ?? ''}`.trim()])));
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profileId) return;
    void supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', profileId)
      .maybeSingle()
      .then(({ data }) => {
        const name = `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim();
        if (name) setSignerName(name);
      });
  }, [profileId]);

  const shown = useMemo(
    () => (rows ?? []).filter((f) => filter === 'all' || f.form_type === INTAKE),
    [rows, filter],
  );
  const intakes = (rows ?? []).filter((f) => f.form_type === INTAKE).length;

  const markReviewed = async (ids: string[]) => {
    if (!ids.length) return;
    const { error } = await reviews().upsert(
      ids.map((id) => ({ client_form_id: id, reviewed_by: profileId, reviewed_at: new Date().toISOString() })),
      { onConflict: 'client_form_id' },
    );
    if (error) {
      toast({ title: 'Could not mark it reviewed', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((r) => (r ?? []).filter((f) => !ids.includes(f.id)));
  };

  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <Card>
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Forms to review</CardTitle>
          {shown.length > 1 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              onClick={() => void markReviewed(shown.map((f) => f.id))}
            >
              Mark all reviewed
            </Button>
          )}
        </div>
        <div className="flex w-fit rounded-lg border bg-muted/40 p-0.5 text-sm">
          {(
            [
              ['intakes', `Intakes (${intakes})`],
              ['all', `All forms (${rows?.length ?? 0})`],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setPage(0);
              }}
              className={`rounded-md px-3 py-1 ${filter === key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading.</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === 'intakes' ? 'No new intakes to review.' : 'No new forms to review.'}
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {pageRows.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-2.5 text-sm">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onOpenClient(f.client_id)}
                    className="block max-w-full truncate text-left font-medium hover:underline"
                  >
                    {f.clients ? `${f.clients.first_name} ${f.clients.last_name}` : 'Client'}
                  </button>
                  <p className="truncate text-xs text-muted-foreground">
                    {filter === 'all' ? `${f.form_type} · ` : ''}
                    {staff[f.employee_id] ?? 'Staff'}
                    {f.signed_at ? ` · ${formatDistanceToNow(new Date(f.signed_at), { addSuffix: true })}` : ''}
                  </p>
                </div>
                {(!!f.file_path || !!f.form_data) && (
                  <Button size="sm" onClick={() => setOpening(f)}>
                    Open
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  title="Mark reviewed"
                  onClick={() => void markReviewed([f.id])}
                >
                  <Check className="h-4 w-4" />
                  Reviewed
                </Button>
              </div>
            ))}
          </div>
        )}

        {shown.length > PAGE && (
          <div className="flex items-center gap-2 text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Back
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE >= shown.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <span className="text-muted-foreground">
              {page * PAGE + 1}–{Math.min((page + 1) * PAGE, shown.length)} of {shown.length}
            </span>
          </div>
        )}
      </CardContent>

      {opening && profileId && !opening.form_data && (
        <TemplateFillDialog
          existing={opening as unknown as FormRow}
          profileId={profileId}
          signerName={signerName}
          onClose={() => setOpening(null)}
          onSubmitted={() => {
            // Saved after reading it through: that is the review.
            void markReviewed([opening.id]).then(load);
          }}
        />
      )}
      {opening && profileId && !!opening.form_data && (
        <UhcMoveInDialog
          profileId={profileId}
          lockedClientId={opening.client_id}
          lockedClientName={opening.clients ? `${opening.clients.last_name}, ${opening.clients.first_name}` : undefined}
          existing={{
            id: opening.id,
            client_id: opening.client_id,
            status: opening.status,
            form_data: opening.form_data,
          } as UhcExistingForm}
          onClose={() => setOpening(null)}
          onSaved={() => void markReviewed([opening.id]).then(load)}
        />
      )}
    </Card>
  );
};
