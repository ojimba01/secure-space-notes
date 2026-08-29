import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSuperadminCompliance } from '@/hooks/useSuperadminCompliance';
import { todayAgency } from '@/lib/compliance';
import {
  loadExpiringClaims,
  loadHspPicture,
  loadStaffTouchpointRows,
  setStaffGoLive,
  type ExpiringClaim,
  type HspPicture,
  type StaffTouchpointRow,
} from '@/lib/adminDashboard';

interface Props {
  onOpenClient: (clientId: string) => void;
}

const money = (n: number | null) =>
  n === null || n === undefined ? '—' : `$${Number(n).toLocaleString()}`;

/**
 * The three things Shade manages, in the order they can go wrong permanently.
 *
 * A billing deadline that passes cannot be recovered, so it is first. A
 * touchpoint missed this week can be made up. A plan submitted late is already
 * late, but the next one need not be.
 */
export const ShadeDashboard: React.FC<Props> = ({ onOpenClient }) => {
  const { toast } = useToast();
  const compliance = useSuperadminCompliance();
  const [claims, setClaims] = useState<ExpiringClaim[]>([]);
  const [hsp, setHsp] = useState<HspPicture | null>(null);
  const [staff, setStaff] = useState<StaffTouchpointRow[]>([]);
  const [loading, setLoading] = useState(true);

  const overdueByStaff = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of compliance.overdueRows) {
      map.set(row.staff_id, (map.get(row.staff_id) ?? 0) + 1);
    }
    return map;
  }, [compliance.overdueRows]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [claimRows, hspPicture, staffRows] = await Promise.all([
        loadExpiringClaims(60),
        loadHspPicture(),
        loadStaffTouchpointRows(overdueByStaff),
      ]);
      setClaims(claimRows);
      setHsp(hspPicture);
      setStaff(staffRows);
    } catch (err: any) {
      toast({ title: 'Could not load the dashboard', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overdueByStaff]);

  useEffect(() => {
    if (!compliance.loading) load();
  }, [compliance.loading, load]);

  const start = async (row: StaffTouchpointRow, date: string | null) => {
    try {
      await setStaffGoLive(row.profileId, date);
      setStaff((rows) =>
        rows.map((r) => (r.profileId === row.profileId ? { ...r, goLive: date } : r)),
      );
      toast({
        title: date ? `${row.name} starts on ${date}` : `${row.name} is not started`,
      });
    } catch (err: any) {
      toast({ title: 'Could not save that', description: err.message, variant: 'destructive' });
    }
  };

  const today = todayAgency();
  const past = claims.filter((c) => c.daysLeft < 0);
  const within30 = claims.filter((c) => c.daysLeft >= 0 && c.daysLeft <= 30);
  const within60 = claims.filter((c) => c.daysLeft > 30);
  const valueWithin30 = within30.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------ claims ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Claims running out of time to file
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A claim can be filed for six months after its cycle ends. After that the money
            cannot be recovered.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <Figure label="Past the deadline" value={past.length} tone={past.length ? 'bad' : 'plain'} />
            <Figure label="Within 30 days" value={within30.length} tone={within30.length ? 'warn' : 'plain'} />
            <Figure label="Within 60 days" value={within60.length} tone="plain" />
          </div>

          {within30.length > 0 && (
            <p className="text-sm">
              <span className="font-medium">{money(valueWithin30)}</span> stops being claimable
              within 30 days.
            </p>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading.</p>
          ) : claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing is due to expire in the next 60 days.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {claims.slice(0, 25).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenClient(c.clientId)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate">
                    {c.clientName}
                    <span className="text-muted-foreground">
                      {' '}· cycle {c.cycleNumber ?? '—'} · {money(c.amount)}
                    </span>
                  </span>
                  <Badge
                    variant="secondary"
                    className={
                      c.daysLeft < 0
                        ? 'bg-destructive/15 text-destructive'
                        : c.daysLeft <= 30
                          ? 'bg-amber-100 text-amber-900'
                          : ''
                    }
                  >
                    {c.daysLeft < 0
                      ? `${Math.abs(c.daysLeft)} days past`
                      : `${c.daysLeft} days left`}
                  </Badge>
                </button>
              ))}
              {claims.length > 25 && (
                <p className="p-2.5 text-xs text-muted-foreground">
                  {claims.length - 25} more, in Billing.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------- touchpoints --------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Touchpoints, by case manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A case manager's clients begin to count from the date you set here. Before it,
            their touchpoints exist and are visible but are not counted as late. Set the
            date once they have been shown how touchpoints work.
          </p>

          {staff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No case manager has clients.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Case manager</th>
                    <th className="px-3 py-2 font-medium">Clients</th>
                    <th className="px-3 py-2 font-medium">Behind</th>
                    <th className="px-3 py-2 font-medium">Shown how</th>
                    <th className="px-3 py-2 font-medium">Counting from</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((row) => {
                    const live = !!row.goLive && row.goLive <= today;
                    return (
                      <tr key={row.profileId} className="border-t">
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.clients}</td>
                        <td className="px-3 py-2">
                          {!live ? (
                            <span className="text-muted-foreground">Not yet expected</span>
                          ) : row.overdueClients > 0 ? (
                            <Badge variant="secondary" className="bg-destructive/15 text-destructive">
                              {row.overdueClients}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">None</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.acknowledgedAt ? (
                            new Date(row.acknowledgedAt).toLocaleDateString()
                          ) : (
                            <span className="text-muted-foreground">Not yet</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="date"
                              value={row.goLive ?? ''}
                              onChange={(e) => start(row, e.target.value || null)}
                              className="h-8 w-[150px]"
                            />
                            {row.goLive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => start(row, null)}
                                title="Stop counting this person's touchpoints"
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------- HSP --------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Housing Stabilization Plans against day 25</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A plan is due on the 25th day of the initial 30-day authorization. A client with
            a 150 or 180-day authorization number is treated as submitted.
          </p>

          <div className="grid grid-cols-3 gap-3">
            <Figure
              label="Overdue, not submitted"
              value={hsp?.overdue.length ?? 0}
              tone={hsp?.overdue.length ? 'bad' : 'plain'}
            />
            <Figure
              label="Due within 5 days"
              value={hsp?.dueSoon.length ?? 0}
              tone={hsp?.dueSoon.length ? 'warn' : 'plain'}
            />
            <Figure label="Submitted late" value={hsp?.submittedLate.length ?? 0} tone="plain" />
          </div>

          {(hsp?.unknownDate ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              {hsp?.unknownDate} plans were submitted before the date was recorded, so their
              punctuality is unknown. Plans submitted from now on are timed.
            </p>
          )}

          {[...(hsp?.overdue ?? []), ...(hsp?.dueSoon ?? [])].length > 0 && (
            <div className="divide-y rounded-md border">
              {[...(hsp?.overdue ?? []), ...(hsp?.dueSoon ?? [])].slice(0, 15).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onOpenClient(r.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/50"
                >
                  <span className="truncate">{r.clientName}</span>
                  <Badge
                    variant="secondary"
                    className={r.daysLate > 0 ? 'bg-destructive/15 text-destructive' : 'bg-amber-100 text-amber-900'}
                  >
                    {r.daysLate > 0 ? `${r.daysLate} days over` : `due ${r.dueDate}`}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Figure: React.FC<{ label: string; value: number; tone: 'plain' | 'warn' | 'bad' }> = ({
  label,
  value,
  tone,
}) => (
  <div className="rounded-md border p-3">
    <div
      className={`text-2xl font-semibold ${
        tone === 'bad' ? 'text-destructive' : tone === 'warn' ? 'text-amber-700' : ''
      }`}
    >
      {value}
    </div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </div>
);
