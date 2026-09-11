import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** How many of today's events are shown before Next. */
const TODAY_PAGE = 5;

/** Set once somebody ticks "Don't ask again" on removing a touchpoint. */
const SKIP_DELETE_ASK_KEY = 'calendar.skipTouchpointDeleteConfirm';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock, Trash2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { AddCalendarEventDialog } from './AddCalendarEventDialog';
import { EditCalendarEventDialog } from './EditCalendarEventDialog';
import { useViewAs } from '@/components/ViewAsProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { todayAgency } from '@/lib/compliance';
import { isCaseClosed } from '@/lib/workflow';
import {
  authPhaseOn,
  AUTH_PHASE_DOT,
  AUTH_PHASE_LABEL,
  AUTH_PHASE_TINT,
  type AuthorizationSpans,
} from '@/lib/compliance';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: string;
  status: string;
  client_id: string | null;
  employee_id: string;
  profiles?: {
    first_name: string | null;
    last_name: string | null;
  };
  is_auto_generated?: boolean;
  clients?: ({
    first_name: string;
    last_name: string;
    status: string | null;
    workflow_stage: string | null;
  } & AuthorizationSpans) | null;
}

interface CaseManagerCalendarProps {
  /** Open a client's record. Without it the calendar offers no way through. */
  onOpenClient?: (clientId: string) => void;
}

export const CaseManagerCalendar: React.FC<CaseManagerCalendarProps> = ({ onOpenClient }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  /** The day popup. A day's work belongs over the calendar, not beside it. */
  const [dayOpen, setDayOpen] = useState(false);
  /** The auto-scheduled touchpoint awaiting a yes. Null when nothing is pending. */
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);
  const [skipAsk, setSkipAsk] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CalendarEvent[] | null>(null);
  const [searching, setSearching] = useState(false);
  /** Five of today's at a time. A day with thirty is a wall, not a schedule. */
  const [todayPage, setTodayPage] = useState(0);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const { isViewingAs, viewAsEmployeeId } = useViewAs();
  const { isAdmin } = useIsAdmin();
  // The touchpoint being dragged. Only touchpoints move; other events keep
  // their times, which a drag would quietly destroy.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const openEditDialog = (event: CalendarEvent) => {
    // Sandbox (view-as) can open the dialog and click through; saves are skipped.
    setEditingEvent(event);
    setIsEditDialogOpen(true);
  };

  useEffect(() => {
    fetchEvents();
  }, [currentDate, isViewingAs, viewAsEmployeeId, isAdmin]);

  /**
   * A closed case is off the calendar entirely, administrators included.
   * Closing a case ends the work but does not delete the touchpoints already
   * scheduled beyond it, so they sat there as jobs nobody was going to do. An
   * admin can still see a closed case on the record; what they cannot do is
   * act on a slot that no longer exists.
   *
   * An event whose client did not come back with it goes too: a bare "Home
   * visit" with the name missing tells nobody anything.
   */
  const onlyVisible = (rows: CalendarEvent[]) =>
    rows.filter((e) => {
      if (!e.client_id) return true;
      return !!e.clients && !isCaseClosed(e.clients);
    });

  const EVENT_SELECT = `
    *,
    profiles:employee_id (first_name, last_name),
    clients:client_id (
      first_name, last_name, status, workflow_stage,
      auth_30_start, auth_30_end, auth_150_start, auth_150_end,
      auth_180_start, auth_180_end, hsp_150_date
    )
  `;

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);

      let query = supabase
        .from('calendar_events')
        .select(EVENT_SELECT)
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .order('start_time', { ascending: true });

      if (isViewingAs && viewAsEmployeeId) {
        query = query.eq('employee_id', viewAsEmployeeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      // A closed case is off the calendar entirely, administrators included.
      // Closing a case ends the work but does not delete the touchpoints
      // already scheduled beyond it, so they sat on the calendar as jobs
      // nobody was going to do. An admin can still see a closed case on the
      // record; what they cannot do is act on a slot that no longer exists.
      //
      // An event whose client did not come back with it goes too: a bare
      // "Home visit" with the name missing tells nobody anything.
      setEvents(onlyVisible(data || []));
    } catch (error) {
      console.error('Error fetching events:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch calendar events',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Dropping a touchpoint on a day reschedules it there. The move is marked
  // manual so regeneration leaves it exactly where staff put it.
  const rescheduleTouchpoint = async (eventId: string, day: Date) => {
    const event = events.find((e) => e.id === eventId);
    if (!event || event.event_type !== 'touch_point') return;

    const target = new Date(event.start_time);
    target.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    const end = new Date(event.end_time);
    end.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());

    if (isSameDay(new Date(event.start_time), day)) return;

    if (isViewingAs) {
      toast({ title: 'Viewing as another user', description: 'Changes are not saved in this mode.' });
      return;
    }

    // Optimistic move so the card follows the cursor's drop immediately.
    setEvents((prev) =>
      prev.map((e) =>
        e.id === eventId ? { ...e, start_time: target.toISOString(), end_time: end.toISOString() } : e,
      ),
    );

    const { error } = await supabase
      .from('calendar_events')
      .update({
        start_time: target.toISOString(),
        end_time: end.toISOString(),
        is_manually_adjusted: true,
      })
      .eq('id', eventId);

    if (error) {
      toast({ title: 'Could not reschedule', description: error.message, variant: 'destructive' });
      fetchEvents();
      return;
    }
    toast({ title: 'Touchpoint rescheduled', description: 'Manual moves are preserved.' });
  };

  /**
   * Whether to ask before removing an auto-scheduled touchpoint.
   *
   * A per-person convenience about a reversible act -- the schedule regenerates
   * -- so it lives in this browser and nowhere else. Reading it can throw in a
   * private window, and a viewer who cannot store the preference should get
   * the question, not a silent delete.
   */
  const asksBeforeDelete = (): boolean => {
    try {
      return localStorage.getItem(SKIP_DELETE_ASK_KEY) !== 'true';
    } catch {
      return true;
    }
  };

  const removeTouchpoint = async (event: CalendarEvent) => {
    if (isViewingAs) {
      toast({ title: 'Preview only', description: 'Changes are not saved while viewing as an employee.' });
      return;
    }
    setDeleting(true);
    const { error } = await supabase.from('calendar_events').delete().eq('id', event.id);
    setDeleting(false);
    if (error) {
      toast({ title: 'Could not remove it', description: error.message, variant: 'destructive' });
      return;
    }
    setEvents((prev) => prev.filter((e) => e.id !== event.id));
    toast({
      title: 'Touchpoint removed',
      description: 'It may be scheduled again on another day if the cycle still needs one.',
    });
  };

  const askThenRemove = (event: CalendarEvent) => {
    if (asksBeforeDelete()) {
      setSkipAsk(false);
      setPendingDelete(event);
      return;
    }
    removeTouchpoint(event);
  };

  const confirmRemove = async () => {
    const event = pendingDelete;
    if (!event) return;
    if (skipAsk) {
      try {
        localStorage.setItem(SKIP_DELETE_ASK_KEY, 'true');
      } catch {
        // A browser that will not remember it simply asks again next time.
      }
    }
    setPendingDelete(null);
    await removeTouchpoint(event);
  };

  /**
   * Find an event without knowing which month it is in.
   *
   * The grid only ever holds one month, so anything scheduled outside it was
   * unfindable except by pressing the arrow until it appeared. This looks a
   * year either way and matches on the title and the client's name, which are
   * the two things somebody has in their head when they go looking.
   *
   * The match is made here rather than in Postgres because the client's name
   * lives on the joined row, not on the event.
   */
  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (term.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const from = new Date(Date.now() - 365 * 86_400_000).toISOString();
      const to = new Date(Date.now() + 365 * 86_400_000).toISOString();
      let q = supabase
        .from('calendar_events')
        .select(EVENT_SELECT)
        .gte('start_time', from)
        .lte('start_time', to)
        .order('start_time');
      if (isViewingAs && viewAsEmployeeId) q = q.eq('employee_id', viewAsEmployeeId);

      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setResults([]);
        setSearching(false);
        return;
      }
      const matches = onlyVisible((data as unknown as CalendarEvent[]) ?? []).filter((e) => {
        const name = `${e.clients?.first_name ?? ''} ${e.clients?.last_name ?? ''}`.toLowerCase();
        return e.title.toLowerCase().includes(term) || name.includes(term);
      });
      setResults(matches.slice(0, 20));
      setSearching(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, isViewingAs, viewAsEmployeeId]);

  /** Jump the grid to an event found by search, and open it. */
  const goToEvent = (event: CalendarEvent) => {
    const when = new Date(event.start_time);
    setCurrentDate(when);
    setSelectedDate(when);
    setSearch('');
    setResults(null);
    openEditDialog(event);
  };

  const openDay = (day: Date) => {
    setSelectedDate(day);
    setDayOpen(true);
  };

  const getDaysInMonth = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  };

  const getEventsForDay = (day: Date) => {
    return events.filter(event => 
      isSameDay(new Date(event.start_time), day)
    );
  };

  const getSelectedDayEvents = () => {
    return events.filter(event => 
      isSameDay(new Date(event.start_time), selectedDate)
    );
  };

  const getTodayEvents = () => {
    return events.filter(event => 
      isToday(new Date(event.start_time))
    );
  };

  const handlePreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const days = getDaysInMonth();
  const todayEvents = getTodayEvents();
  const selectedDayEvents = getSelectedDayEvents();

  const eventTypeColors: Record<string, string> = {
    'client_visit': 'bg-medical-blue',
    'phone_call': 'bg-medical-green',
    'team_meeting': 'bg-purple-500',
    'follow_up': 'bg-orange-500',
    'administrative': 'bg-gray-500',
    'other': 'bg-slate-500',
    'touch_point': 'bg-teal-500',
  };

  /**
   * What colour a dot on the calendar is.
   *
   * A touchpoint takes the colour of the authorization that pays for the day
   * it falls on, so a month reads as blocks of funding rather than a field of
   * identical teal. One already logged goes grey: it is done, and the eye
   * should skip it looking for what is not.
   *
   * A touchpoint on a day no authorization covers is amber. That is not a
   * display quirk — it is work nobody is paying for, and the calendar is where
   * somebody would notice.
   */
  /**
   * The fill behind an entry in a day square.
   *
   * The colour was a dot six pixels across, which is not something anyone
   * reads a month by. The whole chip is tinted instead, so a glance at the
   * grid shows which authorization the month's work belongs to.
   */
  const chipTint = (event: CalendarEvent): string => {
    if (event.event_type !== 'touch_point') return 'bg-muted/60';
    if (event.status === 'completed') return 'bg-slate-100 text-slate-500';
    const phase = authPhaseOn(event.clients ?? null, event.start_time.slice(0, 10));
    return phase ? AUTH_PHASE_TINT[phase] : 'bg-amber-100 text-amber-900';
  };

  const dotColor = (event: CalendarEvent): string => {
    if (event.event_type !== 'touch_point') {
      return eventTypeColors[event.event_type ?? 'other'] ?? 'bg-slate-500';
    }
    if (event.status === 'completed') return 'bg-slate-400';
    const phase = authPhaseOn(event.clients ?? null, event.start_time.slice(0, 10));
    return phase ? AUTH_PHASE_DOT[phase] : 'bg-amber-500';
  };
  const eventTypeLabels: Record<string, string> = {
    'touch_point': 'Touchpoint',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">Your scheduled work, by date.</p>
          <p className="text-xs text-muted-foreground">Drag to reschedule. Manual moves are preserved.</p>
        </div>
        {!isViewingAs && (
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Event
          </Button>
        )}
      </div>

      {/* Find an event without knowing its month. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events by title or client name"
          className="pl-9"
          aria-label="Search events"
        />
        {search.trim().length >= 2 && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
            {searching ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">Searching</p>
            ) : !results || results.length === 0 ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                Nothing matches, within a year either way of today.
              </p>
            ) : (
              <ul className="divide-y">
                {results.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => goToEvent(e)}
                      className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60"
                    >
                      <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                        {format(new Date(e.start_time), 'EEE, MMM d yyyy')}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                      {eventTypeLabels[e.event_type] && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {eventTypeLabels[e.event_type]}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="space-y-6">
        {/* Today at a glance, without having to click today. */}
        <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Today's Schedule</h3>
            </div>
            <div className="space-y-2">
              {todayEvents.length > 0 ? (
                todayEvents.slice(todayPage * TODAY_PAGE, todayPage * TODAY_PAGE + TODAY_PAGE).map(event => (
                  <button
                    key={event.id}
                    onClick={() => openEditDialog(event)}
                    className="w-full text-left p-2 rounded-lg bg-muted/50 space-y-1 hover:bg-muted transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full inline-block mr-2 ${dotColor(event)}`} />
                    <span className="text-sm font-medium">{event.title}</span>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(event.start_time), 'h:mm a')} - {format(new Date(event.end_time), 'h:mm a')}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No events today.</p>
              )}

              {todayEvents.length > TODAY_PAGE && (
                <div className="flex items-center gap-2 pt-1 text-xs">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={todayPage === 0}
                    onClick={() => setTodayPage(p => Math.max(0, p - 1))}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(todayPage + 1) * TODAY_PAGE >= todayEvents.length}
                    onClick={() => setTodayPage(p => p + 1)}
                  >
                    Next
                  </Button>
                  <span className="text-muted-foreground">
                    {todayPage * TODAY_PAGE + 1}–
                    {Math.min((todayPage + 1) * TODAY_PAGE, todayEvents.length)} of{' '}
                    {todayEvents.length}
                  </span>
                </div>
              )}
            </div>
        </Card>
        {/* The calendar has the width to itself. A day's events open over it. */}
        <Card className="p-6">
          {/* Calendar Controls */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={handlePreviousMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h2 className="text-xl font-semibold min-w-[200px] text-center">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <Button variant="outline" size="icon" onClick={handleNextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" onClick={handleToday}>
              Today
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="space-y-2">
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-2 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-2">
              {days.map((day, idx) => {
                const dayEvents = getEventsForDay(day);
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isSelected = isSameDay(day, selectedDate);
                const isTodayDate = isToday(day);

                return (
                  <div
                    key={idx}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDay(day)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDay(day);
                      }
                    }}
                    onDragOver={(e) => {
                      if (!draggingId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverDay(format(day, 'yyyy-MM-dd'));
                    }}
                    onDragLeave={() => setDragOverDay((d) => (d === format(day, 'yyyy-MM-dd') ? null : d))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = draggingId ?? e.dataTransfer.getData('text/plain');
                      setDraggingId(null);
                      setDragOverDay(null);
                      if (id) rescheduleTouchpoint(id, day);
                    }}
                    className={`
                      min-h-[5rem] sm:aspect-square p-1.5 rounded-lg border transition-all relative flex flex-col gap-1 text-left cursor-pointer
                      ${isCurrentMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'}
                      ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
                      ${isTodayDate ? 'bg-primary/10 font-semibold' : ''}
                      ${dragOverDay === format(day, 'yyyy-MM-dd') ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : ''}
                      hover:border-primary/50
                    `}
                  >
                    <span className="text-sm">{format(day, 'd')}</span>
                    <div className="flex flex-col gap-0.5 overflow-hidden">
                      {dayEvents.slice(0, 2).map((event) => (
                        <button
                          key={event.id}
                          draggable={event.event_type === 'touch_point'}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', event.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingId(event.id);
                          }}
                          onDragEnd={() => { setDraggingId(null); setDragOverDay(null); }}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(event);
                          }}
                          className={`flex items-center gap-1 w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight transition-opacity hover:opacity-80 ${chipTint(event)} ${
                            event.event_type === 'touch_point' ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${draggingId === event.id ? 'opacity-40' : ''}`}
                          title={event.event_type === 'touch_point' ? `${event.title} — drag to reschedule` : event.title}
                        >
                          <span className="truncate">{event.title}</span>
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="text-[10px] text-muted-foreground px-1">
                          +{dayEvents.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Without this the colours are decoration. A touchpoint is
                coloured by the authorization paying for the day it sits on. */}
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
              {(Object.keys(AUTH_PHASE_LABEL) as (keyof typeof AUTH_PHASE_LABEL)[]).map((p) => (
                <span key={p} className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${AUTH_PHASE_DOT[p]}`} />
                  {AUTH_PHASE_LABEL[p]}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-400" />
                Logged
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Not authorized
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-medical-blue" />
                Other events
              </span>
            </div>
          </div>
        </Card>

      </div>

      {/* A day's work, over the calendar rather than beside it. Closing it
          gives the month back in full. */}
      <Dialog open={dayOpen} onOpenChange={setDayOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader className="text-left">
            {/* Room for the Add button and the dialog's own X beside it. */}
            <div className="flex items-start justify-between gap-3 pr-8">
              <div>
                <DialogTitle>{format(selectedDate, 'EEEE, MMMM d')}</DialogTitle>
                <DialogDescription>
                  {selectedDayEvents.length === 0
                    ? 'Nothing scheduled.'
                    : `${selectedDayEvents.length} ${selectedDayEvents.length === 1 ? 'entry' : 'entries'}`}
                </DialogDescription>
              </div>
              {!isViewingAs && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    setDayOpen(false);
                    setIsAddDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-3">
            {selectedDayEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-2 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <button
                  onClick={() => {
                    setDayOpen(false);
                    openEditDialog(event);
                  }}
                  className="min-w-0 flex-1 space-y-2 text-left"
                >
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${dotColor(event)}`} />
                  <h4 className="text-sm font-medium">{event.title}</h4>
                  {eventTypeLabels[event.event_type] && (
                    <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                      {eventTypeLabels[event.event_type]}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(event.start_time), 'h:mm a')} –{' '}
                  {format(new Date(event.end_time), 'h:mm a')}
                </p>
                {event.clients && (
                  <p className="text-xs text-muted-foreground">
                    Client: {event.clients.first_name} {event.clients.last_name}
                  </p>
                )}
                {event.description && (
                  <p className="mt-1 text-xs text-muted-foreground">{event.description}</p>
                )}
                </button>

                {/* Only the auto-scheduled ones. Something a person put in the
                    calendar themselves is theirs to open and change, not to
                    lose to a button they were aiming near. */}
                {event.event_type === 'touch_point' && event.is_auto_generated && !isViewingAs && (
                  <button
                    onClick={() => askThenRemove(event)}
                    disabled={deleting}
                    aria-label={`Remove ${event.title}`}
                    title="Remove this touchpoint"
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this touchpoint?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.title} on{' '}
              {pendingDelete && format(new Date(pendingDelete.start_time), 'EEEE, MMMM d')}. The
              cycle may schedule another in its place if one is still owed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={skipAsk} onCheckedChange={(v) => setSkipAsk(v === true)} />
            Don't ask me again
          </label>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddCalendarEventDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onEventAdded={fetchEvents}
        defaultDate={selectedDate}
      />

      <EditCalendarEventDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        event={editingEvent}
        canDelete={isAdmin}
        onOpenClient={onOpenClient}
        onEventUpdated={fetchEvents}
      />
    </div>
  );
};
