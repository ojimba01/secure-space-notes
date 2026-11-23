// Clients waiting for their intake call, for a supervisor: who has not been
// called at all first, then who has been called without an answer.
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { daysSince, loadIntakeCalls, OUTCOME_LABEL, type IntakeCall } from '@/lib/intakeCalls';

interface Row {
  id: string;
  name: string;
  manager: string;
  waited: number;
  calls: IntakeCall[];
}

export const IntakeCallsCard: React.FC<{ onOpenClient: (clientId: string) => void }> = ({ onOpenClient }) => {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name, created_at, assigned_employee_id')
        .eq('intake_call_status' as never, 'awaiting' as never)
        .eq('status', 'active')
        .is('deleted_at', null);
      const clients = (data ?? []) as { id: string; first_name: string; last_name: string; created_at: string; assigned_employee_id: string | null }[];
      const [calls, profiles] = await Promise.all([
        loadIntakeCalls(clients.map((c) => c.id)).catch(() => new Map<string, IntakeCall[]>()),
        supabase.from('profiles').select('id, first_name, last_name'),
      ]);
      const names = new Map((profiles.data ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]));
      const out = clients.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        manager: (c.assigned_employee_id && names.get(c.assigned_employee_id)) || 'Unassigned',
        waited: daysSince(c.created_at),
        calls: (calls.get(c.id) ?? []).filter((x) => x.outcome !== 'answered'),
      }));
      // Not called at all first, longest waiting first.
      out.sort((a, b) => (a.calls.length === 0 ? 0 : 1) - (b.calls.length === 0 ? 0 : 1) || b.waited - a.waited);
      setRows(out);
    })();
  }, []);

  const notCalled = (rows ?? []).filter((r) => r.calls.length === 0).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Intake calls</CardTitle>
        {rows && rows.length > 0 && (
          <p className="text-sm">
            {rows.length} waiting. {notCalled} not called yet.
          </p>
        )}
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every client has had their intake call.</p>
        ) : (
          <div className="divide-y rounded-md border">
            {rows.slice(0, 10).map((r) => {
              const last = r.calls[0];
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpenClient(r.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/50"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.manager}
                      {last ? ` · last call ${format(new Date(last.called_at), 'MMM d')} (${OUTCOME_LABEL[last.outcome]})` : ''}
                    </span>
                  </span>
                  {r.calls.length === 0 ? (
                    <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                      Not called · {r.waited === 0 ? 'today' : `${r.waited} ${r.waited === 1 ? 'day' : 'days'}`}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-900">
                      {r.calls.length} {r.calls.length === 1 ? 'call' : 'calls'}, no answer
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
