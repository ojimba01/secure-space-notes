import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScanSearch } from 'lucide-react';
import {
  extractPdfFieldValues,
  interpretFormValues,
  type ExtractedFormValues,
} from '@/lib/formAutofill';
import type { FormRow } from '@/components/forms/FormsHub';

interface Props {
  form: FormRow;
  onApplied: () => void;
}

interface SyncField {
  key: string;
  label: string;
  /** Column on public.clients this value belongs to. */
  column: string;
  extracted: string | number;
  current: string | number | null;
}

/**
 * Reads the completed PDF's actual AcroForm values and offers to copy the
 * authoritative ones (LoN score/category, NJ HMIS ID) onto the client record.
 * Nothing is written without the reviewer ticking each value — differing
 * values are shown side by side, never silently overwritten.
 */
export const FormSyncPanel: React.FC<Props> = ({ form, onApplied }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<SyncField[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [noValues, setNoValues] = useState(false);

  const scan = async () => {
    if (!form.file_path) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from('client-files')
        .download(form.file_path);
      if (error) throw error;

      const raw = await extractPdfFieldValues(await data.arrayBuffer());
      const values: ExtractedFormValues = interpretFormValues(form.form_type, raw);

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, lon_score, level_of_need, njhmis_id')
        .eq('id', form.client_id)
        .single();
      if (clientError) throw clientError;

      const found: SyncField[] = [];
      if (values.lonScore !== undefined) {
        found.push({
          key: 'lon_score',
          label: 'LoN score',
          column: 'lon_score',
          extracted: values.lonScore,
          current: client.lon_score,
        });
      }
      if (values.lonCategory) {
        found.push({
          key: 'level_of_need',
          label: 'Level of need',
          column: 'level_of_need',
          extracted: values.lonCategory,
          current: client.level_of_need,
        });
      }
      if (values.njhmisId) {
        found.push({
          key: 'njhmis_id',
          label: 'NJ HMIS ID',
          column: 'njhmis_id',
          extracted: values.njhmisId,
          current: client.njhmis_id,
        });
      }

      // Values already matching the client need no action.
      const actionable = found.filter(
        (f) => String(f.extracted) !== String(f.current ?? ''),
      );
      setFields(actionable);
      setNoValues(actionable.length === 0);
      // Pre-tick only values the client record does not have at all; a
      // conflicting value stays unticked until the reviewer chooses it.
      setChecked(
        Object.fromEntries(
          actionable.map((f) => [f.key, f.current === null || f.current === '']),
        ),
      );
    } catch (err: any) {
      toast({
        title: 'Could not read the PDF values',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!fields) return;
    const selected = fields.filter((f) => checked[f.key]);
    if (!selected.length) return;
    setBusy(true);
    try {
      const payload = Object.fromEntries(selected.map((f) => [f.column, f.extracted]));
      const { error } = await supabase.from('clients').update(payload).eq('id', form.client_id);
      if (error) throw error;
      toast({
        title: 'Client record updated',
        description: selected.map((f) => `${f.label}: ${f.extracted}`).join(' · '),
      });
      setFields(null);
      onApplied();
    } catch (err: any) {
      toast({
        title: 'Could not update the client record',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // Only forms whose templates carry authoritative workflow values.
  if (
    form.form_type !== 'Level of Need Assessment Tool' &&
    form.form_type !== 'Housing Stabilization Plan'
  ) {
    return null;
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">
          Sync form values to client
        </div>
        <Button variant="outline" size="sm" onClick={scan} disabled={busy || !form.file_path}>
          <ScanSearch className="h-4 w-4 mr-1" />
          Read values from PDF
        </Button>
      </div>

      {noValues && (
        <p className="text-xs text-muted-foreground">
          No new values found — the PDF's fields are empty, flattened, or already match the
          client record.
        </p>
      )}

      {fields && fields.length > 0 && (
        <div className="space-y-2">
          {fields.map((f) => (
            <label key={f.key} className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={checked[f.key] ?? false}
                onCheckedChange={(v) => setChecked((c) => ({ ...c, [f.key]: v === true }))}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">{f.label}:</span> {String(f.extracted)}
                {f.current !== null && f.current !== '' && (
                  <span className="text-amber-700"> (currently {String(f.current)})</span>
                )}
              </span>
            </label>
          ))}
          <Button size="sm" onClick={apply} disabled={busy || !fields.some((f) => checked[f.key])}>
            Apply selected to client record
          </Button>
        </div>
      )}
    </div>
  );
};
