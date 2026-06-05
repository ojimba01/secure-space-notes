import React, { useState, useEffect } from 'react';
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
        <h2 className="text-xl font-semibold">Client Calendar</h2>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Event
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Calendar Event</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleAddEvent)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Title</FormLabel>
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
        <div className="space-y-4">
          {events.map((event) => (
            <Card
              key={event.id}
              className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
              onClick={() => {
                setEditingEvent(event);
                setIsEditDialogOpen(true);
              }}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {event.title}
                </CardTitle>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {new Date(event.start_time).toLocaleString()} - {new Date(event.end_time).toLocaleString()}
                  </div>
                  {event.profiles && (
                    <span>
                      with {event.profiles.first_name} {event.profiles.last_name}
                    </span>
                  )}
                </div>
              </CardHeader>
              {event.description && (
                <CardContent>
                  <p className="text-sm">{event.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
          {events.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No events scheduled. Add your first event to get started.
            </div>
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