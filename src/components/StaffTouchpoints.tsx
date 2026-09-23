// My touchpoints — a case manager's own work queue.
//
// In the order somebody actually works: what needs following up, what is on
// this week, where each 30-day cycle stands, and the monthly log that falls
// out of all of it. A client appears here as soon as they have a start date;
// nothing else is a reason to hide their work from the person doing it.
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { CalendarClock, CalendarSync, CheckCircle2, Plus } from 'lucide-react';
import {
  useMyCompliance, ScheduledTouchpoint, CycleRow,
} from '@/hooks/useMyCompliance';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { CaseLog } from '@/components/CaseLog';
import { useViewAs } from '@/components/ViewAsProvider';
import { AddTouchpointDialog, TouchpointContext } from '@/components/AddTouchpointDialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  todayAgency, daysBetween, touchpointTypeLabel, contactMethodLabel,
  CycleStatus, CYCLE_STATUS_LABEL, CYCLE_STATUS_CLASS, DUE_SOON_DAYS,
} from '@/lib/compliance';
import { format } from 'date-fns';

interface Props {
  onOpenClient: (clientId: string) => void;
}

const fmtDay = (d: string) => format(new Date(`${d}T12:00:00`), 'EEE, MMM d');
const fmtShort = (d: string) => format(new Date(`${d}T12:00:00`), 'MMM d');

const statusBadge = (s: CycleStatus) => (
  <Badge className={CYCLE_STATUS_CLASS[s]}>{CYCLE_STATUS_LABEL[s]}</Badge>
);

/** A scheduled touchpoint reported in the same four statuses as a cycle. */
const touchpointStatus = (t: ScheduledTouchpoint, today: string): CycleStatus => {
  if (t.status === 'completed') return 'completed';
  const daysOut = daysBetween(today, t.date);
  if (daysOut < 0) return 'overdue';
  if (daysOut <= DUE_SOON_DAYS) return 'due_soon';
  return 'incomplete';
};

const lonBadge = (lon: string | null) =>
  lon ? <Badge variant="outline" className="text-[11px]">{lon}</Badge> : null;

export const StaffTouchpoints: React.FC<Props> = ({ onOpenClient }) => {
  const effectiveProfileId = useEffectiveProfileId();
  const { guardWrite } = useViewAs();
  const { toast } = useToast();
  const data = useMyCompliance(effectiveProfileId);
  const today = todayAgency();
  // The name that goes in the Case Manager blank at the top of the form.
  const [myName, setMyName] = useState('');
  useEffect(() => {
    if (!effectiveProfileId) return;
    let cancelled = false;
    void supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', effectiveProfileId)
      .maybeSingle()
      .then(({ data: p }) => {
        if (cancelled || !p) return;
        setMyName(`${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email);
      });
    return () => { cancelled = true; };
  }, [effectiveProfileId]);

  const [addOpen, setAddOpen] = useState(false);
  const [addContext, setAddContext] = useState<TouchpointContext | null>(null);

  const [moveTp, setMoveTp] = useState<ScheduledTouchpoint | null>(null);
  const [moveDate, setMoveDate] = useState('');

  const openAdd = (ctx: TouchpointContext | null) => {
    setAddContext(ctx);
    setAddOpen(true);
  };

  const addFromTouchpoint = (t: ScheduledTouchpoint) =>
    openAdd({
      clientId: t.client_id,
      clientName: t.client_name,
      levelOfNeed: t.level_of_need,
      locked: true,
      calendarEventId: t.id,
      date: daysBetween(t.date, today) > 0 ? today : t.date,
      contactMethod: t.modality,
      touchpointType: t.touchpoint_type,
    });

  const addFromCycle = (c: CycleRow) =>
    c.nextScheduled
      ? addFromTouchpoint(c.nextScheduled)
      : openAdd({
          clientId: c.client_id,
          clientName: c.client_name,
          levelOfNeed: c.level_of_need,
          locked: true,
          date: today,
          contactMethod: c.remainingInPerson > 0 ? 'in_person' : 'phone',
        });

  const openMove = (t: ScheduledTouchpoint) => {
    setMoveTp(t);
    setMoveDate(t.date);
  };

  const submitMove = async () => {
    if (!moveTp || !moveDate) return;
    if (guardWrite()) { setMoveTp(null); return; }
    const iso = new Date(`${moveDate}T12:00:00`).toISOString();
    await supabase.from('calendar_events').update({
      start_time: iso, end_time: iso, is_manually_adjusted: true,
    }).eq('id', moveTp.id);
    toast({ title: 'Touchpoint moved', description: 'Manual moves are preserved.' });
    setMoveTp(null);
    data.refresh();
  };

  /**
   * Every row names a client and opens that client. It used to carry a button
   * saying so, on every row of every section — a column of identical controls
   * restating what the row was for. The row is the control now; the buttons
   * still on it stop the click from reaching it.
   */
  const openOnClick = (clientId: string) => ({
    role: 'button' as const,
    tabIndex: 0,
    title: 'Open this client',
    onClick: () => onOpenClient(clientId),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenClient(clientId);
      }
    },
  });

  /** Anything clickable sitting on a clickable row. */
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const tpRow = (t: ScheduledTouchpoint) => (
    <div
      key={t.id}
      {...openOnClick(t.client_id)}
      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
    >
      <div className="min-w-0">
        <div className="font-medium truncate">{t.client_name}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
          {lonBadge(t.level_of_need)}
          <span>{fmtDay(t.date)}</span>
          <span>· {contactMethodLabel(t.modality)}</span>
          {t.touchpoint_type && <span>· {touchpointTypeLabel(t.touchpoint_type)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {statusBadge(touchpointStatus(t, today))}
        {t.status !== 'completed' && (
          <Button size="sm" variant="outline" onClick={() => addFromTouchpoint(t)}>Add touchpoint</Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { stop(e); openMove(t); }}
          title="Reschedule"
          aria-label="Reschedule this touchpoint"
        >
          <CalendarSync className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My touchpoints</h1>
          <p className="text-muted-foreground">Your work queue and your monthly log.</p>
        </div>
        <Button className="gap-2" onClick={() => openAdd(null)}>
          <Plus className="h-4 w-4" />
          Add touchpoint
        </Button>
      </div>

      {/* The plan deadline. First, because it is the one that runs out
          soonest and the one people miss: the authorization runs 30 days but
          the plan is due on the 25th. */}
      {data.hspDueSoon.length > 0 && (
        <Card className="border-amber-400">
          <CardHeader>
            <CardTitle className="text-lg text-amber-900">
              Housing Stabilization Plan due
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              The plan is due on the 25th day of the initial authorization, not its last day.
              These have not been submitted yet.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.hspDueSoon.map((h) => (
              <div
                key={h.clientId}
                {...openOnClick(h.clientId)}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100"
              >
                <div>
                  <div className="font-medium">{h.clientName}</div>
                  <div className="text-xs text-muted-foreground">Due {h.dueDate}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={h.daysLeft < 0 ? 'destructive' : 'secondary'}>
                    {h.daysLeft < 0
                      ? `${Math.abs(h.daysLeft)} day${Math.abs(h.daysLeft) === 1 ? '' : 's'} late`
                      : h.daysLeft === 0
                        ? 'Due today'
                        : `Due in ${h.daysLeft} day${h.daysLeft === 1 ? '' : 's'}`}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* One queue, not three.
          Needs follow-up, Upcoming this week and Touchpoint cycles were three
          readings of the same days: a cycle closing, a touchpoint scheduled
          inside it, and the cycle's own progress bar. Whichever you read, the
          work was the same work. This is the month, in order, and the status on
          each row says everything the other two sections were saying. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            This month
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fmtShort(data.monthStart)}–{fmtShort(data.monthEnd)} · {data.completedThisWeek} logged this week.
            Full detail is on your calendar.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.upcomingThisMonth.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled this month. Touchpoints appear here once a client has
              an authorization start date.
            </p>
          ) : data.upcomingThisMonth.map(tpRow)}
        </CardContent>
      </Card>

      {/* The week's log, filled from the touchpoints above it. It sits last
          because it is the end of the week's work, and it is here rather than
          on its own screen so nobody has to go looking for a form that is
          already written. */}
      {effectiveProfileId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">HMIS case log</CardTitle>
            <p className="text-sm text-muted-foreground">
              Filled from what you have logged. Check it, then submit it at the end of each work week.
            </p>
          </CardHeader>
          <CardContent>
            <CaseLog employeeId={effectiveProfileId} caseManagerName={myName} />
          </CardContent>
        </Card>
      )}

      <AddTouchpointDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        context={addContext}
        onSaved={data.refresh}
      />

      {/* Reschedule */}
      <Dialog open={!!moveTp} onOpenChange={(o) => !o && setMoveTp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reschedule touchpoint — {moveTp?.client_name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New date</Label>
              <Input type="date" value={moveDate} min={today} onChange={(e) => setMoveDate(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">Drag to reschedule. Manual moves are preserved.</p>
          </div>
          <DialogFooter>
            <Button onClick={submitMove}>Save move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
