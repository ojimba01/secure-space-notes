// Intake calls: every client whose intake is still to be done, where each
// stands, and who is calling them. Staff see their own clients and report
// each call (No answer) or start the intake once reached. Admins see everyone,
// assign each call to a staff member, and add any client who has no intake.
// Built on the intake call tracking (src/lib/intakeCalls.ts): the same call
// log and statuses the Clients page and the client record use.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { PhoneCall, PhoneMissed, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useCaseManagers } from '@/hooks/useCaseManagers';
import {
  assignIntakeCall,
  clientsWithoutIntake,
  daysSince,
  INTAKE_STATUS_LABEL,
  loadIntakeList,
  markIntakeCallReached,
  OUTCOME_LABEL,
  reassignIntakeCall,
  type IntakeListRow,
  type IntakeStatus,
} from '@/lib/intakeCalls';
import { ReportCallDialog, type ReportCallFor } from './ReportCallDialog';

const STATUS_CLASS: Record<IntakeStatus, string> = {
  not_called: 'bg-destructive/15 text-destructive',
  waiting: 'bg-amber-100 text-amber-900',
  done: 'bg-green-100 text-green-800',
};

const FILTERS: { id: IntakeStatus | 'open'; label: string }[] = [
  { id: 'open', label: 'To do' },
  { id: 'not_called', label: INTAKE_STATUS_LABEL.not_called },
  { id: 'waiting', label: 'Waiting on client' },
  { id: 'done', label: INTAKE_STATUS_LABEL.done },
];

/** The detail under a client's status: the calls so far, or where the intake is. */
export function statusDetail(r: IntakeListRow): string {
  if (r.status === 'done') return r.doneAt ? `Intake completed ${format(new Date(r.doneAt), 'MMM d')}` : 'Intake completed';
  if (r.intakeStarted) return 'Intake started';
  if (!r.calls.length) {
    const d = daysSince(r.since);
    return `Listed ${d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`}`;
  }
  const last = r.calls[0];
  return `${r.calls.length} ${r.calls.length === 1 ? 'call' : 'calls'} · last ${format(new Date(last.called_at), 'MMM d')} (${OUTCOME_LABEL[last.outcome]})`;
}

export const IntakeCallsPage: React.FC<{ onOpenClient: (clientId: string) => void }> = ({ onOpenClient }) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const profileId = useEffectiveProfileId();
  const { rows: staff } = useCaseManagers();
  const [rows, setRows] = useState<IntakeListRow[] | null>(null);
  const [filter, setFilter] = useState<IntakeStatus | 'open'>('open');
  const [reportFor, setReportFor] = useState<ReportCallFor | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    void loadIntakeList()
      .then(setRows)
      .catch((e) => {
        setRows([]);
        toast({ title: 'Could not load intake calls', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      });
  }, [toast]);
  useEffect(load, [load]);

  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const counts = useMemo(() => {
    const c = { not_called: 0, waiting: 0, done: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((r) => (filter === 'open' ? r.status !== 'done' : r.status === filter));

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
        {FILTERS.map((f) => {
          const n = f.id === 'open' ? counts.not_called + counts.waiting : counts[f.id];
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
              }`}
            >
              {f.label} <span className="ml-1 opacity-80">{n}</span>
            </button>
          );
        })}
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : shown.length === 0 ? (
        <p className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
          {filter === 'done' ? 'No intakes completed in the last two weeks.' : 'No intake calls to make.'}
        </p>
      ) : (
        <div className="divide-y rounded-lg border bg-background">
          {shown.map((r) => (
            <div key={r.clientId} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] md:items-center">
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
                  {r.status === 'waiting' ? 'Waiting on client' : INTAKE_STATUS_LABEL[r.status]}
                </Badge>
                <p className="mt-1 truncate text-xs text-muted-foreground">{statusDetail(r)}</p>
              </div>
              <div className="min-w-0 text-sm">
                {isAdmin && r.status !== 'done' ? (
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
                {r.status !== 'done' && !r.intakeStarted && (
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
              </div>
            </div>
          ))}
        </div>
      )}

      <ReportCallDialog target={reportFor} onClose={() => setReportFor(null)} onSaved={load} />
      {adding && <AddToListDialog staff={staff} onClose={() => setAdding(false)} onAdded={load} />}
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
