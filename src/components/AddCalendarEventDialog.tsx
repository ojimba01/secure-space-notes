import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthProvider';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface AddCalendarEventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventAdded: () => void;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
}

export const AddCalendarEventDialog: React.FC<AddCalendarEventDialogProps> = ({
  open,
  onOpenChange,
  onEventAdded,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    client_id: '',
    event_type: 'client_visit',
    start_time: '',
    end_time: '',
  });

  useEffect(() => {
    if (open) {
      fetchClients();
    }
  }, [open]);

  const fetchClients = async () => {
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, first_name, last_name')
        .eq('status', 'active')
        .order('last_name', { ascending: true });

      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      // Get user's profile ID
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Construct start time (defaults to now if not provided)
      const startDateTime = startDate ? new Date(startDate) : new Date();
      if (formData.start_time) {
        const [startHour, startMinute] = formData.start_time.split(':');
        startDateTime.setHours(parseInt(startHour), parseInt(startMinute), 0, 0);
      }

      let endDateTime: Date;
      if (endDate && formData.end_time) {
        const [endHour, endMinute] = formData.end_time.split(':');
        endDateTime = new Date(endDate);
        endDateTime.setHours(parseInt(endHour), parseInt(endMinute));
      } else if (formData.end_time) {
        const [endHour, endMinute] = formData.end_time.split(':');
        endDateTime = new Date(startDateTime);
        endDateTime.setHours(parseInt(endHour), parseInt(endMinute));
      } else {
        // Default to 1 hour after start
        endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
      }


      const eventData = {
        title: formData.title,
        description: formData.description || null,
        client_id: formData.client_id || null,
        event_type: formData.event_type,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        employee_id: profile.id,
      };

      const { error } = await supabase
        .from('calendar_events')
        .insert([eventData]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Event added successfully',
      });

      onEventAdded();
      onOpenChange(false);
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        client_id: '',
        event_type: 'client_visit',
        start_time: '',
        end_time: '',
          });
      setStartDate(undefined);
      setEndDate(undefined);
    } catch (error: any) {
      console.error('Error adding event:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add event',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add event</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Event title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Client visit"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_type">Event Type</Label>
            <Select
              value={formData.event_type}
              onValueChange={(value) => setFormData({ ...formData, event_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="client_visit">Client Visit</SelectItem>
                <SelectItem value="phone_call">Phone Call</SelectItem>
                <SelectItem value="team_meeting">Team Meeting</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="administrative">Administrative</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_id">Client</Label>
            <Select
              value={formData.client_id || "none"}
              onValueChange={(value) => setFormData({ ...formData, client_id: value === "none" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.first_name} {client.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : <span>Pick date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_time">Start Time</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : <span>Same day</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={setEndDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">End Time</Label>
              <Input
                id="end_time"
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add notes about this event..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Event'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
