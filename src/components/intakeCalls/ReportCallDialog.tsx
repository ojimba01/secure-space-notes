// Report an intake call nobody answered: for a new client, with what is known
// about them, or for one already waiting on their call.
import React, { useEffect, useState } from 'react';
import { PhoneMissed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import {
  NO_ANSWER_OUTCOMES,
  addUnreachedClient,
  logIntakeCall,
  type CallOutcome,
} from '@/lib/intakeCalls';

export type ReportCallFor =
  | { kind: 'new'; prefill?: { first_name?: string; last_name?: string; phone?: string } }
  | { kind: 'existing'; clientId: string; clientName: string };

interface Props {
  target: ReportCallFor | null;
  onClose: () => void;
  onSaved: (client: { id: string; name: string }) => void;
}

const blank = { first_name: '', last_name: '', phone: '', auth_30_number: '', address: '', email: '' };

export const ReportCallDialog: React.FC<Props> = ({ target, onClose, onSaved }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [values, setValues] = useState(blank);
  const [outcome, setOutcome] = useState<CallOutcome>('no_answer');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setValues({ ...blank, ...(target.kind === 'new' ? target.prefill : {}) });
    setOutcome('no_answer');
  }, [target]);

  if (!target) return null;
  const isNew = target.kind === 'new';
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));
  const ready = !isNew || (values.first_name.trim() && values.last_name.trim() && values.phone.trim());

  const save = async () => {
    if (!profileId || !ready) return;
    setSaving(true);
    try {
      const client =
        target.kind === 'new'
          ? await addUnreachedClient({ ...values, assigned_employee_id: profileId }, profileId, outcome)
          : (await logIntakeCall(target.clientId, profileId, outcome), { id: target.clientId, name: target.clientName });
      toast({ title: 'Call reported', description: `${client.name} is waiting for their intake call.` });
      onSaved(client);
      onClose();
    } catch (e) {
      toast({
        title: 'Could not report the call',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const field = (k: keyof typeof blank, label: string, required = false, wide = false) => (
    <div className={`space-y-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={`rc-${k}`} className="text-sm font-medium">
        {label}
        {!required && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </label>
      <Input id={`rc-${k}`} value={values[k]} onChange={set(k)} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneMissed className="h-5 w-5 text-amber-600" />
            {isNew ? 'Report unanswered call' : `Report unanswered call: ${target.clientName}`}
          </DialogTitle>
        </DialogHeader>

        {isNew && (
          <div className="grid gap-3 sm:grid-cols-2">
            {field('first_name', 'First name', true)}
            {field('last_name', 'Last name', true)}
            {field('phone', 'Phone', true)}
            {field('auth_30_number', '30-day authorization #')}
            {field('address', 'Address', false, true)}
            {field('email', 'Email', false, true)}
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-medium">What happened?</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened?">
            {NO_ANSWER_OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={outcome === o.value}
                onClick={() => setOutcome(o.value)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  outcome === o.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || !ready}>
            {saving ? 'Saving…' : 'Report call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
