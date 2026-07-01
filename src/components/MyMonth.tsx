import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Target, CalendarClock, CheckCircle2, ChevronRight } from 'lucide-react';
import { InfoHint } from '@/components/InfoHint';
import { useMyCompliance, ClientCompliance } from '@/hooks/useMyCompliance';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { supabase } from '@/integrations/supabase/client';
import { startOfWeek, endOfWeek, format } from 'date-fns';

interface Props {
  onOpenClient: (clientId: string) => void;
}

interface UpcomingTouchpoint {
  id: string;
  title: string;
  start_time: string;
  client_id: string | null;
}

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }> = ({ icon, label, value, hint }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-full bg-primary/10 p-2 text-primary">{icon}</div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {label}
          {hint && <InfoHint text={hint} />}
        </div>
      </div>
    </CardContent>
  </Card>
);

const clientRow = (c: ClientCompliance, onOpen: (id: string) => void) => (
  <button
    key={c.id}
    onClick={() => onOpen(c.id)}
    className="w-full flex items-center justify-between rounded-md border p-3 text-left hover:bg-accent transition-colors"
  >
    <div>
      <div className="font-medium">{c.first_name} {c.last_name}</div>
      <div className="text-xs text-muted-foreground">
        {c.level_of_need || 'No tier'} · Contacts {c.contactDays}/{c.requiredContacts}
        {c.requiredInPerson > 0 && ` · In-person ${c.inPersonSpaced}/${c.requiredInPerson}`}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {c.status === 'behind' && <Badge className="bg-red-600 text-white hover:bg-red-600">Needs attention</Badge>}
      {c.status === 'complete' && <Badge className="bg-green-600 text-white hover:bg-green-600">Complete</Badge>}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  </button>
);

export const MyMonth: React.FC<Props> = ({ onOpenClient }) => {
  const effectiveProfileId = useEffectiveProfileId();
  const data = useMyCompliance(effectiveProfileId);
  const [upcoming, setUpcoming] = useState<UpcomingTouchpoint[]>([]);

  useEffect(() => {
    if (!effectiveProfileId) return;
    const from = startOfWeek(new Date(), { weekStartsOn: 1 });
    const to = endOfWeek(new Date(), { weekStartsOn: 1 });
    (async () => {
      const { data: rows } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, client_id')
        .eq('employee_id', effectiveProfileId)
        .eq('event_type', 'touch_point')
        .gte('start_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .order('start_time', { ascending: true });
      setUpcoming((rows as UpcomingTouchpoint[]) ?? []);
    })();
  }, [effectiveProfileId]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monthly touchpoints</h1>
        <p className="text-muted-foreground">Track required client contacts for the current month.</p>
      </div>

      {data.behindCount >= 5 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{data.behindCount} clients need attention</AlertTitle>
          <AlertDescription>
            You cannot add new clients until those touchpoints are completed and your count drops below 5.
          </AlertDescription>
        </Alert>
      ) : data.behindCount >= 3 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{data.behindCount} clients need attention</AlertTitle>
          <AlertDescription>
            Catch up soon. If you reach 5, you will not be able to add new clients until those touchpoints are completed.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Target className="h-5 w-5" />}
          label="Weekly target"
          value={data.weeklyTarget}
          hint="The number of client touchpoints you should complete each week to stay on pace across all your clients this month."
        />
        <Stat
          icon={<CalendarClock className="h-5 w-5" />}
          label="Due this week"
          value={data.touchpointsDueThisWeek}
          hint="Clients whose next required touchpoint falls within this week (Monday–Sunday)."
        />
        <Stat
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="On track"
          value={data.caseload > 0 ? `${data.onTrackCount} of ${data.caseload}` : '—'}
          hint="Clients who have met their required contacts so far this month, out of your total caseload."
        />
        <Stat
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Needs attention"
          value={data.behindCount}
          hint="Clients who are behind on their required contacts for this month."
        />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Scheduled this week</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No touchpoints scheduled this week.</p>
          ) : (
            upcoming.map((e) => (
              <button
                key={e.id}
                onClick={() => e.client_id && onOpenClient(e.client_id)}
                className="w-full flex items-center justify-between rounded-md border p-3 text-left hover:bg-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-500" />
                  <span className="font-medium text-sm">{e.title}</span>
                </div>
                <span className="text-xs text-muted-foreground">{format(new Date(e.start_time), 'EEE, MMM d')}</span>
              </button>
            ))
          )}
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Due this week</CardTitle>
          <p className="text-sm text-muted-foreground">Clients whose next required touchpoint falls within this week.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.dueClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">No touchpoints due this week.</p>
          ) : (
            data.dueClients.map((c) => clientRow(c, onOpenClient))
          )}
        </CardContent>
      </Card>

      {data.caseload > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Clients that need attention</CardTitle>
            <p className="text-sm text-muted-foreground">Clients who are behind on their required contacts for this month.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.behindClients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients need attention.</p>
            ) : (
              data.behindClients.map((c) => clientRow(c, onOpenClient))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
