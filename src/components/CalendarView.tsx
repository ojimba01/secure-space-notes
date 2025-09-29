import React, { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Plus, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  event_type: string;
  created_at: string;
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

  const handleAddEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const formData = new FormData(e.currentTarget);
    
    try {
      // Get current user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      const eventData = {
        employee_id: profile?.id,
        client_id: clientId,
        title: formData.get('title') as string,
        description: formData.get('description') as string,
        start_time: formData.get('startTime') as string,
        end_time: formData.get('endTime') as string,
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
      (e.target as HTMLFormElement).reset();
    } catch (error: any) {
      toast({
        title: "Error adding event",
        description: error.message,
        variant: "destructive",
      });
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
            <form onSubmit={handleAddEvent} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="title">Event Title</label>
                <Input id="title" name="title" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="description">Description</label>
                <Textarea id="description" name="description" rows={3} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="startTime">Start Time</label>
                  <Input 
                    id="startTime" 
                    name="startTime" 
                    type="datetime-local" 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="endTime">End Time</label>
                  <Input 
                    id="endTime" 
                    name="endTime" 
                    type="datetime-local" 
                    required 
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit">Add Event</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading events...</div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => (
            <Card key={event.id}>
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
    </div>
  );
};