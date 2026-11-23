// Clients waiting for their intake call, at the top of the Clients page. Each
// shows how long it has waited and the calls made so far, with the two things
// to do next: report a call nobody answered, or start the intake.
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Phone, PhoneCall, PhoneMissed, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { restoreClosedCase } from '@/lib/reopenCase';
import { cn } from '@/lib/utils';
import { daysSince, loadIntakeCalls, OUTCOME_LABEL, type IntakeCall } from '@/lib/intakeCalls';

export interface AwaitingClient {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  created_at?: string;
  assigned_employee_id?: string | null;
}

interface Props {
  clients: AwaitingClient[];
  /** Bumped after a call is reported, to read the calls again. */
  refreshKey: number;
  managerName?: (id: string | null | undefined) => string | null;
  onOpen: (client: AwaitingClient) => void;
  onReportCall: (client: AwaitingClient) => void;
  onStartIntake: (client: AwaitingClient) => void;
  /** After a client is closed out (or the close is undone), to read the list again. */
  onClosedOut?: () => void;
}

/** Why the agency is no longer waiting for this client, as close_case records it. */
const CLOSE_OUT_REASONS = ['Lost Contact', 'Moved', 'Transferred to Other Agency', 'Other'] as const;

const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`);

export const AwaitingIntakeCalls: React.FC<Props> = ({
  clients,
  refreshKey,
  managerName,
  onOpen,
  onReportCall,
  onStartIntake,
  onClosedOut,
}) => {
  const [calls, setCalls] = useState<Map<string, IntakeCall[]>>(new Map());
  const { toast } = useToast();
  /** The client whose X was pressed, waiting on the warning. */
  const [closing, setClosing] = useState<AwaitingClient | null>(null);
  const [reason, setReason] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const closeOut = async () => {
    if (!closing || !reason) return;
    const c = closing;
    const name = `${c.first_name} ${c.last_name}`.trim();
    setSaving(true);
    const { error } = await supabase.rpc('close_case', {
      _client_id: c.id,
      _reason: reason,
      _closed_date: new Date().toISOString().slice(0, 10),
      _notes: 'Closed out before the intake call.',
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not close out', description: error.message, variant: 'destructive' });
      return;
    }
    setClosing(null);
    setReason('');
    onClosedOut?.();
    toast({
      title: 'Closed out',
      description: `${name} is no longer waiting for an intake call.`,
      action: (
        <ToastAction
          altText="Undo"
          onClick={async () => {
            try {
              await restoreClosedCase(c.id);
              onClosedOut?.();
            } catch {
              toast({ title: 'Unable to undo', description: 'An administrator can reopen the case from Clients.', variant: 'destructive' });
            }
          }}
        >
          Undo
        </ToastAction>
      ),
    });
  };

  useEffect(() => {
    if (!clients.length) return;
    void loadIntakeCalls(clients.map((c) => c.id)).then(setCalls).catch(() => setCalls(new Map()));
  }, [clients, refreshKey]);

  if (!clients.length) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-5 w-5 text-attention" />
        <h2 className="text-lg font-semibold">Awaiting intake call</h2>
        <span className="rounded-full bg-attention-tile px-2 py-0.5 text-xs font-medium text-attention">{clients.length}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
        {clients.map((c) => {
          const made = (calls.get(c.id) ?? []).filter((x) => x.outcome !== 'answered');
          const last = made[0];
          const waited = c.created_at ? daysSince(c.created_at) : 0;
          const manager = managerName?.(c.assigned_employee_id);
          return (
            <div key={c.id} className="lift relative flex flex-col gap-3 rounded-xl border border-attention-border bg-attention-soft p-5">
              <button
                type="button"
                onClick={() => setClosing(c)}
                className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-attention/70 transition-colors hover:bg-attention-tile hover:text-attention"
                aria-label={`Close out ${c.first_name} ${c.last_name}`}
                title="Close out"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="min-w-0 pr-6">
                <button type="button" onClick={() => onOpen(c)} className="text-left text-lg font-semibold hover:underline">
                  {c.first_name} {c.last_name}
                </button>
                {c.phone && (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {c.phone}
                  </p>
                )}
                {manager && <p className="text-sm text-muted-foreground">Case manager: {manager}</p>}
              </div>
              <div className="text-sm">
                <p className="font-medium text-attention">Added {ago(waited)}</p>
                <p className={made.length ? 'text-muted-foreground' : 'font-medium text-danger'}>
                  {made.length === 0
                    ? 'No call reported yet'
                    : `${made.length} ${made.length === 1 ? 'call' : 'calls'} · last ${format(new Date(last.called_at), 'MMM d, h:mm a')} (${OUTCOME_LABEL[last.outcome]})`}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button variant="outline" className="flex-1 border-attention-border bg-white" onClick={() => onReportCall(c)}>
                  <PhoneMissed className="mr-2 h-4 w-4" />
                  No answer
                </Button>
                <Button className="flex-1" onClick={() => onStartIntake(c)}>
                  <PhoneCall className="mr-2 h-4 w-4" />
                  Start intake
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!closing} onOpenChange={(o) => { if (!o) { setClosing(null); setReason(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close out {closing?.first_name} {closing?.last_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They will no longer be waiting for an intake call, and their case will be closed. An admin can reopen it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Reason</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
              {CLOSE_OUT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={reason === r}
                  onClick={() => setReason(r)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-[13px] transition-all active:scale-[0.97]',
                    reason === r ? 'border-primary bg-accent font-semibold text-primary' : 'border-input bg-card font-medium hover:border-primary/40',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep waiting</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!reason || saving}
              onClick={(e) => { e.preventDefault(); void closeOut(); }}
            >
              {saving ? 'Closing out…' : 'Close out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
