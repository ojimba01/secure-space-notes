// Team touchpoints — the supervisory view, organised around people.
//
// It used to lead with five numbers spanning the whole agency. A number like
// that answers no question a supervisor actually has: they want to know who is
// behind and how their month is going, and "11 overdue" names nobody. So the
// case managers are the page now, the totals are a strip above them, and
// pressing a name opens that person's weekly HMIS Case Log.
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { useSuperadminCompliance, StaffOverdueRow } from '@/hooks/useSuperadminCompliance';
import { useCaseManagers, type CaseManagerRow } from '@/hooks/useCaseManagers';
import { useTeamWeek } from '@/hooks/useTeamWeek';
import { CaseLog } from '@/components/CaseLog';
import { CaseLogArchive } from '@/components/CaseLogArchive';
import { monthKey, monthLabel } from '@/lib/caseLog';

interface Props {
  onOpenClient: (id: string) => void;
}

const lonBadge = (lon: string | null) => {
  if (lon === 'High Level') return <Badge variant="destructive">High</Badge>;
  if (lon === 'Low Level') return <Badge variant="secondary">Low</Badge>;
  return null;
};

const fmtD = (d: string) => format(new Date(`${d}T12:00:00`), 'MMM d');

const MODALITY: Record<string, string> = {
  in_person: 'In person',
  phone: 'Phone',
  virtual: 'Video',
};

/** One number, said plainly. These support the page; they are not the page. */
const Stat: React.FC<{ icon: React.ReactNode; label: string; value: number; hint: string; tone?: 'danger' }> = ({
  icon, label, value, hint, tone,
}) => (
  <div className={`rounded-lg border p-3 ${tone === 'danger' && value > 0 ? 'border-red-200 bg-red-50' : ''}`}>
    <div className="flex items-center gap-2 text-muted-foreground">{icon}<span className="text-xs">{label}</span></div>
    <div className="mt-0.5 text-xl font-bold">{value}</div>
    <div className="text-[11px] text-muted-foreground">{hint}</div>
  </div>
);

export const SuperadminTouchpoints: React.FC<Props> = ({ onOpenClient }) => {
  const data = useSuperadminCompliance();
  const month = useMemo(() => monthKey(new Date()), []);
  const managers = useCaseManagers(month);
  const week = useTeamWeek();
  const [open, setOpen] = useState<CaseManagerRow | null>(null);
  const [expanded, setExpanded] = useState(false);

  const overdueByStaffId = useMemo(() => {
    const counts: Record<string, number> = {};
    data.overdueRows.forEach((r) => { counts[r.staff_id] = (counts[r.staff_id] ?? 0) + 1; });
    return counts;
  }, [data.overdueRows]);

  const overdueByStaff = useMemo(() => {
    const groups: Record<string, StaffOverdueRow[]> = {};
    data.overdueRows.forEach((r) => { (groups[r.staff_name] ||= []).push(r); });
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  }, [data.overdueRows]);

  const overdueRow = (r: StaffOverdueRow) => (
    <button key={r.id} onClick={() => onOpenClient(r.id)}
      className="flex w-full items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100">
      <div>
        <div className="flex items-center gap-2 font-medium">
          {r.client_name} {lonBadge(r.level_of_need)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Current cycle: {fmtD(r.windowStart)}–{fmtD(r.windowEnd)}
        </div>
        <div className="mt-0.5 text-xs text-red-700">
          {r.inPersonDays > 0 ? 'Visit done' : 'No in-person visit this cycle'}
        </div>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Team touchpoints</h1>
        <p className="text-sm text-muted-foreground">
          Every case manager, their month, and the log they hand in each week.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={<AlertTriangle className="h-4 w-4" />} label="Overdue" value={data.overdueRows.length} tone="danger" hint="Across all staff" />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={data.completedThisWeek} hint="Logged this week" />
        <Stat icon={<CalendarClock className="h-4 w-4" />} label="Scheduled" value={data.scheduledThisWeek} hint="For this week" />
        <Stat icon={<ClipboardList className="h-4 w-4" />} label="Logged" value={managers.rows.reduce((n, r) => n + r.logged, 0)} hint={monthLabel(month)} />
      </div>

      <CaseLogArchive managers={managers.rows} />

      {/* Replaces "Incomplete setups": what came in, rather than what is missing. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Logged this week</CardTitle>
          <p className="text-sm text-muted-foreground">
            {fmtD(week.weekStart)}–{fmtD(week.weekEnd)}. Every touchpoint staff have recorded.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {week.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!week.loading && week.contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing logged yet this week. Touchpoints appear here as staff record them.
            </p>
          )}
          {week.contacts.map((c) => (
            <button key={c.id} onClick={() => onOpenClient(c.clientId)}
              className="flex w-full items-center justify-between gap-3 rounded-md border p-2.5 text-left transition-colors hover:border-primary/50 hover:bg-muted/40">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{c.clientName} — {c.staffName}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtD(c.date)} · {MODALITY[c.modality] ?? c.modality}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Case managers</CardTitle>
          <p className="text-sm text-muted-foreground">
            Press a name to open their case log for this week.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {managers.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!managers.loading && managers.rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No active staff.</p>
          )}
          {managers.rows.map((m) => {
            const overdue = overdueByStaffId[m.id] ?? 0;
            return (
              <button key={m.id} onClick={() => setOpen(m)}
                className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40">
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {m.clients} {m.clients === 1 ? 'client' : 'clients'}
                    {overdue > 0 && <span className="text-red-700"> · {overdue} overdue</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={m.logged > 0 ? 'secondary' : 'outline'} className="font-normal">
                    {m.logged} logged
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>

      {data.overdueRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-red-600">Overdue</CardTitle>
            <p className="text-sm text-muted-foreground">Grouped by case manager.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {overdueByStaff.map(([staff, rows]) => {
              const shown = expanded ? rows : rows.slice(0, 3);
              return (
                <div key={staff} className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {staff} <Badge variant="outline">{rows.length}</Badge>
                  </div>
                  {shown.map(overdueRow)}
                  {!expanded && rows.length > 3 && (
                    <div className="pl-1 text-xs text-muted-foreground">+{rows.length - 3} more…</div>
                  )}
                </div>
              );
            })}
            {data.overdueRows.length > 3 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : 'View all'}
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) { setOpen(null); managers.refresh(); } }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>HMIS Case Log — {open?.name}</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              {/* An administrator reads a log. They do not rewrite somebody
                  else's account of their own week. */}
              <CaseLog employeeId={open.id} caseManagerName={open.name} readOnly />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
