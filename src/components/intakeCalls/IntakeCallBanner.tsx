// On a client's record while they wait for their intake call: the calls so
// far, and the two things to do next.
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { PhoneCall, PhoneMissed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { loadIntakeCalls, markIntakeCallReached, OUTCOME_LABEL, type IntakeCall } from '@/lib/intakeCalls';
import { ReportCallDialog } from './ReportCallDialog';

export const IntakeCallBanner: React.FC<{
  clientId: string;
  clientName: string;
  /** The client was reached: reload the record and open its forms. */
  onReached: () => void;
}> = ({ clientId, clientName, onReached }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [calls, setCalls] = useState<IntakeCall[]>([]);
  const [reporting, setReporting] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    void loadIntakeCalls([clientId])
      .then((m) => setCalls((m.get(clientId) ?? []).filter((c) => c.outcome !== 'answered')))
      .catch(() => setCalls([]));
  }, [clientId, key]);

  const start = async () => {
    if (!profileId) return;
    try {
      await markIntakeCallReached(clientId, profileId);
      onReached();
    } catch (e) {
      toast({ title: 'Could not start the intake', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-amber-400 bg-amber-50/60 p-4">
      <div>
        <p className="flex items-center gap-2 font-semibold text-amber-900">
          <PhoneCall className="h-4 w-4" />
          Awaiting intake call
        </p>
        <p className="text-sm text-muted-foreground">
          {calls.length === 0
            ? 'No call reported yet'
            : calls
                .slice(0, 3)
                .map((c) => `${format(new Date(c.called_at), 'MMM d, h:mm a')} (${OUTCOME_LABEL[c.outcome]})`)
                .join(' · ') + (calls.length > 3 ? ` · ${calls.length - 3} more` : '')}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="border-amber-400 bg-white" onClick={() => setReporting(true)}>
          <PhoneMissed className="mr-2 h-4 w-4" />
          No answer
        </Button>
        <Button onClick={() => void start()}>
          <PhoneCall className="mr-2 h-4 w-4" />
          Start intake
        </Button>
      </div>
      <ReportCallDialog
        target={reporting ? { kind: 'existing', clientId, clientName } : null}
        onClose={() => setReporting(false)}
        onSaved={() => setKey((k) => k + 1)}
      />
    </div>
  );
};
