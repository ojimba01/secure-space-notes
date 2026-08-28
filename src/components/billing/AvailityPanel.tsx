// Billing → Availity.
//
// Copies of the two Availity pages the agency works in — Eligibility and
// Benefits, and Claims and Encounters — laid out the same way, already filled
// in for one client, with a copy button beside every box. Sit one beside the
// real page and copy across. Nothing here is submitted anywhere.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, Copy, Search } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { BillingClient } from '@/hooks/useBilling';
import { MCO_OPTIONS, todayAgency, type BillingCycle } from '@/lib/billing';
import { fetchClientAuthorizations, type ClientAuthorization } from '@/lib/authorizations';
import {
  AGENCY_DIAGNOSIS_CODES,
  DEFAULT_DIAGNOSIS_CODE,
  OTHER_DIAGNOSIS_CODES,
  GENDER_OPTIONS,
  RELATIONSHIP_OPTIONS,
  REQUIRED_PROVIDER_FIELDS,
  billableCycles,
  claimSections,
  defaultCycle,
  eligibilitySections,
  findDiagnosisCode,
  loadAvailitySettings,
  patientControlNumber,
  usDate,
  type AvailityField,
  type AvailityGender,
  type AvailityProviderSettings,
  type BillableCycle,
  type Relationship,
} from '@/lib/availity';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  /** Writes a cycle back — the same writer the billing grid uses. */
  updateCycle: (id: string, patch: Partial<BillingCycle>) => Promise<void>;
  /** The client the billing list sent here. Its own picker is used when absent. */
  initialClientId?: string | null;
  /** Fired once a cycle has been marked billed, so the flow can ask about touchpoints. */
  onBilled?: (clientId: string, cycleId: string) => void;
}

type Page = 'eligibility' | 'claim';

interface ClientExtras {
  date_of_birth: string | null;
  medicaid_id: string | null;
  address: string | null;
  gender: AvailityGender | null;
  /** The principal diagnosis already agreed for this client, when there is one. */
  diagnosis_code: string | null;
}

const NO_EXTRAS: ClientExtras = {
  date_of_birth: null,
  medicaid_id: null,
  address: null,
  gender: null,
  diagnosis_code: null,
};

/** The value the code dropdown uses for "something not in the list". */
const OTHER_CODE = '__other__';

/** One Availity box: its label, its value, and a button that copies it. */
const CopyField: React.FC<AvailityField> = ({ label, value, required, note, missing }) => {
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
          className={`flex min-h-10 flex-1 items-center rounded-md border px-3 py-2 text-sm ${
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

export const AvailityPanel: React.FC<Props> = ({ clients, cycles, updateCycle, initialClientId, onBilled }) => {
  const [page, setPage] = useState<Page>('eligibility');
  const [query, setQuery] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [extras, setExtras] = useState<ClientExtras>(NO_EXTRAS);
  const [authorizations, setAuthorizations] = useState<ClientAuthorization[]>([]);
  const [gender, setGender] = useState<AvailityGender>('Female');
  const [genderAssumed, setGenderAssumed] = useState(true);
  const [relationship, setRelationship] = useState<Relationship>('Self');
  const [diagnosisCode, setDiagnosisCode] = useState<string>(DEFAULT_DIAGNOSIS_CODE);
  const [customCode, setCustomCode] = useState('');
  const [savingDiagnosis, setSavingDiagnosis] = useState(false);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AvailityProviderSettings | null>(null);
  const [markingSubmitted, setMarkingSubmitted] = useState(false);

  useEffect(() => {
    loadAvailitySettings().then(setSettings);
  }, []);

  // The billing list drives which client is shown; the internal picker is only
  // a fallback for opening this panel on its own.
  useEffect(() => {
    if (initialClientId) setClientId(initialClientId);
  }, [initialClientId]);

  const client = useMemo(() => clients.find((c) => c.id === clientId) ?? null, [clients, clientId]);

  const loadExtras = useCallback(async (id: string) => {
    const [clientRow, intakeRow, auths] = await Promise.all([
      supabase
        .from('clients')
        .select('date_of_birth, medicaid_id, address, diagnosis_code')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('client_intakes').select('gender').eq('client_id', id).maybeSingle(),
      fetchClientAuthorizations(id).catch(() => [] as ClientAuthorization[]),
    ]);
    const intakeGender = intakeRow.data?.gender;
    const known: AvailityGender | null =
      intakeGender === 'Male' ? 'Male' : intakeGender === 'Female' ? 'Female' : null;
    const stored = clientRow.data?.diagnosis_code?.trim() || null;
    setExtras({
      date_of_birth: clientRow.data?.date_of_birth ?? null,
      medicaid_id: clientRow.data?.medicaid_id ?? null,
      address: clientRow.data?.address ?? null,
      gender: known,
      diagnosis_code: stored,
    });
    // Reopen on whatever was agreed for this client last time.
    setDiagnosisCode(stored ?? DEFAULT_DIAGNOSIS_CODE);
    setCustomCode(stored && !findDiagnosisCode(stored) ? stored : '');
    setGender(known ?? 'Female');
    setGenderAssumed(!known);
    setRelationship('Self');
    setAuthorizations(auths);
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

  /** Every ended cycle for this client, oldest first, with its filing deadline. */
  const cycleRows = useMemo<BillableCycle[]>(() => {
    if (!clientId) return [];
    return billableCycles(
      cycles.filter((c) => c.client_id === clientId),
      authorizations,
    );
  }, [cycles, clientId, authorizations]);

  // Open on the oldest cycle that can still be filed — the one closest to
  // falling outside the six-month window. A choice already made is kept:
  // marking a cycle submitted refreshes this list, and that must not drag the
  // selection back to the top of the backlog.
  useEffect(() => {
    setCycleId((current) =>
      current && cycleRows.some((r) => r.cycle.id === current)
        ? current
        : (defaultCycle(cycleRows)?.cycle.id ?? null),
    );
  }, [cycleRows]);

  const selected = useMemo(
    () => cycleRows.find((r) => r.cycle.id === cycleId) ?? null,
    [cycleRows, cycleId],
  );

  const availityClient = useMemo(() => {
    if (!client) return null;
    return {
      first_name: client.first_name,
      last_name: client.last_name,
      member_id: client.member_id,
      date_of_birth: extras.date_of_birth,
      address: extras.address,
      insurance: client.insurance,
      level_of_need: client.level_of_need,
    };
  }, [client, extras]);

  const sections = useMemo(() => {
    if (!availityClient || !settings) return [];
    if (page === 'eligibility') {
      return eligibilitySections({
        client: availityClient,
        settings,
        gender,
        genderAssumed,
        relationship,
      });
    }
    if (!selected) return [];
    return claimSections({
      client: availityClient,
      settings,
      gender,
      genderAssumed,
      relationship,
      selected,
      diagnosisCode,
    });
  }, [availityClient, settings, page, gender, genderAssumed, relationship, selected, diagnosisCode]);

  const saveDiagnosis = async () => {
    if (!clientId) return;
    const code = diagnosisCode.trim().toUpperCase();
    if (!code) return;
    setSavingDiagnosis(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({ diagnosis_code: code })
        .eq('id', clientId);
      if (error) throw error;
      setExtras((e) => ({ ...e, diagnosis_code: code }));
      toast.success(`${code} kept for this client`);
    } catch (err: any) {
      toast.error('Could not save the diagnosis code', { description: err.message });
    } finally {
      setSavingDiagnosis(false);
    }
  };

  /**
   * Filing the claim on Availity is the real event; this records that it
   * happened, so the cycle stops appearing as work. The control number goes in
   * as the claim number when there is not one already, and the picker moves on
   * to the next cycle so a backlog can be worked straight through.
   */
  const markSubmitted = async () => {
    if (!selected || !availityClient) return;
    setMarkingSubmitted(true);
    try {
      const patch: Partial<BillingCycle> = {
        billing_status: 'Submitted',
        submitted_date: todayAgency(),
      };
      if (!selected.cycle.claim_number) {
        patch.claim_number = patientControlNumber(availityClient) || null;
      }
      await updateCycle(selected.cycle.id, patch);
      if (clientId) onBilled?.(clientId, selected.cycle.id);
      toast.success(`Cycle ${selected.cycle.cycle_number} marked as billed`, {
        description: 'It moves to Revenue and leaves the list of clients to bill.',
      });
      const next = cycleRows.find(
        (r) =>
          r.billable &&
          r.cycle.id !== selected.cycle.id &&
          r.cycle.billing_status !== 'Submitted' &&
          r.cycle.cycle_start > selected.cycle.cycle_start,
      );
      if (next) setCycleId(next.cycle.id);
    } catch (err: any) {
      toast.error('Could not update the cycle', { description: err.message });
    } finally {
      setMarkingSubmitted(false);
    }
  };

  const missingProvider = settings
    ? REQUIRED_PROVIDER_FIELDS.filter((f) => !(settings[f] as string)?.trim())
    : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold">Availity information</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The two Availity pages, in the same order, filled in for this client. Put this beside the
          real page and copy each box across. Nothing is sent to Availity from this app.
        </p>

        {!!missingProvider.length && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {missingProvider.length} of the agency's own billing details are missing, so some boxes
            below will be empty. Add them under <b>Billing details</b>.
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex rounded-lg border bg-white p-1">
            <Button
              variant={page === 'eligibility' ? 'default' : 'ghost'}
              onClick={() => setPage('eligibility')}
            >
              Eligibility and benefits
            </Button>
            <Button variant={page === 'claim' ? 'default' : 'ghost'} onClick={() => setPage('claim')}>
              Claims and encounters
            </Button>
          </div>

          {/* The list of clients to bill picks the client, so its own picker is
              only shown when this panel is opened on its own. */}
          {!initialClientId && (
            <>
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
            </>
          )}
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
              {page === 'claim' && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-muted-foreground">Principal diagnosis code</Label>
                  <Select
                    value={findDiagnosisCode(diagnosisCode) ? diagnosisCode : OTHER_CODE}
                    onValueChange={(v) => setDiagnosisCode(v === OTHER_CODE ? customCode : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>The codes we use</SelectLabel>
                        {AGENCY_DIAGNOSIS_CODES.map((d) => (
                          <SelectItem key={d.code} value={d.code}>
                            {d.code} — {d.description}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Other Z59 codes</SelectLabel>
                        {OTHER_DIAGNOSIS_CODES.map((d) => (
                          <SelectItem key={d.code} value={d.code}>
                            {d.code} — {d.description}
                            {d.billable === false ? ' (category only)' : ''}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Something else</SelectLabel>
                        <SelectItem value={OTHER_CODE}>Another code…</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {!findDiagnosisCode(diagnosisCode) && (
                    <Input
                      placeholder="Type the code without the decimal point, e.g. Z59819"
                      value={customCode}
                      onChange={(e) => {
                        setCustomCode(e.target.value);
                        setDiagnosisCode(e.target.value.trim().toUpperCase());
                      }}
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground">
                      Which code fits is a judgement about the client, so it is kept on the client
                      record and every later claim opens on it.
                    </p>
                    {extras.diagnosis_code !== (diagnosisCode.trim() || null) && !!diagnosisCode.trim() && (
                      <Button size="sm" variant="outline" onClick={saveDiagnosis} disabled={savingDiagnosis}>
                        {savingDiagnosis ? 'Saving…' : 'Keep this for this client'}
                      </Button>
                    )}
                    {extras.diagnosis_code && extras.diagnosis_code === diagnosisCode.trim() && (
                      <Badge variant="secondary">Saved for this client</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {page === 'claim' && (
            <Card className="p-4">
              <div className="mb-2">
                <p className="text-sm font-medium">Which cycle are you billing?</p>
                <p className="text-xs text-muted-foreground">
                  A cycle is filed after its service period ends, and Availity will not take it more
                  than six months after that. This opens on the oldest one still inside the window —
                  the one closest to being lost — so you can work forward through the rest in one
                  sitting.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {cycleRows.map((row) => {
                  const isSelected = row.cycle.id === cycleId;
                  return (
                    <Button
                      key={row.cycle.id}
                      size="sm"
                      variant={isSelected ? 'default' : 'outline'}
                      disabled={!row.billable}
                      className={!row.billable ? 'opacity-50' : ''}
                      onClick={() => setCycleId(row.cycle.id)}
                    >
                      {usDate(row.cycle.cycle_start)} – {usDate(row.cycle.cycle_end)}
                      {!row.billable
                        ? ' · past the six-month window'
                        : row.cycle.billing_status === 'Submitted'
                          ? ' · submitted'
                          : ` · ${row.daysLeft} days left`}
                    </Button>
                  );
                })}
                {!cycleRows.length && (
                  <p className="text-sm text-muted-foreground">
                    No cycle has finished yet, so there is nothing to bill for this client.
                  </p>
                )}
              </div>
              {selected && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">Cycle {selected.cycle.cycle_number}</Badge>
                  <span className="text-muted-foreground">
                    Must be filed by {usDate(selected.deadline)}.
                  </span>
                  {selected.cycle.billing_status === 'Submitted' && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                      Already billed
                    </Badge>
                  )}
                </div>
              )}
            </Card>
          )}

          {page === 'claim' && selected && (
            <Card className="border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-medium">What changes from one claim to the next</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Only the patient information, the patient control number, the prior authorization
                number, the diagnosis code, the service dates, and — for a High level client — the
                charge amount. Everything else on this page is the same every time, and is filled in
                below.
              </p>
            </Card>
          )}

          {page === 'claim' && !selected ? null : (
            <>
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
                {page === 'eligibility' ? (
                  <p className="text-sm">
                    Then press <span className="font-semibold">Submit</span> at the bottom of the
                    Availity page.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm">
                      Then press <span className="font-semibold">Continue</span> at the bottom of the
                      Availity page — the claim is reviewed on the next screen before it is sent.{' '}
                      <span className="font-semibold">Save as Draft</span> keeps it if you need to
                      stop.
                    </p>
                    {selected && (
                      <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                        {selected.cycle.billing_status === 'Submitted' ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            Cycle {selected.cycle.cycle_number} is already billed
                          </Badge>
                        ) : (
                          <>
                            <Button onClick={markSubmitted} disabled={markingSubmitted}>
                              {markingSubmitted
                                ? 'Saving…'
                                : `Mark cycle ${selected.cycle.cycle_number} as billed`}
                            </Button>
                            <p className="text-xs text-muted-foreground">
                              Saves today as the date billed and stores the control number as the
                              claim number. The cycle then moves to Revenue. Press this after Availity
                              accepts the claim, not before.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default AvailityPanel;
