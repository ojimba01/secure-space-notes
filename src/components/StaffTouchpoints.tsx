// The staff touchpoint work queue.
//
// Three sections, in the order a case manager actually works: what a supervisor
// would chase, what is on this week, and where each client's 30-day cycle
// stands. Clients with incomplete setup never appear — that is Admin work.
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { CalendarClock, CheckCircle2, ChevronRight, MoveRight, Plus } from 'lucide-react';
import {
  useMyCompliance, ScheduledTouchpoint, CycleRow, SupervisorReminder,
} from '@/hooks/useMyCompliance';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
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

  const tpRow = (t: ScheduledTouchpoint) => (
    <div key={t.id} className="flex items-center justify-between rounded-md border p-3 gap-2">
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
        <Button size="sm" variant="ghost" onClick={() => openMove(t)} title="Reschedule">
          <MoveRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onOpenClient(t.client_id)} title="Open client">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const reminderRow = (r: SupervisorReminder, cleared = false) => (
    <div
      key={r.id}
      className={`flex items-center justify-between rounded-md border p-3 gap-2 ${
        cleared ? 'border-green-200 bg-green-50'
          : r.status === 'overdue' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-2">
          {cleared && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
          <span className="truncate">{r.client_name}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {r.message} · cycle ends {fmtShort(r.dueDate)}
        </div>
        {r.touchpoint && !cleared && (
          <div className="text-xs text-muted-foreground mt-0.5">
            Already scheduled for {fmtDay(r.touchpoint.date)} — no need to add another.
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {statusBadge(cleared ? 'completed' : r.status)}
        {!cleared && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              r.touchpoint
                ? addFromTouchpoint(r.touchpoint)
                : openAdd({ clientId: r.client_id, clientName: r.client_name, locked: true, date: today })
            }
          >
            Add touchpoint
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onOpenClient(r.client_id)} title="Open client">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const cycleRow = (c: CycleRow) => (
    <div key={c.client_id} className="flex items-center justify-between rounded-md border p-3 gap-2">
      <div className="min-w-0">
        <div className="font-medium flex items-center gap-2 truncate">
          {c.client_name} {lonBadge(c.level_of_need)}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {fmtShort(c.windowStart)} – {fmtShort(c.windowEnd)} · {c.contactDays} of {c.requiredContacts} touchpoints
          {c.requiredInPerson > 0 && ` · ${c.inPersonDays} of ${c.requiredInPerson} in person`}
        </div>
        {c.isPreGoLive && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Cycle began before {fmtShort(data.goLiveDate)} — shown for reference, not counted against you.
          </div>
        )}
        {c.reasons.length > 0 && (
          <ul className="text-xs text-red-700 list-disc pl-4 mt-0.5">
            {c.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {statusBadge(c.status)}
        {c.status !== 'completed' && (
          <Button size="sm" variant="outline" onClick={() => addFromCycle(c)}>Add touchpoint</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => onOpenClient(c.client_id)} title="Open client">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Touchpoints</h1>
          <p className="text-muted-foreground">Your touchpoint work queue.</p>
        </div>
        <Button className="gap-2" onClick={() => openAdd(null)}>
          <Plus className="h-4 w-4" />
          Add touchpoint
        </Button>
      </div>

      {/* Supervisor reminders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Supervisor reminders</CardTitle>
          <p className="text-sm text-muted-foreground">Clients who need follow-up before their cycle closes.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.reminders.length === 0 && data.clearedReminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing needs following up right now.</p>
          ) : (
            <>
              {data.reminders.map((r) => reminderRow(r))}
              {data.clearedReminders.map((r) => reminderRow(r, true))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Upcoming this week */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Upcoming this week
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {data.completedThisWeek} completed · {data.remainingThisWeek.length} still to do. Full detail is on your calendar.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.upcomingThisWeek.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled this week.</p>
          ) : data.upcomingThisWeek.map(tpRow)}
        </CardContent>
      </Card>

      {/* Touchpoint cycles */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Touchpoint cycles</CardTitle>
          <p className="text-sm text-muted-foreground">
            Where each client stands in their current 30-day cycle.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.cycles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.loading ? 'Loading…' : 'No clients are ready for touchpoints yet.'}
            </p>
          ) : data.cycles.map(cycleRow)}
        </CardContent>
      </Card>

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
