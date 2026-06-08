import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
import { CalendarRange, Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface VisitAvailability {
  id: string;
  client_id: string;
  start_date: string;
  end_date: string;
  notes?: string | null;
}

const availabilitySchema = z
  .object({
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((data) => data.end_date >= data.start_date, {
    message: 'End date must be on or after the start date',
    path: ['end_date'],
  });

type AvailabilityFormData = z.infer<typeof availabilitySchema>;

interface VisitAvailabilityProps {
  clientId: string;
}

export const VisitAvailabilitySection: React.FC<VisitAvailabilityProps> = ({ clientId }) => {
  const { toast } = useToast();
  const [ranges, setRanges] = useState<VisitAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VisitAvailability | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AvailabilityFormData>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: { start_date: '', end_date: '', notes: '' },
  });

  const fetchRanges = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_visit_availability')
      .select('*')
      .eq('client_id', clientId)
      .order('start_date', { ascending: true });

    if (error) {
      toast({ title: 'Error loading availability', description: error.message, variant: 'destructive' });
    } else {
      setRanges(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const openAdd = () => {
    setEditing(null);
    form.reset({ start_date: '', end_date: '', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (range: VisitAvailability) => {
    setEditing(range);
    form.reset({
      start_date: range.start_date,
      end_date: range.end_date,
      notes: range.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (data: AvailabilityFormData) => {
    setIsSubmitting(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('client_visit_availability')
          .update({
            start_date: data.start_date,
            end_date: data.end_date,
            notes: data.notes || null,
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Availability updated' });
      } else {
        const { error } = await supabase.from('client_visit_availability').insert([
          {
            client_id: clientId,
            start_date: data.start_date,
            end_date: data.end_date,
            notes: data.notes || null,
          },
        ]);
        if (error) throw error;
        toast({ title: 'Availability added' });
      }
      setDialogOpen(false);
      fetchRanges();
    } catch (error: any) {
      toast({ title: 'Error saving availability', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('client_visit_availability').delete().eq('id', deleteId);
    if (error) {
      toast({ title: 'Error deleting availability', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Availability removed' });
      fetchRanges();
    }
    setDeleteId(null);
  };

  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5" />
            Scheduled Visit Availability
          </CardTitle>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Date Range
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : ranges.length === 0 ? (
          <p className="text-muted-foreground">
            No availability windows set. Add a date range to indicate when visits can happen.
          </p>
        ) : (
          <div className="space-y-3">
            {ranges.map((range) => (
              <div
                key={range.id}
                className="flex items-start justify-between rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">
                    {formatDate(range.start_date)} &ndash; {formatDate(range.end_date)}
                  </p>
                  {range.notes && (
                    <p className="text-sm text-muted-foreground mt-1">{range.notes}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(range)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(range.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Date Range' : 'Add Date Range'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} placeholder="e.g. mornings only, weekdays preferred" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editing ? 'Update' : 'Add'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this date range?</AlertDialogTitle>
            <AlertDialogDescription>
              This availability window will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
