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
import { CalendarClock, CalendarSync, ChevronRight, FileClock, Plus } from 'lucide-react';
import {
  useMyCompliance, ScheduledTouchpoint,
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
      className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-6 py-3.5 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold text-foreground">{t.client_name}</div>
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
    <div className="mx-auto max-w-[1280px] space-y-6 p-4 md:px-9 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="animate-rise text-2xl md:text-[32px] font-semibold tracking-tight text-foreground">My touchpoints</h1>
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
        <div className="animate-rise overflow-hidden rounded-xl border border-attention-border/70 bg-attention-soft">
          <div className="flex items-start gap-4 p-5">
            <div aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-attention-tile text-attention">
              <FileClock className="h-5 w-5 animate-[wiggle_600ms_ease-in-out_400ms_1]" />
            </div>
            <div>
              <h2 className="text-[17px] font-semibold text-foreground">Housing Stabilization Plan due</h2>
              <p className="mt-0.5 text-sm text-foreground/70">
                The plan is due on the 25th day of the initial authorization, not its last day.
              </p>
            </div>
          </div>
          <div className="divide-y divide-attention-border/50 border-t border-attention-border/60 bg-card/60">
            {data.hspDueSoon.map((h) => (
              <div
                key={h.clientId}
                {...openOnClick(h.clientId)}
                className="group flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-3.5 transition-colors hover:bg-card"
              >
                <div>
                  <div className="text-[15px] font-semibold text-foreground">{h.clientName}</div>
                  <div className="text-xs text-muted-foreground">Due {fmtDay(h.dueDate)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={h.daysLeft < 0 ? CYCLE_STATUS_CLASS.overdue : CYCLE_STATUS_CLASS.due_soon}>
                    {h.daysLeft < 0
                      ? `${Math.abs(h.daysLeft)} day${Math.abs(h.daysLeft) === 1 ? '' : 's'} late`
                      : h.daysLeft === 0
                        ? 'Due today'
                        : `Due in ${h.daysLeft} day${h.daysLeft === 1 ? '' : 's'}`}
                  </Badge>
                  <ChevronRight className="nudge h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* One queue, not three.
          Needs follow-up, Upcoming this week and Touchpoint cycles were three
          readings of the same days: a cycle closing, a touchpoint scheduled
          inside it, and the cycle's own progress bar. Whichever you read, the
          work was the same work. This is the month, in order, and the status on
          each row says everything the other two sections were saying. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            This month
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {fmtShort(data.monthStart)}–{fmtShort(data.monthEnd)} · {data.completedThisWeek} logged this week
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {data.loading ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Loading…</p>
          ) : data.upcomingThisMonth.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nothing scheduled this month. Touchpoints appear here once a client has
              an authorization start date.
            </p>
          ) : (
            <div className="stagger divide-y divide-border/70 border-t border-border">{data.upcomingThisMonth.map(tpRow)}</div>
          )}
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
          </div>
          <DialogFooter>
            <Button onClick={submitMove}>Save move</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
