// The UHC Move-in Supports Request, filled in while talking with the member.
//
// Mirrors UHC's spreadsheet tab by tab. Lines are picked with a quantity during
// the conversation and priced when known; every total is added up here. The
// top section starts from the client record (and the client's other filed
// documents), and what is changed there is saved back onto the record.
// Completing it writes UHC's own spreadsheet with the answers in place.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, Minus, Plus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ClientPicker, type PickableClient } from '@/components/ClientPicker';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';
import { cn } from '@/lib/utils';
import { loadCaseManagerFacts, loadClientFacts, type ClientFacts } from '@/lib/clientFacts';
import { FURNITURE_CAPS, UHC_TABS } from '@/lib/uhcMoveIn/layout';
import type { UhcLine, UhcTab } from '@/lib/uhcMoveIn/types';
import {
  UHC_FORM_LABEL,
  UHC_FORM_TYPE,
  UHC_TEMPLATE,
  emptyAnswers,
  formatMoney,
  grandTotal,
  isPicked,
  needsPaperwork,
  normalizeAnswers,
  overCap,
  pickedCount,
  tabTotal,
  unpriced,
  type UhcAnswers,
  type UhcLineAnswer,
  type UhcMember,
} from '@/lib/uhcMoveIn/model';
import { fillUhcWorkbook } from '@/lib/uhcMoveIn/fill';
import { COMPLETED_STATUS } from '@/lib/formSigning';
import { nextFormTitle } from '@/lib/formTitles';
import { recordFormVersion, sha256Hex } from '@/lib/formVersions';

export interface UhcExistingForm {
  id: string;
  client_id: string;
  status: string;
  form_data: unknown;
}

interface Props {
  profileId: string;
  /** Started from a client's record: the client is fixed. */
  lockedClientId?: string;
  lockedClientName?: string;
  /** A saved form being opened again. */
  existing?: UhcExistingForm | null;
  onClose: () => void;
  onSaved: () => void;
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MEMBER_FIELDS: { key: keyof UhcMember; label: string; type?: string; wide?: boolean }[] = [
  { key: 'provider', label: 'Requesting HSP provider', wide: true },
  { key: 'caseManager', label: 'Housing case manager' },
  { key: 'cmPhone', label: 'Case manager phone', type: 'tel' },
  { key: 'cmEmail', label: 'Case manager email', type: 'email' },
  { key: 'memberName', label: 'Member name' },
  { key: 'medicaidId', label: 'Medicaid ID' },
  { key: 'householdSize', label: 'Total household members', type: 'number' },
  { key: 'memberPhone', label: 'Member phone', type: 'tel' },
  { key: 'newAddress', label: 'New address' },
  { key: 'newCityStateZip', label: 'City, state and ZIP' },
  { key: 'moveInDate', label: 'Anticipated move-in date', type: 'date' },
  { key: 'emergencyName', label: 'Emergency contact (for deliveries)' },
  { key: 'emergencyPhone', label: 'Emergency contact phone', type: 'tel' },
  { key: 'delivery', label: 'Preferred delivery date and time', wide: true },
];

/** The member fields that live on the client record, and their columns. */
const RECORD_COLUMNS: Partial<Record<keyof UhcMember, keyof ClientFacts>> = {
  medicaidId: 'medicaid_id',
  householdSize: 'household_size',
  memberPhone: 'phone',
  newAddress: 'new_address',
  newCityStateZip: 'new_city_state_zip',
  moveInDate: 'move_in_date',
  emergencyName: 'emergency_contact_name',
  emergencyPhone: 'emergency_contact_phone',
  delivery: 'preferred_delivery',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

function memberFromFacts(f: ClientFacts, cm: Awaited<ReturnType<typeof loadCaseManagerFacts>>): UhcMember {
  return {
    provider: cm.organization ?? '',
    caseManager: cm.name ?? '',
    cmPhone: cm.phone ?? '',
    cmEmail: cm.email ?? '',
    memberName: `${f.first_name ?? ''} ${f.last_name ?? ''}`.trim(),
    medicaidId: str(f.medicaid_id),
    householdSize: str(f.household_size),
    memberPhone: str(f.phone),
    newAddress: str(f.new_address),
    newCityStateZip: str(f.new_city_state_zip),
    moveInDate: str(f.move_in_date).slice(0, 10),
    emergencyName: str(f.emergency_contact_name),
    emergencyPhone: str(f.emergency_contact_phone),
    delivery: str(f.preferred_delivery),
  };
}

const lineMatches = (l: UhcLine, q: string) => !q || `${l.group ?? ''} ${l.label ?? ''}`.toLowerCase().includes(q);

export const UhcMoveInDialog: React.FC<Props> = ({ profileId, lockedClientId, lockedClientName, existing, onClose, onSaved }) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const [clientId, setClientId] = useState<string>(existing?.client_id ?? lockedClientId ?? '');
  const [clients, setClients] = useState<PickableClient[]>([]);
  const [facts, setFacts] = useState<ClientFacts | null>(null);
  const [answers, setAnswers] = useState<UhcAnswers>(() => (existing ? normalizeAnswers(existing.form_data) : emptyAnswers()));
  const [tab, setTab] = useState('member');
  const [query, setQuery] = useState('');
  const [pickedOnly, setPickedOnly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [onFile, setOnFile] = useState<Set<string>>(new Set());
  const formId = existing?.id ?? null;

  // Without a client fixed, pick from the clients this person can file for.
  useEffect(() => {
    if (existing || lockedClientId) return;
    (async () => {
      let q = supabase.from('clients').select('id, first_name, last_name, member_id').is('deleted_at', null).neq('status', 'closed').order('first_name');
      if ((!isAdmin || isViewingAs) && profileId) q = q.eq('assigned_employee_id', profileId);
      const { data } = await q;
      setClients(data ?? []);
    })();
  }, [existing, lockedClientId, isAdmin, isViewingAs, profileId]);

  // What the app knows about the client starts the top section. A saved form
  // keeps what was saved; only its empty boxes are filled.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const f = await loadClientFacts(clientId);
        const cm = await loadCaseManagerFacts(f.assigned_employee_id ?? profileId);
        if (cancelled) return;
        setFacts(f);
        const known = memberFromFacts(f, cm);
        setAnswers((a) => ({
          ...a,
          member: Object.fromEntries(
            Object.entries(a.member).map(([k, v]) => [k, v || known[k as keyof UhcMember]]),
          ) as unknown as UhcMember,
        }));
        const { data } = await supabase.from('client_forms').select('form_type').eq('client_id', clientId).in('form_type', ['W-9', 'Lease or Housing Document']);
        if (!cancelled) setOnFile(new Set((data ?? []).map((d) => d.form_type)));
      } catch (e) {
        if (!cancelled) toast({ title: 'Could not load the client', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const setMember = (k: keyof UhcMember, v: string) => setAnswers((a) => ({ ...a, member: { ...a.member, [k]: v } }));
  const setLine = (id: string, patch: Partial<UhcLineAnswer>) =>
    setAnswers((a) => {
      const next = { ...(a.lines[id] ?? {}), ...patch };
      const lines = { ...a.lines, [id]: next };
      if (!next.qty && !next.cost && !next.note && !next.item && !next.size) delete lines[id];
      return { ...a, lines };
    });

  const total = grandTotal(answers);
  const q = query.trim().toLowerCase();
  const missingCost = useMemo(() => unpriced(answers), [answers]);
  const paperwork = needsPaperwork(answers);

  // ---- saving ----------------------------------------------------------------

  /** Member answers that differ from the record go onto it. */
  const writeBack = async () => {
    if (!facts) return;
    const patch: Record<string, string | number | null> = {};
    for (const [key, col] of Object.entries(RECORD_COLUMNS) as [keyof UhcMember, keyof ClientFacts][]) {
      const v = answers.member[key].trim();
      if (!v || v === str(facts[col]).slice(0, key === 'moveInDate' ? 10 : undefined)) continue;
      if (key === 'householdSize') {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) continue;
        patch[col] = n;
      } else patch[col] = v;
    }
    if (!Object.keys(patch).length) return;
    const { error } = await supabase.from('clients').update(patch as never).eq('id', clientId);
    if (error) throw new Error(`The form is saved, but the client record was not updated: ${error.message}`);
    setFacts({ ...facts, ...(patch as Partial<ClientFacts>) });
  };

  const fileName = () => {
    const name = answers.member.memberName.replace(/[^\w-]+/g, '') || 'Member';
    return `${name}_UHC_Move-in_Supports_${new Date().toISOString().slice(0, 10)}.xlsx`;
  };

  const workbook = async () => {
    const res = await fetch(UHC_TEMPLATE);
    if (!res.ok) throw new Error(`Could not load UHC's spreadsheet (${res.status}).`);
    return fillUhcWorkbook(await res.arrayBuffer(), answers);
  };

  const downloadCopy = async () => {
    try {
      const bytes = await workbook();
      const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      toast({ title: 'Could not create the spreadsheet', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const save = async (complete: boolean) => {
    if (!clientId) {
      toast({ title: 'Select a client', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      let file: { path: string; size: number; hash: string } | null = null;
      if (complete) {
        const bytes = await workbook();
        const buffer = bytes.slice().buffer;
        const path = `forms/${clientId}/${crypto.randomUUID()}/uhc-move-in-supports.xlsx`;
        const { error: upErr } = await supabase.storage.from('client-files').upload(path, new Blob([buffer], { type: XLSX_TYPE }), { contentType: XLSX_TYPE });
        if (upErr) throw upErr;
        file = { path, size: bytes.byteLength, hash: await sha256Hex(buffer) };
      }
      const row: Record<string, unknown> = {
        form_data: answers,
        status: complete ? COMPLETED_STATUS : 'draft',
        field_member_name: answers.member.memberName || null,
        field_medicaid_id: answers.member.medicaidId || null,
        field_total_charges: total || null,
        ...(file ? { file_path: file.path, file_size: file.size, file_hash: file.hash } : {}),
      };
      let id = formId;
      if (id) {
        const { error } = await supabase.from('client_forms').update(row as never).eq('id', id);
        if (error) throw error;
      } else {
        const { data: same } = await supabase.from('client_forms').select('title').eq('client_id', clientId).eq('form_type', UHC_FORM_TYPE).ilike('title', 'UHC%');
        const { data, error } = await supabase
          .from('client_forms')
          .insert({
            ...row,
            client_id: clientId,
            employee_id: profileId,
            form_type: UHC_FORM_TYPE,
            title: nextFormTitle(UHC_FORM_LABEL, (same ?? []).map((f) => f.title)),
            ...(file ? { original_file_path: file.path } : {}),
          } as never)
          .select('id')
          .single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }
      if (file && id) {
        await recordFormVersion({ clientFormId: id, filePath: file.path, versionType: 'submitted', createdBy: profileId, fileHash: file.hash, fileSize: file.size }).catch(() => undefined);
      }
      await writeBack();
      toast({
        title: complete ? 'Form completed' : 'Draft saved',
        description: complete ? 'UHC’s spreadsheet is saved to the client’s forms.' : 'Open it again from the client’s forms to finish it.',
      });
      onSaved();
      onClose();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
      toast({ title: 'Could not save the form', description: raw, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ---- one line ------------------------------------------------------------------

  const lineRow = (l: UhcLine) => {
    const a = answers.lines[l.id];
    const picked = isPicked(l, a);
    const over = overCap(l.id, a);
    const name = l.free ? 'Item not listed' : `${l.group ? `${l.group}: ` : ''}${l.label}`;
    const toggle = () => (picked ? setLine(l.id, { qty: undefined, cost: undefined, note: undefined, size: undefined }) : setLine(l.id, { qty: 1 }));
    return (
      <div key={l.id} className={cn('rounded-lg border p-2.5', picked ? 'border-primary/50 bg-primary/5' : 'bg-background')}>
        <div className="flex flex-wrap items-center gap-2">
          {l.free ? (
            <Input
              aria-label="Item not listed"
              placeholder="Item not listed"
              value={a?.item ?? ''}
              onChange={(e) => setLine(l.id, { item: e.target.value, qty: a?.qty ?? (l.qty ? 1 : undefined) })}
              className="h-9 min-w-[10rem] flex-1"
            />
          ) : (
            <button type="button" onClick={toggle} className="flex min-w-[10rem] flex-1 items-center gap-2 text-left text-sm">
              <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded border', picked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                {picked && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className={cn(picked && 'font-medium')}>{name}</span>
            </button>
          )}
          {l.qty && (
            <div className="flex items-center gap-1">
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label={`Fewer ${name}`} onClick={() => setLine(l.id, { qty: Math.max(0, (a?.qty ?? 0) - 1) || undefined })}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <Input
                aria-label={`Quantity of ${name}`}
                inputMode="numeric"
                value={a?.qty ?? ''}
                onChange={(e) => setLine(l.id, { qty: Number(e.target.value.replace(/\D/g, '')) || undefined })}
                className="h-8 w-12 text-center"
              />
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" aria-label={`More ${name}`} onClick={() => setLine(l.id, { qty: (a?.qty ?? 0) + 1 })}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {l.total && (
            <div className="relative">
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input
                aria-label={`Cost of ${name}`}
                inputMode="decimal"
                placeholder="0.00"
                value={a?.cost ?? ''}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d.]/g, '');
                  setLine(l.id, { cost: v === '' ? undefined : Number(v), ...(!l.qty || a?.qty ? {} : { qty: 1 }) });
                }}
                className="h-8 w-24 pl-5"
              />
            </div>
          )}
        </div>
        {picked && (l.note || l.size) && (
          <div className="mt-2 flex flex-wrap gap-2 pl-7">
            {l.size && <Input aria-label={`Size of ${name}`} placeholder="Size" value={a?.size ?? ''} onChange={(e) => setLine(l.id, { size: e.target.value })} className="h-8 w-24" />}
            {l.note && (
              <Input aria-label={`${l.noteLabel ?? 'Detail'} for ${name}`} placeholder={l.noteLabel ?? 'Detail'} value={a?.note ?? ''} onChange={(e) => setLine(l.id, { note: e.target.value })} className="h-8 max-w-xs flex-1" />
            )}
          </div>
        )}
        {over && (
          <p className="mt-1.5 flex items-center gap-1 pl-7 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            Over UHC’s {formatMoney(over.max)} limit for {over.label.toLowerCase()}. UHC reviews it individually.
          </p>
        )}
      </div>
    );
  };

  const itemsTab = (t: UhcTab) => (
    <TabsContent key={t.id} value={t.id} className="mt-0 space-y-4">
      {t.sections.map((s) => {
        const lines = s.lines.filter((l) => lineMatches(l, q) && (!pickedOnly || isPicked(l, answers.lines[l.id])));
        if (!lines.length) return null;
        return (
          <section key={s.title} className="space-y-2">
            <h3 className="text-sm font-semibold">{s.title}</h3>
            <div className="grid gap-2 md:grid-cols-2">{lines.map(lineRow)}</div>
          </section>
        );
      })}
      {t.id === 'household' && !pickedOnly && !q && (
        <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <h3 className="text-sm font-semibold">UHC furniture limits</h3>
          <div className="grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {FURNITURE_CAPS.map((c) => (
              <div key={c.label} className="flex justify-between gap-2">
                <span>{c.label}</span>
                <span className="tabular-nums">{formatMoney(c.max)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </TabsContent>
  );

  // ---- review --------------------------------------------------------------------

  const review = (
    <TabsContent value="review" className="mt-0 space-y-4">
      {UHC_TABS.map((t) => {
        const picked = t.sections.flatMap((s) => s.lines).filter((l) => isPicked(l, answers.lines[l.id]));
        if (!picked.length) return null;
        return (
          <section key={t.id} className="rounded-lg border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-sm font-semibold">
              <span>{t.title}</span>
              <span className="tabular-nums">{formatMoney(tabTotal(t, answers))}</span>
            </div>
            <ul className="divide-y text-sm">
              {picked.map((l) => {
                const a = answers.lines[l.id]!;
                const name = l.free ? a.item : `${l.group ? `${l.group}: ` : ''}${l.label}`;
                const extra = [a.size && `size ${a.size}`, a.note].filter(Boolean).join(', ');
                return (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span>
                      {a.qty ? `${a.qty} × ` : ''}
                      {name}
                      {extra && <span className="text-muted-foreground"> ({extra})</span>}
                    </span>
                    <span className={cn('tabular-nums', !a.cost && 'text-amber-700')}>{a.cost ? formatMoney(a.cost) : 'No cost'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!Object.keys(answers.lines).length && <p className="text-sm text-muted-foreground">Nothing selected yet.</p>}
      {paperwork && (
        <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          <h3 className="font-semibold">Send with this request</h3>
          {(
            [
              ['w9', 'Landlord’s W-9', onFile.has('W-9')],
              ['invoices', 'Invoices', false],
              ['lease', 'Lease, signed or unsigned (or a letter if there is no lease yet)', onFile.has('Lease or Housing Document')],
            ] as const
          ).map(([k, label, filed]) => (
            <label key={k} className="flex items-center gap-2">
              <Checkbox checked={!!answers.paperwork[k]} onCheckedChange={(c) => setAnswers((a) => ({ ...a, paperwork: { ...a.paperwork, [k]: c === true } }))} />
              {label}
              {filed && <span className="text-xs text-amber-800">· one is in the client’s documents</span>}
            </label>
          ))}
        </section>
      )}
    </TabsContent>
  );

  const clientLabel = lockedClientName ?? (facts ? `${facts.last_name}, ${facts.first_name}` : null);

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="flex h-[94vh] max-w-6xl flex-col gap-3 overflow-hidden bg-slate-50 p-4 sm:p-6">
        <DialogHeader className="space-y-1">
          <DialogTitle>{UHC_FORM_LABEL}</DialogTitle>
          <DialogDescription className="sr-only">Move-in items and costs for a UnitedHealthcare member, written into UHC’s spreadsheet.</DialogDescription>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {existing || lockedClientId ? (
              <span className="text-sm font-medium">{clientLabel ?? 'Loading…'}</span>
            ) : (
              <ClientPicker clients={clients} value={clientId || null} onChange={setClientId} className="h-9 w-72" />
            )}
            <span className="ml-auto rounded-md bg-primary/10 px-3 py-1.5 text-sm font-semibold tabular-nums text-primary">
              Total {formatMoney(total)}
            </span>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="member">Member</TabsTrigger>
            {UHC_TABS.map((t) => {
              const n = pickedCount(t, answers);
              return (
                <TabsTrigger key={t.id} value={t.id}>
                  {t.title}
                  {n > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{n}</span>}
                </TabsTrigger>
              );
            })}
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          {tab !== 'member' && tab !== 'review' && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search items" placeholder="Search items" value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 pl-8" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={pickedOnly} onCheckedChange={setPickedOnly} />
                Selected only
              </label>
              <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                {UHC_TABS.find((t) => t.id === tab)?.title} {formatMoney(tabTotal(UHC_TABS.find((t) => t.id === tab)!, answers))}
              </span>
            </div>
          )}

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <TabsContent value="member" className="mt-0">
              <div className="grid gap-3 sm:grid-cols-2">
                {MEMBER_FIELDS.map((f) => (
                  <div key={f.key} className={cn('space-y-1', f.wide && 'sm:col-span-2')}>
                    <Label htmlFor={`uhc-${f.key}`}>{f.label}</Label>
                    <Input id={`uhc-${f.key}`} type={f.type ?? 'text'} value={answers.member[f.key]} onChange={(e) => setMember(f.key, e.target.value)} className="h-10 bg-background" />
                  </div>
                ))}
              </div>
            </TabsContent>
            {UHC_TABS.map(itemsTab)}
            {review}
          </div>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          {missingCost.length > 0 && <span className="text-xs text-amber-800">{missingCost.length} selected without a cost</span>}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" onClick={downloadCopy} disabled={saving}>
              <Download className="mr-1.5 h-4 w-4" />
              Download spreadsheet
            </Button>
            <Button variant="outline" onClick={() => save(false)} disabled={saving || !clientId}>
              Save draft
            </Button>
            <Button className="bg-green-600 text-white hover:bg-green-700" onClick={() => save(true)} disabled={saving || !clientId}>
              {saving ? 'Saving…' : 'Complete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
