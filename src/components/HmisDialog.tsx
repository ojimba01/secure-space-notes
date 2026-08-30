import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy } from 'lucide-react';
import {
  HMIS_FIELDS,
  hmisValue,
  type HmisClient,
  type HmisField,
  type HmisIntake,
} from '@/lib/hmis';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  client: HmisClient;
  caseManager: string | null;
}

/**
 * The HMIS intake screen, ready to copy across.
 *
 * The same shape as the Availity screens, for the same reason: the order and
 * the labels match the site being filled in, so nobody has to hunt for the box
 * they are on. Blue is carried from the client record. Everything else is
 * answered in HMIS, most of it from the client intake form on paper.
 */
export const HmisDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  clientId,
  client,
  caseManager,
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [intake, setIntake] = useState<HmisIntake | null>(null);

  // The intake answers HMIS asks for again. Loaded when the dialog opens, so a
  // client without one costs nothing.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('client_intakes')
        .select(
          'ssn, gender, birth_city, birth_state, us_citizen, veteran, pregnant, domestic_violence_victim, hiv_aids, substance_use, developmental_disability, mental_health_condition, income_type, in_school, homelessness_cause',
        )
        .eq('client_id', clientId)
        .maybeSingle();
      if (!cancelled) setIntake((data as HmisIntake) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId]);

  const pages = useMemo(() => {
    const byPage = new Map<number, HmisField[]>();
    for (const f of HMIS_FIELDS) {
      const list = byPage.get(f.page) ?? [];
      list.push(f);
      byPage.set(f.page, list);
    }
    return [...byPage.entries()].sort((a, b) => a[0] - b[0]);
  }, []);

  const copy = async (field: HmisField, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field.name);
      window.setTimeout(() => setCopied((c) => (c === field.name ? null : c)), 1500);
    } catch {
      toast.error('Could not reach the clipboard', {
        description: 'Select the text in the box and copy it by hand.',
      });
    }
  };

  const filled = HMIS_FIELDS.filter((f) => hmisValue(f, client, caseManager, intake)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>HMIS intake</DialogTitle>
          <DialogDescription>
            The boxes in the order HMIS asks for them. {filled} of {HMIS_FIELDS.length} are answered from the client record. The rest are typed in HMIS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {pages.map(([page, fields]) => (
            <section key={page} className="space-y-3">
              <h3 className="text-sm font-semibold">Page {page}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const value = hmisValue(f, client, caseManager, intake);
                  return (
                    <div key={f.name} className="space-y-1">
                      <Label className="text-sm font-normal text-muted-foreground">{f.label}</Label>
                      <div className="flex gap-2">
                        {/* Blank when the app has no answer, rather than a
                            sentence in the box. Somebody reading down the
                            column wants to see what is here, not be told
                            repeatedly that nothing is. */}
                        <div
                          className={`flex min-h-9 flex-1 items-center rounded-md border px-3 py-2 text-sm ${
                            value ? 'border-orange-400 bg-orange-50 text-orange-900' : 'bg-background'
                          }`}
                        >
                          {value}
                        </div>
                        {/* Every box, whether or not the app filled it. A
                            missing copy button on half the rows is harder to
                            use than one that copies nothing. */}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label={`Copy ${f.label}`}
                          disabled={!value}
                          onClick={() => copy(f, value)}
                        >
                          <Copy className={`h-4 w-4 ${copied === f.name ? 'text-green-600' : ''}`} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
