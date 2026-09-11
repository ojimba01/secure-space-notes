import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Calendar, Plus, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { calendarEventSchema } from '@/lib/validationSchemas';
import { EditCalendarEventDialog } from '@/components/EditCalendarEventDialog';
import { z } from 'zod';

type CalendarEventFormData = z.infer<typeof calendarEventSchema>;

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  event_type: string;
  created_at: string;
  client_id?: string | null;
  employee_id?: string;
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

interface CalendarViewProps {
  clientId: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ clientId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const form = useForm<CalendarEventFormData>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: {
      title: '',
      description: '',
      start_time: '',
      end_time: '',
      event_type: 'client_visit',
    },
  });

  useEffect(() => {
    fetchEvents();
  }, [clientId]);

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('calendar_events')
        .select(`
          *,
          profiles:employee_id (
            first_name,
            last_name
          )
        `)
        .eq('client_id', clientId)
        .order('start_time', { ascending: false });

      if (error) {
        throw error;
      }

      setEvents(data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching events",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = async (data: CalendarEventFormData) => {
    setIsSubmitting(true);
    
    try {
      // Validate that end time is after start time
      if (new Date(data.end_time) <= new Date(data.start_time)) {
        toast({
          title: "Invalid time range",
          description: "End time must be after start time.",
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }

      // Get current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      const eventData = {
        employee_id: profile?.id,
        client_id: clientId,
        title: data.title,
        description: data.description || '',
        start_time: data.start_time,
        end_time: data.end_time,
        event_type: 'client_visit',
      };

      const { error } = await supabase
        .from('calendar_events')
        .insert([eventData]);

      if (error) {
        throw error;
      }

      toast({
        title: "Event Added",
        description: "Calendar event has been added successfully.",
      });

      fetchEvents();
      setShowAddDialog(false);
      form.reset({
        title: '',
        description: '',
        start_time: '',
        end_time: '',
        event_type: 'client_visit',
      });
    } catch (error: any) {
      toast({
        title: "Error adding event",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Client calendar</h2>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add event</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleAddEvent)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event title</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={200} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} maxLength={1000} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End Time</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add Event'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading events...</div>
      ) : (
        <div className="divide-y rounded-md border">
          {/* A row each, not a card each. Every event was a full Card with its
              own icon, heading and two toLocaleString timestamps -- four lines
              of furniture around one line of fact, and a month of touchpoints
              ran off the bottom of the screen. */}
          {events.map((event) => {
            const start = new Date(event.start_time);
            const end = new Date(event.end_time);
            // Auto-scheduled touchpoints carry a date and no time.
            const allDay = start.getTime() === end.getTime();
            return (
              <button
                key={event.id}
                onClick={() => {
                  setEditingEvent(event);
                  setIsEditDialogOpen(true);
                }}
                className="flex w-full items-baseline gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
              >
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {format(start, 'EEE, MMM d')}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {allDay ? 'All day' : format(start, 'h:mm a')}
                </span>
              </button>
            );
          })}
          {events.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No events are scheduled.
            </p>
          )}
        </div>
      )}

      <EditCalendarEventDialog
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
        event={editingEvent ? { ...editingEvent, client_id: editingEvent.client_id ?? clientId, employee_id: editingEvent.employee_id ?? '' } : null}
        onEventUpdated={fetchEvents}
      />
    </div>
  );
};