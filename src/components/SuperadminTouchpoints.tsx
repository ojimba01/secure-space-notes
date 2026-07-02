import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Settings2, ChevronRight, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { useSuperadminCompliance, StaffOverdueRow, StaffMissingRow } from '@/hooks/useSuperadminCompliance';

interface Props {
  onOpenClient: (id: string) => void;
}

type DetailKey = 'overdue' | 'scheduled' | 'completed' | 'remaining' | 'missing';

const lonBadge = (lon: string | null) => {
  if (lon === 'High Level') return <Badge variant="destructive">High</Badge>;
  if (lon === 'Low Level') return <Badge variant="secondary">Low</Badge>;
  return null;
};

const fmtD = (d: string) => format(new Date(`${d}T12:00:00`), 'MMM d');

const Stat: React.FC<{
  icon: React.ReactNode; label: string; value: number; hint: string;
  active?: boolean; onClick?: () => void; tone?: 'danger' | 'default';
}> = ({ icon, label, value, hint, active, onClick, tone = 'default' }) => (
  <button
    onClick={onClick}
    className={`text-left rounded-lg border p-4 transition-colors hover:bg-muted/60 ${active ? 'ring-2 ring-primary' : ''} ${tone === 'danger' && value > 0 ? 'border-red-200 bg-red-50' : ''}`}
  >
    <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-sm">{label}</span></div>
    <div className="text-2xl font-bold mt-1">{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{hint}</div>
  </button>
);

export const SuperadminTouchpoints: React.FC<Props> = ({ onOpenClient }) => {
  const data = useSuperadminCompliance();
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [expanded, setExpanded] = useState(false);

  const overdueByStaff = useMemo(() => {
    const groups: Record<string, StaffOverdueRow[]> = {};
    data.overdueRows.forEach((r) => { (groups[r.staff_name] ||= []).push(r); });
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [data.overdueRows]);

  const missingByStaff = useMemo(() => {
    const groups: Record<string, StaffMissingRow[]> = {};
    data.missingRows.forEach((r) => { (groups[r.staff_name] ||= []).push(r); });
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [data.missingRows]);

  const overdueRow = (r: StaffOverdueRow) => (
    <button key={r.id} onClick={() => onOpenClient(r.id)}
      className="w-full text-left rounded-md border border-red-200 bg-red-50 p-3 hover:bg-red-100 flex items-start justify-between gap-3">
      <div>
        <div className="font-medium flex items-center gap-2">
          {r.client_name} — assigned to {r.staff_name} {lonBadge(r.level_of_need)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Current window: {fmtD(r.windowStart)}–{fmtD(r.windowEnd)}
        </div>
        <div className="text-xs text-red-700 mt-0.5">
          {r.contactDays} of {r.requiredContacts} touchpoints completed · {r.inPersonDays} of {r.requiredInPerson} face-to-face
        </div>
        <ul className="text-xs text-red-700 list-disc pl-4 mt-0.5">
          {r.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
    </button>
  );

  const detailTitle: Record<DetailKey, string> = {
    overdue: 'Overdue / audit risk by staff',
    scheduled: 'Scheduled this week',
    completed: 'Completed this week',
    remaining: 'Remaining this week',
    missing: 'Missing setup information',
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Touchpoints oversight</h1>
        <p className="text-sm text-muted-foreground">Agency-wide view. Identify which staff members are falling behind and who to follow up with.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={<AlertTriangle className="h-5 w-5" />} label="Overdue / audit risk" value={data.overdueRows.length}
          tone="danger" onClick={() => setDetail('overdue')} active={detail === 'overdue'} hint="Clients at risk across all staff" />
        <Stat icon={<CalendarClock className="h-5 w-5" />} label="Scheduled this week" value={data.scheduledThisWeek}
          onClick={() => setDetail('scheduled')} active={detail === 'scheduled'} hint="Touchpoints planned this week" />
        <Stat icon={<CheckCircle2 className="h-5 w-5" />} label="Completed this week" value={data.completedThisWeek}
          onClick={() => setDetail('completed')} active={detail === 'completed'} hint="Logged this week" />
        <Stat icon={<ClipboardList className="h-5 w-5" />} label="Remaining this week" value={data.remainingThisWeek}
          onClick={() => setDetail('remaining')} active={detail === 'remaining'} hint="Scheduled but not logged" />
        <Stat icon={<Settings2 className="h-5 w-5" />} label="Missing setup" value={data.missingRows.length}
          onClick={() => setDetail('missing')} active={detail === 'missing'} hint="Cannot be scheduled yet" />
      </div>

      {/* Overdue / audit risk — hidden when empty, top 3 by default */}
      {data.overdueRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Overdue / audit risk</CardTitle>
            <p className="text-sm text-muted-foreground">Grouped by staff member.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {overdueByStaff.map(([staff, rows]) => {
              const shown = expanded ? rows : rows.slice(0, 3);
              return (
                <div key={staff} className="space-y-2">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    {staff} <Badge variant="outline">{rows.length}</Badge>
                  </div>
                  {shown.map(overdueRow)}
                  {!expanded && rows.length > 3 && (
                    <div className="text-xs text-muted-foreground pl-1">+{rows.length - 3} more…</div>
                  )}
                </div>
              );
            })}
            {data.overdueRows.length > 3 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} className="gap-1">
                {expanded ? 'Show less' : 'View all'}
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Missing setup */}
      {data.missingRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Missing setup information</CardTitle>
            <p className="text-sm text-muted-foreground">These clients cannot be scheduled until setup is complete.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.missingRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="font-medium">{r.client_name} — {r.staff_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.missingDate && r.missingLevelOfNeed
                      ? 'Missing both HSP / authorization start date and level of need'
                      : r.missingDate ? 'Missing HSP / authorization start date' : 'Missing level of need'}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onOpenClient(r.id)}>Open client</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Detail drawer */}
      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detail ? detailTitle[detail] : ''}</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {detail === 'overdue' && (data.overdueRows.length ? data.overdueRows.map(overdueRow) : <p className="text-sm text-muted-foreground">Nothing at risk.</p>)}
            {detail === 'missing' && (data.missingRows.length ? missingByStaff.map(([staff, rows]) => (
              <div key={staff} className="space-y-1">
                <div className="text-sm font-semibold">{staff}</div>
                {rows.map((r) => (
                  <button key={r.id} onClick={() => { setDetail(null); onOpenClient(r.id); }} className="w-full text-left rounded-md border p-2 hover:bg-muted/60 text-sm">
                    {r.client_name}
                  </button>
                ))}
              </div>
            )) : <p className="text-sm text-muted-foreground">No clients missing setup.</p>)}
            {(detail === 'scheduled' || detail === 'completed' || detail === 'remaining') && (
              <p className="text-sm text-muted-foreground">
                {detail === 'scheduled' && `${data.scheduledThisWeek} touchpoints scheduled this week across all staff.`}
                {detail === 'completed' && `${data.completedThisWeek} touchpoints completed this week across all staff.`}
                {detail === 'remaining' && `${data.remainingThisWeek} touchpoints scheduled but not yet logged this week.`}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
