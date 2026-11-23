// Clients waiting for their intake call, at the top of the Clients page. Each
// shows how long it has waited and the calls made so far, with the two things
// to do next: report a call nobody answered, or start the intake.
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Phone, PhoneCall, PhoneMissed } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
}

const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`);

export const AwaitingIntakeCalls: React.FC<Props> = ({
  clients,
  refreshKey,
  managerName,
  onOpen,
  onReportCall,
  onStartIntake,
}) => {
  const [calls, setCalls] = useState<Map<string, IntakeCall[]>>(new Map());

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
            <div key={c.id} className="lift flex flex-col gap-3 rounded-xl border border-attention-border bg-attention-soft p-5">
              <div className="min-w-0">
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
    </section>
  );
};
