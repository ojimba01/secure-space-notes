// Intake calls on the admin dashboard: where every intake stands, by status
// and by staff member, so a supervisor can check on the calls at a glance.
// The same list as the Intake calls page (loadIntakeList).
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { INTAKE_STATUS_SHORT, loadIntakeList, type IntakeListRow, type IntakeStatus } from '@/lib/intakeCalls';
import { STATUS_CLASS, statusDetail } from '@/components/intakeCalls/IntakeCallsPage';

export const IntakeCallsCard: React.FC<{ onOpenClient: (clientId: string) => void }> = ({ onOpenClient }) => {
  const navigate = useNavigate();
  const [rows, setRows] = useState<IntakeListRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void loadIntakeList().then(setRows).catch(() => setRows([]));
    void supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .then(({ data }) => setNames(new Map((data ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]))));
  }, []);

  const counts = useMemo(() => {
    const c: Record<IntakeStatus, number> = { not_called: 0, waiting: 0, review: 0, reviewed: 0 };
    for (const r of rows ?? []) c[r.status]++;
    return c;
  }, [rows]);

  /** Each staff member's open calls: not called yet, and waiting on the client. */
  const byStaff = useMemo(() => {
    const m = new Map<string, { name: string; not_called: number; waiting: number }>();
    for (const r of rows ?? []) {
      if (r.status !== 'not_called' && r.status !== 'waiting') continue;
      const key = r.managerId ?? '';
      const e = m.get(key) ?? { name: (r.managerId && names.get(r.managerId)) || 'Unassigned', not_called: 0, waiting: 0 };
      e[r.status]++;
      m.set(key, e);
    }
    return [...m.values()].sort((a, b) => b.not_called - a.not_called || b.waiting - a.waiting);
  }, [rows, names]);

  // Packages to review first, then calls not made, then those waiting on the client.
  const rank: Record<IntakeStatus, number> = { review: 0, not_called: 1, waiting: 2, reviewed: 3 };
  const open = (rows ?? []).filter((r) => r.status !== 'reviewed').sort((a, b) => rank[a.status] - rank[b.status]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-lg">Intake calls</CardTitle>
        <Button variant="link" className="h-auto p-0" onClick={() => navigate('/', { state: { view: 'intakes' } })}>
          View all
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['not_called', 'waiting', 'review', 'reviewed'] as IntakeStatus[]).map((s) => (
                <div key={s} className={`rounded-md p-2.5 ${STATUS_CLASS[s]}`}>
                  <div className="text-2xl font-semibold leading-none">{counts[s]}</div>
                  <div className="mt-1 text-xs font-medium">{INTAKE_STATUS_SHORT[s]}</div>
                </div>
              ))}
            </div>

            {byStaff.length > 0 && (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-1 text-left font-medium">Staff</th>
                    <th className="pb-1 text-right font-medium">Not called</th>
                    <th className="pb-1 text-right font-medium">Waiting</th>
                  </tr>
                </thead>
                <tbody>
                  {byStaff.map((s) => (
                    <tr key={s.name} className="border-t">
                      <td className="py-1.5">{s.name}</td>
                      <td className={`py-1.5 text-right ${s.not_called ? 'font-semibold text-destructive' : ''}`}>{s.not_called}</td>
                      <td className="py-1.5 text-right">{s.waiting}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {open.length === 0 ? (
              <p className="text-sm text-muted-foreground">No intake calls or packages to review.</p>
            ) : (
              <div className="divide-y rounded-md border">
                {open.slice(0, 6).map((r) => (
                  <button
                    key={r.clientId}
                    type="button"
                    onClick={() => onOpenClient(r.clientId)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{r.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {(r.managerId && names.get(r.managerId)) || 'Unassigned'} · {statusDetail(r)}
                      </span>
                    </span>
                    <Badge variant="secondary" className={STATUS_CLASS[r.status]}>
                      {INTAKE_STATUS_SHORT[r.status]}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
