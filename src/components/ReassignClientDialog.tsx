import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { UserCog } from 'lucide-react';

const reassignSchema = z.object({
  new_employee_id: z.string().min(1, 'Please select an employee'),
  reason: z.string().trim().max(500).optional(),
});

type ReassignFormData = z.infer<typeof reassignSchema>;

interface Employee {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  active: boolean;
}

interface ReassignClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  currentEmployeeId?: string;
  onReassigned: () => void;
}

export const ReassignClientDialog: React.FC<ReassignClientDialogProps> = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  currentEmployeeId,
  onReassigned,
}) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const form = useForm<ReassignFormData>({
    resolver: zodResolver(reassignSchema),
    defaultValues: {
      new_employee_id: '',
      reason: '',
    },
  });

  useEffect(() => {
    if (open) {
      fetchEmployees();
    }
  }, [open]);

  const fetchEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, active')
        .eq('active', true)
        .order('first_name');

      if (error) throw error;

      // Filter out current employee
      const availableEmployees = (data || []).filter(
        emp => emp.id !== currentEmployeeId
      );

      setEmployees(availableEmployees);
    } catch (error: any) {
      toast({
        title: "Error loading employees",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: ReassignFormData) => {
    setIsSubmitting(true);

    try {
      const { error } = await supabase.rpc('reassign_client', {
        _client_id: clientId,
        _new_employee_id: data.new_employee_id,
        _reason: data.reason || null,
      });

      if (error) throw error;

      toast({
        title: "Client Reassigned",
        description: `${clientName} has been reassigned successfully.`,
      });

      onReassigned();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error reassigning client",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            <DialogTitle>Reassign Client</DialogTitle>
          </div>
          <DialogDescription>
            Reassign {clientName} to a different case manager. This action will be logged in the assignment history.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="new_employee_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Case Manager *</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={loading || employees.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={loading ? "Loading..." : "Select case manager"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.first_name} {employee.last_name} ({employee.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Only active case managers are shown
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      rows={3} 
                      placeholder="Document why this reassignment is happening..."
                    />
                  </FormControl>
                  <FormDescription>
                    This will be recorded in the assignment history
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || loading || employees.length === 0}
              >
                {isSubmitting ? 'Reassigning...' : 'Reassign Client'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};