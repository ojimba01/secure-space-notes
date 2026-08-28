// Billing → Availity.
//
// A copy of Availity's Eligibility and Benefits page, laid out the same way,
// already filled in for one client. Sit it beside the real page and copy each
// box across; nothing here is submitted anywhere.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, Copy, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import type { BillingClient } from '@/hooks/useBilling';
import { MCO_OPTIONS } from '@/lib/billing';
import {
  GENDER_OPTIONS,
  RELATIONSHIP_OPTIONS,
  eligibilitySections,
  loadAvailitySettings,
  saveAvailitySettings,
  type AvailityGender,
  type AvailityProviderSettings,
  type Relationship,
} from '@/lib/availity';

interface Props {
  clients: BillingClient[];
}

interface ClientExtras {
  date_of_birth: string | null;
  gender: AvailityGender | null;
}

/** One Availity box: its label, its value, and a button that copies it. */
const CopyField: React.FC<{
  label: string;
  value: string;
  required?: boolean;
  note?: string;
  missing?: string;
}> = ({ label, value, required, note, missing }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not reach the clipboard', {
        description: 'Select the text in the box and copy it by hand.',
      });
    }
  };

  return (
    <div className="space-y-1">
      <Label className="text-sm font-normal text-slate-700">
        {required && <span className="mr-1 text-red-600">*</span>}
        {label}
      </Label>
      <div className="flex gap-2">
        <div
          className={`flex h-10 flex-1 items-center rounded-md border px-3 text-sm ${
            missing ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-300 bg-white'
          }`}
        >
          {missing ? missing : value || <span className="text-muted-foreground">(leave blank)</span>}
        </div>
        {!missing && value && (
          <Button type="button" variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
};

export const AvailityPanel: React.FC<Props> = ({ clients }) => {
  const { isAdmin } = useIsAdmin();
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [extras, setExtras] = useState<ClientExtras>({ date_of_birth: null, gender: null });
  const [gender, setGender] = useState<AvailityGender>('Female');
  const [genderAssumed, setGenderAssumed] = useState(true);
  const [relationship, setRelationship] = useState<Relationship>('Self');
  const [settings, setSettings] = useState<AvailityProviderSettings | null>(null);
  const [editingProvider, setEditingProvider] = useState(false);
  const [providerDraft, setProviderDraft] = useState<AvailityProviderSettings | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);

  useEffect(() => {
    loadAvailitySettings().then(setSettings);
  }, []);

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  const loadExtras = useCallback(async (id: string) => {
    const [clientRow, intakeRow] = await Promise.all([
      supabase.from('clients').select('date_of_birth').eq('id', id).maybeSingle(),
      supabase.from('client_intakes').select('gender').eq('client_id', id).maybeSingle(),
    ]);
    const intakeGender = intakeRow.data?.gender;
    const known: AvailityGender | null =
      intakeGender === 'Male' ? 'Male' : intakeGender === 'Female' ? 'Female' : null;
    setExtras({ date_of_birth: clientRow.data?.date_of_birth ?? null, gender: known });
    setGender(known ?? 'Female');
    setGenderAssumed(!known);
    setRelationship('Self');
  }, []);

  useEffect(() => {
    if (clientId) loadExtras(clientId);
  }, [clientId, loadExtras]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = clients.filter((c) => c.status === 'active' && !c.deleted_at);
    if (!q) return active.slice(0, 8);
    return active
      .filter((c) => `${c.first_name} ${c.last_name} ${c.member_id ?? ''}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, query]);

  const sections = useMemo(() => {
    if (!client || !settings) return [];
    return eligibilitySections({
      client: {
        first_name: client.first_name,
        last_name: client.last_name,
        member_id: client.member_id,
        date_of_birth: extras.date_of_birth,
        insurance: client.insurance,
      },
      settings,
      gender,
      genderAssumed,
      relationship,
    });
  }, [client, settings, extras.date_of_birth, gender, genderAssumed, relationship]);

  const saveProvider = async () => {
    if (!providerDraft) return;
    setSavingProvider(true);
    try {
      await saveAvailitySettings(providerDraft);
      setSettings(providerDraft);
      setEditingProvider(false);
      toast.success('Provider details saved');
    } catch (err: any) {
      toast.error('Could not save the provider details', { description: err.message });
    } finally {
      setSavingProvider(false);
    }
  };

  const needsSetup =
    settings && (!settings.providerNpi || !settings.providerTaxId || !settings.organization);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Availity — Eligibility and Benefits</h2>
            <p className="text-sm text-muted-foreground">
              The same page as Availity, in the same order, filled in for one client. Put this beside
              the real page and copy each box across. Nothing is sent to Availity from here.
            </p>
          </div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProviderDraft(settings);
                setEditingProvider((v) => !v);
              }}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Provider details
            </Button>
          )}
        </div>

        {needsSetup && !editingProvider && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            The practice NPI and tax ID have not been entered yet. They are deliberately not stored in
            the code, because this repository is public. Add them once under Provider details and every
            client's page fills in from then on.
          </div>
        )}

        {editingProvider && providerDraft && (
          <div className="mt-4 space-y-4 rounded-md border bg-muted/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Organization</Label>
                <Input
                  value={providerDraft.organization}
                  onChange={(e) => setProviderDraft({ ...providerDraft, organization: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Provider name</Label>
                <Input
                  value={providerDraft.providerName}
                  onChange={(e) => setProviderDraft({ ...providerDraft, providerName: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Provider NPI</Label>
                <Input
                  value={providerDraft.providerNpi}
                  onChange={(e) => setProviderDraft({ ...providerDraft, providerNpi: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Provider tax ID</Label>
                <Input
                  value={providerDraft.providerTaxId}
                  onChange={(e) => setProviderDraft({ ...providerDraft, providerTaxId: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Payer names</p>
              <p className="text-xs text-muted-foreground">
                The exact entry to choose in Availity's Payer list for each MCO. Several payers appear
                more than once there, so the wording has to match what works.
              </p>
              {MCO_OPTIONS.map((mco) => (
                <div key={mco} className="flex flex-wrap items-center gap-2">
                  <span className="w-32 text-sm">{mco}</span>
                  <Input
                    className="min-w-[18rem] flex-1"
                    placeholder="Not confirmed yet"
                    value={providerDraft.payers[mco] ?? ''}
                    onChange={(e) =>
                      setProviderDraft({
                        ...providerDraft,
                        payers: { ...providerDraft.payers, [mco]: e.target.value },
                      })
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button onClick={saveProvider} disabled={savingProvider}>
                {savingProvider ? 'Saving…' : 'Save provider details'}
              </Button>
              <Button variant="outline" onClick={() => setEditingProvider(false)} disabled={savingProvider}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Find a client by name or member ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {matches.map((c) => (
              <Button
                key={c.id}
                size="sm"
                variant={c.id === clientId ? 'default' : 'outline'}
                onClick={() => setClientId(c.id)}
              >
                {c.last_name}, {c.first_name}
                {c.insurance ? ` · ${c.insurance}` : ''}
              </Button>
            ))}
            {!matches.length && (
              <p className="text-sm text-muted-foreground">No active client matches that.</p>
            )}
          </div>
        </div>
      </Card>

      {client && (
        <>
          <Card className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Patient gender {genderAssumed && '(assumed — the record does not say)'}
                </Label>
                <Select
                  value={gender}
                  onValueChange={(v) => {
                    setGender(v as AvailityGender);
                    setGenderAssumed(extras.gender !== v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Relationship to subscriber</Label>
                <Select value={relationship} onValueChange={(v) => setRelationship(v as Relationship)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RELATIONSHIP_OPTIONS.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              These two are the only choices the page cannot make on its own. Everything below follows
              from them.
            </p>
          </Card>

          {sections.map((section) => (
            <Card key={section.title} className="overflow-hidden">
              <div className="border-b bg-slate-50 px-4 py-3">
                <h3 className="text-base font-semibold text-slate-900">{section.title}</h3>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {section.fields.map((f) => (
                  <CopyField key={f.label} {...f} />
                ))}
              </div>
            </Card>
          ))}

          <Card className="border-slate-300 bg-slate-50 p-4">
            <p className="text-sm">
              Then press <span className="font-semibold">Submit</span> at the bottom of the Availity
              page.
            </p>
          </Card>
        </>
      )}
    </div>
  );
};

export default AvailityPanel;
