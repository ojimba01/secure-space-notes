// Step 1 of billing: the agency's own Availity identity.
//
// This is filled in once and then almost never touched, but nothing else in
// billing works without it -- every claim repeats these boxes -- so it is the
// first step rather than a settings screen someone has to know to look for.
//
// The values are deliberately not in the code. This repository is public, and
// the NPI, EIN and billing address are the agency's billing identity, with a
// residential address among them. They live in compliance_settings.

import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { MCO_OPTIONS } from '@/lib/billing';
import {
  EMPTY_SETTINGS,
  REQUIRED_PROVIDER_FIELDS,
  loadAvailitySettings,
  saveAvailitySettings,
  type AvailityProviderSettings,
} from '@/lib/availity';

/** The boxes Availity asks for, in the order its own form asks for them. */
const FIELDS: { field: keyof AvailityProviderSettings; label: string; hint?: string }[] = [
  { field: 'organization', label: 'Organization' },
  { field: 'providerName', label: 'Provider name' },
  { field: 'contactName', label: 'Contact name' },
  { field: 'providerNpi', label: 'NPI' },
  { field: 'providerEin', label: 'EIN (tax ID)' },
  { field: 'specialtyCode', label: 'Specialty code' },
  { field: 'addressLine1', label: 'Billing address' },
  { field: 'city', label: 'City' },
  { field: 'state', label: 'State' },
  { field: 'zip', label: 'ZIP code' },
  { field: 'phone', label: 'Phone', hint: 'Optional' },
  { field: 'fax', label: 'Fax', hint: 'Optional' },
  { field: 'defaultModifier', label: 'Line modifier on H0044' },
];

const isRequired = (f: keyof AvailityProviderSettings) => REQUIRED_PROVIDER_FIELDS.includes(f);

export function providerGaps(s: AvailityProviderSettings | null): (keyof AvailityProviderSettings)[] {
  if (!s) return [];
  return REQUIRED_PROVIDER_FIELDS.filter((f) => !(s[f] as string)?.trim());
}

export const ProviderSetup: React.FC<{ onChanged?: (s: AvailityProviderSettings) => void }> = ({
  onChanged,
}) => {
  const [draft, setDraft] = useState<AvailityProviderSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAvailitySettings()
      .then((s) => setDraft(s))
      .finally(() => setLoading(false));
  }, []);

  const gaps = useMemo(() => providerGaps(draft), [draft]);

  // A payer name is only useful if some client actually carries that MCO, but
  // the list is short enough that showing them all is clearer than hiding some.
  const payerGaps = useMemo(
    () => MCO_OPTIONS.filter((m) => !draft.payersClaims[m]?.trim() || !draft.payersEligibility[m]?.trim()),
    [draft],
  );

  const save = async () => {
    setSaving(true);
    try {
      await saveAvailitySettings(draft);
      onChanged?.(draft);
      toast.success('Saved. Every claim will use these details.');
    } catch (err) {
      toast.error('Could not save the provider details', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Loading billing details…
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">The agency's billing details</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              These are the same on every claim. Add them once here and the app fills them in for each
              client. Nothing is sent to Availity from this app.
            </p>
          </div>
          {gaps.length === 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
              <Check className="h-4 w-4" /> All details added
            </span>
          ) : (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900">
              {gaps.length} details missing
            </span>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {FIELDS.map(({ field, label, hint }) => {
            const empty = !(draft[field] as string)?.trim();
            return (
              <div key={field} className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  {label}
                  {hint && <span className="ml-1 text-muted-foreground/70">· {hint}</span>}
                </Label>
                <Input
                  value={(draft[field] as string) ?? ''}
                  placeholder={isRequired(field) ? 'Required' : 'Optional'}
                  className={empty && isRequired(field) ? 'border-amber-400 bg-amber-50/40' : ''}
                  onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold">Payer names</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The exact entry to choose in Availity's Payer list. The two pages word the same MCO
          differently, and Aetna appears several times in both, so only the exact wording works.
          {payerGaps.length > 0 && (
            <span className="text-amber-800"> {payerGaps.length} not added yet.</span>
          )}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-[10rem_1fr_1fr]">
          <span />
          <span className="text-xs font-medium text-muted-foreground">Eligibility and benefits</span>
          <span className="text-xs font-medium text-muted-foreground">Claims and encounters</span>
          {MCO_OPTIONS.map((mco) => (
            <React.Fragment key={mco}>
              <span className="self-center text-sm font-medium">{mco}</span>
              <Input
                placeholder="Not confirmed yet"
                value={draft.payersEligibility[mco] ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    payersEligibility: { ...draft.payersEligibility, [mco]: e.target.value },
                  })
                }
              />
              <Input
                placeholder="Not confirmed yet"
                value={draft.payersClaims[mco] ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    payersClaims: { ...draft.payersClaims, [mco]: e.target.value },
                  })
                }
              />
            </React.Fragment>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? 'Saving…' : 'Save billing details'}
        </Button>
      </div>
    </div>
  );
};
