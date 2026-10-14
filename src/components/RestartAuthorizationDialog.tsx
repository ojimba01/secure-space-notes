// Restart a client's authorization after a gap: 30, 150 or 180 days, as the MCO
// approved. What happens is said before it happens. See lib/restartAuthorization.
import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { defaultEndDate, fetchClientAuthorizations, formatAuthDate, type AuthorizationType } from '@/lib/authorizations';
import { FORMS_FOR_RESTART, RESTART_TYPES, gapDays, lastEnd, restartAuthorization } from '@/lib/restartAuthorization';
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

export const RestartAuthorizationDialog: React.FC<Props> = ({ open, onOpenChange, clientId, clientName, onStarted }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [type, setType] = useState<AuthorizationType | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [endEdited, setEndEdited] = useState(false);
  const [number, setNumber] = useState('');
  const [previousEnd, setPreviousEnd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setType(null);
    setStart('');
    setEnd('');
    setEndEdited(false);
    setNumber('');
    fetchClientAuthorizations(clientId)
      .then((rows) => setPreviousEnd(lastEnd(rows)))
      .catch(() => setPreviousEnd(null));
  }, [open, clientId]);

  // The end follows the type and start until somebody sets it by hand.
  useEffect(() => {
    if (!endEdited) setEnd(type && start ? defaultEndDate(type, start) ?? '' : '');
  }, [type, start, endEdited]);

  const gap = useMemo(() => (start ? gapDays(previousEnd, start) : null), [previousEnd, start]);
  const tooEarly = !!(previousEnd && start && start <= previousEnd);
  const forms = type ? FORMS_FOR_RESTART[type] ?? [] : [];
  const label = RESTART_TYPES.find((t) => t.type === type)?.label;

  const submit = async () => {
    if (!type || !start) return;
    setSaving(true);
    try {
      await restartAuthorization({ clientId, type, startDate: start, endDate: end || null, authorizationNumber: number, createdBy: profileId });
      toast({ title: 'Authorization restarted', description: `${clientName}: ${label} authorization from ${formatAuthDate(start)}.` });
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
          <DialogTitle>Restart authorization</DialogTitle>
          <DialogDescription>
            {clientName}
            {previousEnd ? ` · last authorization ended ${formatAuthDate(previousEnd)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What did the MCO approve?</Label>
            <div className="flex gap-2">
              {RESTART_TYPES.map((t) => (
                <Button
                  key={t.type}
                  type="button"
                  variant={type === t.type ? 'default' : 'outline'}
                  className="flex-1"
                  aria-pressed={type === t.type}
                  onClick={() => setType(t.type)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

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

          {type && start && !tooEarly && (
            <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">When you restart</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Earlier authorizations stay on record. Nothing already billed changes.</li>
                <li>Billing starts a new round on {formatAuthDate(start)}.</li>
                <li>
                  Touchpoints start over on {formatAuthDate(start)}
                  {gap ? `; the ${gap}-day gap is cleared` : ''}.
                </li>
                <li>File a new {forms.join(', ').replace(/, ([^,]*)$/, ' and $1')} on the Forms tab.</li>
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !type || !start || tooEarly}>
            {saving ? 'Restarting…' : 'Restart authorization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
