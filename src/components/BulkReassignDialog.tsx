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
import { useAuth } from '@/components/AuthProvider';

const schema = z.object({
  new_employee_id: z.string().min(1, 'Please select an employee'),
  reason: z.string().trim().max(500).optional(),
});

type FormData = z.infer<typeof schema>;

interface Employee {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
  active: boolean;
}

interface BulkReassignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientIds: string[];
  onReassigned: () => void;
}

export const BulkReassignDialog: React.FC<BulkReassignDialogProps> = ({
  open,
  onOpenChange,
  clientIds,
  onReassigned,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { new_employee_id: '', reason: '' },
  });

  useEffect(() => {
    if (open) fetchEmployees();
  }, [open, user]);

  const fetchEmployees = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: activeProfiles, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, active, user_id')
        .eq('active', true)
        .order('first_name');

      if (error) throw error;

      const { data: superRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'superadmin');
      const superIds = new Set((superRoles || []).map((r) => r.user_id));

      let avail: Employee[] = (activeProfiles || []).filter((p) => !superIds.has(p.user_id));

      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, active')
        .eq('user_id', user.id)
        .maybeSingle();

      if (currentProfile && !avail.some((e) => e.id === currentProfile.id)) {
        avail = [...avail, currentProfile as Employee];
      }

      setEmployees(avail);
    } catch (error: any) {
      toast({
        title: 'Error loading employees',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    let success = 0;
    let skipped = 0;
    let failed = 0;

    const isUnassign = data.new_employee_id === '__none__';

    for (const id of clientIds) {
      if (isUnassign) {
        const { error } = await supabase
          .from('clients')
          .update({ assigned_employee_id: null })
          .eq('id', id);
        if (!error) success++;
        else failed++;
      } else {
        const { error } = await supabase.rpc('reassign_client', {
          _client_id: id,
          _new_employee_id: data.new_employee_id,
          _reason: data.reason || null,
        });
        if (!error) {
          success++;
        } else if (error.message?.includes('already assigned')) {
          skipped++;
        } else {
          failed++;
        }
      }
    }

    const verb = isUnassign ? 'unassigned' : 'reassigned';
    const parts = [`${success} ${verb}`];
    if (skipped) parts.push(`${skipped} skipped`);
    if (failed) parts.push(`${failed} failed`);

    toast({
      title: isUnassign ? 'Bulk Unassignment Complete' : 'Bulk Reassignment Complete',
      description: parts.join(', '),
      variant: failed > 0 ? 'destructive' : 'default',
    });

    setIsSubmitting(false);
    onReassigned();
    onOpenChange(false);
    form.reset();
  };

  const selectedEmployee = employees.find((e) => e.id === form.watch('new_employee_id'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            <DialogTitle>Bulk Reassign Clients</DialogTitle>
          </div>
          <DialogDescription>
            Reassign {clientIds.length} {clientIds.length === 1 ? 'client' : 'clients'}
            {selectedEmployee
              ? ` to ${selectedEmployee.first_name} ${selectedEmployee.last_name}`
              : ''}
            . Each change is logged in the assignment history.
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
                        <SelectValue placeholder={loading ? 'Loading...' : 'Select case manager'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">— No case manager (unassign) —</SelectItem>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.first_name} {employee.last_name} ({employee.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      placeholder="Document why these reassignments are happening..."
                    />
                  </FormControl>
                  <FormDescription>Recorded for each client in assignment history</FormDescription>
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
              <Button type="submit" disabled={isSubmitting || loading || employees.length === 0}>
                {isSubmitting ? 'Reassigning...' : `Reassign ${clientIds.length}`}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
