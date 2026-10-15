// Restart a client's authorization after a gap: 30, 150 or 180 days, as the MCO
// approved. The type and start date can wait: the restart is then pending until
// somebody adds them. What happens is said before it happens. See
// lib/restartAuthorization.
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { UndoRestartButton } from '@/components/UndoRestartButton';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { defaultEndDate, fetchClientAuthorizations, formatAuthDate, type AuthorizationType } from '@/lib/authorizations';
import {
  FORMS_FOR_RESTART,
  RESTART_TYPES,
  gapDays,
  lastEnd,
  pendingRestart,
  restartAuthorization,
  type PendingRestart,
} from '@/lib/restartAuthorization';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onStarted: () => void;
}

/** One answer among several: bordered and raised so it reads as a button, filled when chosen. */
const Choice: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, onClick, children }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`h-11 flex-1 whitespace-nowrap rounded-md border-2 px-2 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
      selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:border-primary/60 hover:bg-muted'
    }`}
  >
    {children}
  </button>
);

const list = (items: string[]) => items.join(', ').replace(/, ([^,]*)$/, ' and $1');

export const RestartAuthorizationDialog: React.FC<Props> = ({ open, onOpenChange, clientId, clientName, onStarted }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [type, setType] = useState<AuthorizationType | null>(null);
  const [hasDate, setHasDate] = useState(true);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [endEdited, setEndEdited] = useState(false);
  const [number, setNumber] = useState('');
  const [previousEnd, setPreviousEnd] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRestart | null>(null);
  const [closed, setClosed] = useState(false);
  const [undecided, setUndecided] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(null);
    setHasDate(true);
    setStart('');
    setEnd('');
    setEndEdited(false);
    setNumber('');
    setPending(null);
    setClosed(false);
    setUndecided(false);
    setCanUndo(false);
    fetchClientAuthorizations(clientId)
      .then((rows) => setPreviousEnd(lastEnd(rows)))
      .catch(() => setPreviousEnd(null));
    supabase
      .from('clients')
      .select('restart_pending_at, restart_pending_type, status, restart_undo')
      .eq('id', clientId)
      .maybeSingle()
      .then(({ data }) => {
        const p = pendingRestart(data);
        setClosed(data?.status === 'closed');
        setCanUndo(!!data?.restart_undo);
        setPending(p);
        if (p?.type) setType(p.type);
      });
  }, [open, clientId]);

  // The end follows the type and start until somebody sets it by hand.
  useEffect(() => {
    if (!endEdited) setEnd(type && start ? defaultEndDate(type, start) ?? '' : '');
  }, [type, start, endEdited]);

  // Finishing a pending restart needs both; starting one can do without.
  const complete = !!(type && hasDate && start);
  const gap = useMemo(() => (start && hasDate ? gapDays(previousEnd, start) : null), [previousEnd, start, hasDate]);
  const tooEarly = !!(hasDate && previousEnd && start && start <= previousEnd);
  const forms = type ? FORMS_FOR_RESTART[type] ?? [] : [];
  const label = RESTART_TYPES.find((t) => t.type === type)?.label;
  const canSubmit = !saving && !tooEarly && (pending ? complete : complete || (!hasDate && (!!type || undecided)));

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const result = await restartAuthorization({
        clientId,
        type,
        startDate: complete ? start : null,
        endDate: complete ? end || null : null,
        authorizationNumber: number,
        createdBy: profileId,
      });
      toast(
        result.pending
          ? { title: 'Restart pending', description: `${clientName}: add the start date when the approval arrives.` }
          : { title: 'Authorization restarted', description: `${clientName}: ${label} authorization from ${formatAuthDate(start)}.` },
      );
      onOpenChange(false);
      onStarted();
    } catch (err) {
      toast({ title: 'Could not restart the authorization', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{pending ? 'Complete restart' : 'Restart authorization'}</DialogTitle>
          <DialogDescription>
            {clientName}
            {pending
              ? ` · restart pending since ${formatAuthDate(pending.since.slice(0, 10))}`
              : previousEnd
                ? ` · last authorization ended ${formatAuthDate(previousEnd)}`
                : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What did the MCO approve?</Label>
            <div className="flex flex-wrap gap-2">
              {RESTART_TYPES.map((t) => (
                <Choice
                  key={t.type}
                  selected={type === t.type}
                  onClick={() => {
                    setType(t.type);
                    setUndecided(false);
                  }}
                >
                  {t.label}
                </Choice>
              ))}
              {!pending && (
                <Choice
                  selected={undecided}
                  onClick={() => {
                    setType(null);
                    setUndecided(true);
                    setHasDate(false);
                  }}
                >
                  Not decided
                </Choice>
              )}
            </div>
          </div>

          {!pending && (
            <div className="space-y-1.5">
              <Label>Do you have the start date?</Label>
              <div className="flex gap-2">
                <Choice selected={hasDate} onClick={() => setHasDate(true)}>
                  Yes
                </Choice>
                <Choice selected={!hasDate} onClick={() => setHasDate(false)}>
                  Not yet
                </Choice>
              </div>
            </div>
          )}

          {hasDate && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="restart-start">Start date</Label>
                  <Input id="restart-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="restart-end">End date</Label>
                  <Input
                    id="restart-end"
                    type="date"
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      setEndEdited(true);
                    }}
                  />
                </div>
              </div>
              {tooEarly && <p className="text-sm text-destructive">The start date has to be after {formatAuthDate(previousEnd)}.</p>}

              <div className="space-y-1.5">
                <Label htmlFor="restart-number">Authorization number</Label>
                <Input id="restart-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
              </div>
            </>
          )}

          {complete && !tooEarly && (
            <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">When you submit</p>
              <ul className="list-disc space-y-1 pl-5">
                {closed && <li>The case is reopened.</li>}
                <li>Earlier authorizations stay on record. Nothing already billed changes.</li>
                <li>Billing starts a new round on {formatAuthDate(start)}.</li>
                <li>
                  Touchpoints start over on {formatAuthDate(start)}
                  {gap ? `; the ${gap}-day gap is cleared` : ''}.
                </li>
                <li>File a new {list(forms)} on the Forms tab.</li>
              </ul>
            </div>
          )}

          {!pending && !complete && !hasDate && (
            <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">When you submit</p>
              <ul className="list-disc space-y-1 pl-5">
                {closed && <li>The case is reopened.</li>}
                <li>Earlier authorizations stay on record. Nothing already billed changes.</li>
                <li>The client shows Restart pending. Billing and touchpoints wait.</li>
                <li>{forms.length ? `File a new ${list(forms)} on the Forms tab.` : 'The forms needed show once the type is chosen.'}</li>
                <li>Add the start date when the approval arrives.</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {pending && canUndo ? (
            <UndoRestartButton
              clientId={clientId}
              clientName={clientName}
              onUndone={() => {
                onOpenChange(false);
                onStarted();
              }}
            />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit} className="bg-green-600 text-white hover:bg-green-700">
              {saving ? 'Saving…' : 'Submit'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
