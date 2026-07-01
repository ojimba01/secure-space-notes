import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Target, CalendarClock, CheckCircle2, ChevronRight } from 'lucide-react';
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

const Stat: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = ({ icon, label, value }) => (
  <Card>
    <CardContent className="p-4 flex items-center gap-3">
      <div className="rounded-full bg-primary/10 p-2 text-primary">{icon}</div>
      <div>
        <div className="text-2xl font-bold leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
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
      {c.status === 'behind' && <Badge className="bg-red-600 text-white hover:bg-red-600">Behind</Badge>}
      {c.status === 'complete' && <Badge className="bg-green-600 text-white hover:bg-green-600">Complete</Badge>}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  </button>
);

export const MyMonth: React.FC<Props> = ({ onOpenClient }) => {
  const effectiveProfileId = useEffectiveProfileId();
  const data = useMyCompliance(effectiveProfileId);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Month</h1>
        <p className="text-muted-foreground">Your monthly touch-point compliance at a glance.</p>
      </div>

      {data.behindCount >= 5 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>You're behind on {data.behindCount} clients</AlertTitle>
          <AlertDescription>
            You can't add new clients until you complete those touch-points and drop back below 5 behind.
          </AlertDescription>
        </Alert>
      ) : data.behindCount >= 3 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>You're behind on {data.behindCount} clients</AlertTitle>
          <AlertDescription>
            Catch up soon. If you reach 5, you won't be able to add new clients until those touch-points are completed.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<Target className="h-5 w-5" />} label="Weekly client target (caseload ÷ 4)" value={data.weeklyTarget} />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label="Touch-points due this week" value={data.touchpointsDueThisWeek} />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="On track this month" value={`${data.onTrackCount} / ${data.caseload}`} />
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Behind clients" value={data.behindCount} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Due for a touch point this week</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.dueClients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due this week. Nice work.</p>
          ) : (
            data.dueClients.map((c) => clientRow(c, onOpenClient))
          )}
        </CardContent>
      </Card>

      {data.behindClients.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg text-red-600">Behind clients</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.behindClients.map((c) => clientRow(c, onOpenClient))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
