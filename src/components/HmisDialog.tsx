import React, { useMemo, useState } from 'react';
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
import { HMIS_FIELDS, hmisValue, type HmisClient, type HmisField } from '@/lib/hmis';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
export const HmisDialog: React.FC<Props> = ({ open, onOpenChange, client, caseManager }) => {
  const [copied, setCopied] = useState<string | null>(null);

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

  const filled = HMIS_FIELDS.filter((f) => hmisValue(f, client, caseManager)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>HMIS intake</DialogTitle>
          <DialogDescription>
            The boxes in the order HMIS asks for them. {filled} of {HMIS_FIELDS.length} are
            answered from the client record; the rest are answered in HMIS, from the client
            intake form.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 rounded-sm border border-blue-400 bg-blue-50" />
          Carried from the client record. Check it, do not retype it.
        </div>

        <div className="space-y-6">
          {pages.map(([page, fields]) => (
            <section key={page} className="space-y-3">
              <h3 className="text-sm font-semibold">Page {page}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {fields.map((f) => {
                  const value = hmisValue(f, client, caseManager);
                  return (
                    <div key={f.name} className="space-y-1">
                      <Label className="text-sm font-normal text-muted-foreground">{f.label}</Label>
                      <div className="flex gap-2">
                        <div
                          className={`flex min-h-9 flex-1 items-center rounded-md border px-3 py-2 text-sm ${
                            value ? 'border-blue-400 bg-blue-50 text-blue-900' : 'bg-background'
                          }`}
                        >
                          {value || (
                            <span className="text-muted-foreground">Answer this in HMIS</span>
                          )}
                        </div>
                        {value && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Copy ${f.label}`}
                            onClick={() => copy(f, value)}
                          >
                            <Copy className={`h-4 w-4 ${copied === f.name ? 'text-green-600' : ''}`} />
                          </Button>
                        )}
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
