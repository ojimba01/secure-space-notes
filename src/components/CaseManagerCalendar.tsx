import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AddCalendarEventDialog } from './AddCalendarEventDialog';
import { EditCalendarEventDialog } from './EditCalendarEventDialog';
import { useViewAs } from '@/components/ViewAsProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { todayAgency } from '@/lib/compliance';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfWeek, endOfWeek } from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: string;
  client_id: string | null;
  employee_id: string;
  profiles?: {
    first_name: string | null;
    last_name: string | null;
  };
  clients?: {
    first_name: string;
    last_name: string;
  };
}

export const CaseManagerCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
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
  }, [currentDate, isViewingAs, viewAsEmployeeId]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);

      let query = supabase
        .from('calendar_events')
        .select(`
          *,
          profiles:employee_id (first_name, last_name),
          clients:client_id (first_name, last_name)
        `)
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString())
        .order('start_time', { ascending: true });

      if (isViewingAs && viewAsEmployeeId) {
        query = query.eq('employee_id', viewAsEmployeeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEvents(data || []);
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
  const eventTypeLabels: Record<string, string> = {
    'touch_point': 'Touchpoint',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">View scheduled touchpoints by date.</p>
          <p className="text-xs text-muted-foreground">Drag to reschedule. Manual moves are preserved.</p>
        </div>
        {!isViewingAs && (
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Event
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Calendar */}
        <Card className="p-6 lg:col-span-2">
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
                    onClick={() => setSelectedDate(day)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedDate(day);
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
                          className={`flex items-center gap-1 w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight hover:bg-muted transition-colors ${
                            event.event_type === 'touch_point' ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${draggingId === event.id ? 'opacity-40' : ''}`}
                          title={event.event_type === 'touch_point' ? `${event.title} — drag to reschedule` : event.title}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${eventTypeColors[event.event_type] || 'bg-gray-500'}`} />
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
          </div>
        </Card>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Today's Schedule */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-semibold">Today's Schedule</h3>
            </div>
            <div className="space-y-2">
              {todayEvents.length > 0 ? (
                todayEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => openEditDialog(event)}
                    className="w-full text-left p-2 rounded-lg bg-muted/50 space-y-1 hover:bg-muted transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full inline-block mr-2 ${eventTypeColors[event.event_type]}`} />
                    <span className="text-sm font-medium">{event.title}</span>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(event.start_time), 'h:mm a')} - {format(new Date(event.end_time), 'h:mm a')}
                    </p>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No events today.</p>
              )}
            </div>
          </Card>

          {/* Selected Day Events */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">
              {format(selectedDate, 'EEEE, MMMM d')}
            </h3>
            <div className="space-y-3">
              {selectedDayEvents.length > 0 ? (
                selectedDayEvents.map(event => (
                  <button
                    key={event.id}
                    onClick={() => openEditDialog(event)}
                    className="w-full text-left p-3 rounded-lg border space-y-2 hover:border-primary/50 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${eventTypeColors[event.event_type]}`} />
                          <h4 className="font-medium text-sm">{event.title}</h4>
                          {eventTypeLabels[event.event_type] && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">
                              {eventTypeLabels[event.event_type]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(event.start_time), 'h:mm a')} - {format(new Date(event.end_time), 'h:mm a')}
                        </p>
                        {event.clients && (
                          <p className="text-xs text-muted-foreground">
                            Client: {event.clients.first_name} {event.clients.last_name}
                          </p>
                        )}
                        {event.description && (
                          <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No events are scheduled.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <AddCalendarEventDialog 
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onEventAdded={fetchEvents}
      />

      <EditCalendarEventDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        event={editingEvent}
        canDelete={isAdmin}
        onEventUpdated={fetchEvents}
      />
    </div>
  );
};
