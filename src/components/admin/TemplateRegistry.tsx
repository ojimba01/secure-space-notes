import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { FORM_TYPES, WORKFLOW_PURPOSE_LABEL, WORKFLOW_PURPOSES } from '@/lib/formSigning';

interface RegistryRow {
  id: string;
  mco: string | null;
  workflow_purpose: string;
  service_type: string | null;
  form_type: string;
  template_path: string | null;
  template_version: string | null;
  required: boolean;
  submission_instructions: string | null;
  active: boolean;
}

const ANY_MCO = '__any__';

/**
 * Which templates make up the packet for a given MCO and workflow step.
 * Statewide rows (no MCO) apply everywhere; MCO-specific supplemental forms
 * are added here as the agency confirms them, rather than being hard-coded.
 */
export const TemplateRegistry: React.FC = () => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    mco: '',
    workflow_purpose: 'continuation',
    service_type: '',
    form_type: 'Other' as string,
    template_version: '',
    submission_instructions: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('form_template_registry')
        .select('*')
        .order('mco', { nullsFirst: true })
        .order('workflow_purpose');
      if (error) throw error;
      setRows((data as RegistryRow[]) ?? []);
    } catch (err: any) {
      toast({
        title: 'Could not load the template registry',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from('form_template_registry').insert({
        mco: draft.mco.trim() || null,
        workflow_purpose: draft.workflow_purpose,
        service_type: draft.service_type.trim() || null,
        form_type: draft.form_type,
        template_version: draft.template_version.trim() || null,
        submission_instructions: draft.submission_instructions.trim() || null,
        created_by: profileId,
      });
      if (error) throw error;
      toast({ title: 'Template requirement added' });
      setAdding(false);
      setDraft({
        mco: '',
        workflow_purpose: 'continuation',
        service_type: '',
        form_type: 'Other',
        template_version: '',
        submission_instructions: '',
      });
      load();
    } catch (err: any) {
      toast({ title: 'Could not add the entry', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row: RegistryRow) => {
    try {
      const { error } = await supabase
        .from('form_template_registry')
        .update({ active: !row.active })
        .eq('id', row.id);
      if (error) throw error;
      load();
    } catch (err: any) {
      toast({ title: 'Could not update the entry', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">Template &amp; packet registry</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAdding((a) => !a)}>
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Statewide templates apply to every MCO. Add an MCO-specific row when a payer requires a
          supplemental form for a workflow step.
        </p>

        {adding && (
          <div className="rounded-md border p-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-mco">MCO (blank = all MCOs)</Label>
              <Input
                id="reg-mco"
                value={draft.mco}
                onChange={(e) => setDraft((d) => ({ ...d, mco: e.target.value }))}
                placeholder="e.g. Horizon"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Workflow step</Label>
              <Select
                value={draft.workflow_purpose}
                onValueChange={(v) => setDraft((d) => ({ ...d, workflow_purpose: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_PURPOSES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {WORKFLOW_PURPOSE_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Form type</Label>
              <Select
                value={draft.form_type}
                onValueChange={(v) => setDraft((d) => ({ ...d, form_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-service">Service type (optional)</Label>
              <Input
                id="reg-service"
                value={draft.service_type}
                onChange={(e) => setDraft((d) => ({ ...d, service_type: e.target.value }))}
                placeholder="Pre-Tenancy / Tenancy Sustaining"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-version">Template version (optional)</Label>
              <Input
                id="reg-version"
                value={draft.template_version}
                onChange={(e) => setDraft((d) => ({ ...d, template_version: e.target.value }))}
                placeholder="2026-02"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-instructions">Submission instructions (optional)</Label>
              <Input
                id="reg-instructions"
                value={draft.submission_instructions}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, submission_instructions: e.target.value }))
                }
                placeholder="Confirmed submission route only"
              />
            </div>
            <div className="sm:col-span-2 flex gap-2">
              <Button onClick={add} disabled={busy}>
                Save entry
              </Button>
              <Button variant="outline" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading registry...</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">MCO</th>
                  <th className="px-3 py-2 font-medium">Workflow step</th>
                  <th className="px-3 py-2 font-medium">Form</th>
                  <th className="px-3 py-2 font-medium">Version</th>
                  <th className="px-3 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-3 py-2">{row.mco ?? 'All MCOs (statewide)'}</td>
                    <td className="px-3 py-2">
                      {WORKFLOW_PURPOSE_LABEL[row.workflow_purpose] ?? row.workflow_purpose}
                      {row.service_type && (
                        <span className="text-muted-foreground"> · {row.service_type}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.form_type}</td>
                    <td className="px-3 py-2">{row.template_version ?? '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Badge variant="secondary">{row.active ? 'Active' : 'Inactive'}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(row)}>
                          {row.active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                      No template requirements configured.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
