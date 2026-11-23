// Intake calls: every new member from the first call to a reviewed package.
//
//   Not called yet -> Waiting on client -> Ready for review -> Reviewed
//
// Staff see their own clients: they report each call (No answer) or start the
// intake once reached, then complete the package (Client Intake, IAT, LON,
// HSP). Admins see everyone, assign each call to a staff member, add any
// client who has no intake, and review each package: open a form, comment on
// a wrong answer (the staff member is notified), and mark it reviewed.
// Built on the intake call tracking (src/lib/intakeCalls.ts): the same call
// log and statuses the Clients page and the client record use.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, MessageSquare, PhoneCall, PhoneMissed, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useCaseManagers } from '@/hooks/useCaseManagers';
import { TemplateFillDialog } from '@/components/forms/TemplateFillDialog';
import type { FormRow } from '@/components/forms/FormsHub';
import {
  assignIntakeCall,
  clientsWithoutIntake,
  daysSince,
  INTAKE_STATUS_LABEL,
  INTAKE_STATUS_SHORT,
  loadIntakeList,
  markFormsReviewed,
  markIntakeCallReached,
  OUTCOME_LABEL,
  reassignIntakeCall,
  type IntakeListRow,
  type IntakeStatus,
  type PackageForm,
} from '@/lib/intakeCalls';
import { ReportCallDialog, type ReportCallFor } from './ReportCallDialog';

export const STATUS_CLASS: Record<IntakeStatus, string> = {
  not_called: 'bg-destructive/15 text-destructive',
  waiting: 'bg-amber-100 text-amber-900',
  review: 'bg-blue-100 text-blue-900',
  reviewed: 'bg-green-100 text-green-800',
};

type Filter = IntakeStatus | 'calls';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'calls', label: 'Calls to make' },
  { id: 'not_called', label: INTAKE_STATUS_SHORT.not_called },
  { id: 'waiting', label: INTAKE_STATUS_SHORT.waiting },
  { id: 'review', label: INTAKE_STATUS_SHORT.review },
  { id: 'reviewed', label: INTAKE_STATUS_SHORT.reviewed },
];
const inFilter = (r: IntakeListRow, f: Filter) => (f === 'calls' ? r.status === 'not_called' || r.status === 'waiting' : r.status === f);

/** The detail under a client's status. */
export function statusDetail(r: IntakeListRow): string {
  if (r.status === 'reviewed') return 'Package reviewed';
  if (r.status === 'review') {
    const left = r.forms.filter((f) => f.state === 'not_started' || f.state === 'draft').map((f) => f.short);
    return left.length ? `Still to complete: ${left.join(', ')}` : 'All forms completed';
  }
  if (r.intakeStarted) return 'Intake started';
  if (!r.calls.length) {
    const d = daysSince(r.since);
    return `Listed ${d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`}`;
  }
  const last = r.calls[0];
  return `${r.calls.length} ${r.calls.length === 1 ? 'call' : 'calls'} · last ${format(new Date(last.called_at), 'MMM d')} (${OUTCOME_LABEL[last.outcome]})`;
}

const FORM_CHIP: Record<PackageForm['state'], { cls: string; label: string }> = {
  not_started: { cls: 'border-dashed text-muted-foreground', label: 'Not started' },
  draft: { cls: 'border-amber-300 bg-amber-50 text-amber-900', label: 'Draft' },
  completed: { cls: 'border-blue-300 bg-blue-50 text-blue-900', label: 'To review' },
  reviewed: { cls: 'border-green-300 bg-green-50 text-green-800', label: 'Reviewed' },
};

export const IntakeCallsPage: React.FC<{ onOpenClient: (clientId: string) => void }> = ({ onOpenClient }) => {
  const { toast } = useToast();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const profileId = useEffectiveProfileId();
  const { rows: staff } = useCaseManagers();
  const [rows, setRows] = useState<IntakeListRow[] | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [reportFor, setReportFor] = useState<ReportCallFor | null>(null);
  const [adding, setAdding] = useState(false);
  const [opening, setOpening] = useState<PackageForm | null>(null);
  const [signerName, setSignerName] = useState('');

  // Admins land on the packages to review, staff on their calls to make.
  const active: Filter = filter ?? (isAdmin ? 'review' : 'calls');

  const load = useCallback(() => {
    void loadIntakeList()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast({ title: 'Could not load intake calls', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      });
  }, [toast]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!profileId) return;
    void supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', profileId)
      .maybeSingle()
      .then(({ data }) => setSignerName(`${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim()));
  }, [profileId]);

  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const count = (f: Filter) => (rows ?? []).filter((r) => inFilter(r, f)).length;
  const shown = (rows ?? []).filter((r) => inFilter(r, active));

  const start = async (r: IntakeListRow) => {
    if (!profileId) return;
    try {
      await markIntakeCallReached(r.clientId, profileId);
      onOpenClient(r.clientId);
    } catch (e) {
      toast({ title: 'Could not start the intake', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const assign = async (r: IntakeListRow, managerId: string) => {
    try {
      await reassignIntakeCall(r.clientId, managerId);
      toast({ title: `Assigned to ${staffName.get(managerId) ?? 'staff member'}` });
      load();
    } catch (e) {
      toast({ title: 'Could not assign the call', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  const review = async (forms: PackageForm[]) => {
    if (!profileId) return;
    const ids = forms.filter((f) => f.state === 'completed' && f.row).map((f) => String(f.row!.id));
    try {
      await markFormsReviewed(ids, profileId);
      load();
    } catch (e) {
      toast({ title: 'Could not mark it reviewed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  if (adminLoading) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-primary md:text-3xl">Intake calls</h1>
        {isAdmin && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add client
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Status">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={active === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active === f.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            }`}
          >
            {f.label} <span className="ml-1 opacity-80">{count(f.id)}</span>
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
          {active === 'review'
            ? 'No packages to review.'
            : active === 'reviewed'
              ? 'No packages reviewed in the last two weeks.'
              : 'No intake calls to make.'}
        </p>
      ) : (
        <div className="divide-y rounded-lg border bg-background">
          {shown.map((r) => {
            const inReview = r.status === 'review' || r.status === 'reviewed';
            const toReview = r.forms.filter((f) => f.state === 'completed');
            return (
              <div key={r.clientId} className="space-y-3 p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <button type="button" onClick={() => onOpenClient(r.clientId)} className="font-medium hover:underline">
                      {r.name}
                    </button>
                    {r.phone && (
                      <a href={`tel:${r.phone}`} className="block text-sm text-muted-foreground hover:underline">
                        {r.phone}
                      </a>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Badge variant="secondary" className={STATUS_CLASS[r.status]} title={INTAKE_STATUS_LABEL[r.status]}>
                      {INTAKE_STATUS_SHORT[r.status]}
                    </Badge>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{statusDetail(r)}</p>
                  </div>
                  <div className="min-w-0 text-sm">
                    {isAdmin && !inReview ? (
                      <Select value={r.managerId ?? undefined} onValueChange={(v) => void assign(r, v)}>
                        <SelectTrigger className="h-9" aria-label={`Assign the call for ${r.name}`}>
                          <SelectValue placeholder="Assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {staff.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-muted-foreground">{(r.managerId && staffName.get(r.managerId)) || 'Unassigned'}</span>
                    )}
                  </div>
                  <div className="flex gap-2 md:justify-end">
                    {!inReview && !r.intakeStarted && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-amber-400"
                          onClick={() => setReportFor({ kind: 'existing', clientId: r.clientId, clientName: r.name })}
                        >
                          <PhoneMissed className="mr-1.5 h-4 w-4" />
                          No answer
                        </Button>
                        <Button size="sm" onClick={() => void start(r)}>
                          <PhoneCall className="mr-1.5 h-4 w-4" />
                          Start intake
                        </Button>
                      </>
                    )}
                    {r.intakeStarted && (
                      <Button size="sm" variant="outline" onClick={() => onOpenClient(r.clientId)}>
                        Open intake
                      </Button>
                    )}
                    {isAdmin && r.status === 'review' && toReview.length > 0 && (
                      <Button size="sm" onClick={() => void review(toReview)}>
                        <Check className="mr-1.5 h-4 w-4" />
                        Mark reviewed
                      </Button>
                    )}
                  </div>
                </div>

                {inReview && (
                  <div className="flex flex-wrap gap-2">
                    {r.forms.map((f) => {
                      const chip = FORM_CHIP[f.state];
                      return (
                        <button
                          key={f.type}
                          type="button"
                          disabled={!f.row || !!f.row.form_data}
                          onClick={() => setOpening(f)}
                          title={f.row ? `Open the ${f.type}` : `${f.type}: not started`}
                          className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors enabled:hover:shadow-sm disabled:cursor-default ${chip.cls}`}
                        >
                          {f.state === 'reviewed' && <Check className="h-3.5 w-3.5" />}
                          <span className="font-medium">{f.short}</span>
                          <span className="text-xs opacity-80">{chip.label}</span>
                          {f.openComments > 0 && (
                            <span className="flex items-center gap-0.5 rounded-full bg-red-600 px-1.5 text-xs text-white" title="Comments to fix">
                              <MessageSquare className="h-3 w-3" />
                              {f.openComments}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ReportCallDialog target={reportFor} onClose={() => setReportFor(null)} onSaved={load} />
      {adding && <AddToListDialog staff={staff} onClose={() => setAdding(false)} onAdded={load} />}
      {opening?.row && profileId && (
        <TemplateFillDialog
          existing={opening.row as unknown as FormRow}
          profileId={profileId}
          signerName={signerName || 'Admin'}
          onClose={() => {
            setOpening(null);
            load();
          }}
          onSubmitted={() => {
            // An admin who saves a form after reading it through has reviewed it.
            if (isAdmin && opening.state === 'completed') void review([opening]);
            else load();
          }}
        />
      )}
    </div>
  );
};

/** An admin puts a client who has no intake on the list, with the staff member to call them. */
const AddToListDialog: React.FC<{
  staff: { id: string; name: string }[];
  onClose: () => void;
  onAdded: () => void;
}> = ({ staff, onClose, onAdded }) => {
  const { toast } = useToast();
  const [clients, setClients] = useState<{ id: string; name: string; managerId: string | null }[] | null>(null);
  const [search, setSearch] = useState('');
  const [clientId, setClientId] = useState<string | null>(null);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void clientsWithoutIntake().then(setClients).catch(() => setClients([]));
  }, []);

  const matches = (clients ?? []).filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 50);

  const save = async () => {
    if (!clientId || !managerId) return;
    setSaving(true);
    try {
      await assignIntakeCall(clientId, managerId);
      toast({ title: 'Added to intake calls' });
      onAdded();
      onClose();
    } catch (e) {
      toast({ title: 'Could not add the client', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add client to intake calls</DialogTitle>
        </DialogHeader>
        <Input placeholder="Search clients without an intake" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {clients === null ? (
            <p className="p-3 text-sm text-muted-foreground">Loading.</p>
          ) : matches.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No clients without an intake.</p>
          ) : (
            matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setClientId(c.id);
                  setManagerId((m) => m ?? c.managerId);
                }}
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-muted ${clientId === c.id ? 'bg-primary/10 font-medium' : ''}`}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
        <Select value={managerId ?? undefined} onValueChange={setManagerId}>
          <SelectTrigger aria-label="Staff member to call">
            <SelectValue placeholder="Staff member to call" />
          </SelectTrigger>
          <SelectContent>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!clientId || !managerId || saving}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
