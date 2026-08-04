import React, { useState, useEffect } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { regenerateClientCycles, fetchActiveCaseManagers, caseManagerName, CaseManagerOption } from '@/lib/billingSync';
import { regenerateTouchpointsForClient, regenerateTouchpointsForStaff } from '@/lib/touchpoints';

const INSURANCE_OPTIONS = ['Aetna', 'Horizon', 'Wellpoint', 'United Health', 'Fidelis'] as const;

const LON_OPTIONS = ['Low Level', 'High Level'] as const;

const APPROVAL_STATUS_OPTIONS = ['Not Submitted', 'Submitted', 'Approved', 'Denied'] as const;

const REASON_CLOSED_OPTIONS = [
  'Housed', 'Moved', 'Lost Contact', 'Deceased',
  'Transferred to Other Agency', 'Medicaid Expired', 'Other',
] as const;

const NJ_COUNTIES = [
  'Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland',
  'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex',
  'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset',
  'Sussex', 'Union', 'Warren',
] as const;

const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  member_id: z.string().trim().max(50).optional(),
  insurance: z.string().trim().max(50).optional(),
  level_of_need: z.string().trim().max(50).optional(),
  county: z.string().trim().max(50).optional(),
  mco_housing_manager: z.string().trim().max(200).optional(),
  approval_status: z.string().trim().max(50).optional(),
  date_of_birth: z.string().optional(),
  intake_date: z.string().optional(),
  assessment_due_date: z.string().optional(),
  iat_date: z.string().optional(),
  hsp_due_date: z.string().optional(),
  auth_30_number: z.string().trim().max(100).optional(),
  auth_30_start: z.string().optional(),
  auth_30_end: z.string().optional(),
  auth_150_number: z.string().trim().max(100).optional(),
  auth_150_start: z.string().optional(),
  auth_150_end: z.string().optional(),
  auth_180_number: z.string().trim().max(100).optional(),
  auth_180_start: z.string().optional(),
  auth_180_end: z.string().optional(),
  next_action_due_date: z.string().optional(),
  closed_date: z.string().optional(),
  reason_closed: z.string().trim().max(100).optional(),
  assigned_employee_id: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});


type ClientFormData = z.infer<typeof clientSchema>;

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientAdded: () => void;
}

export const AddClientDialog: React.FC<AddClientDialogProps> = ({
  open,
  onOpenChange,
  onClientAdded,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caseManagers, setCaseManagers] = useState<CaseManagerOption[]>([]);

  useEffect(() => {
    if (open) {
      fetchActiveCaseManagers().then(setCaseManagers).catch(() => setCaseManagers([]));
    }
  }, [open]);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      address: '',
      member_id: '',
      insurance: '',
      level_of_need: '',
      county: '',
      mco_housing_manager: '',
      approval_status: 'Not Submitted',
      date_of_birth: '',
      intake_date: '',
      assessment_due_date: '',
      iat_date: '',
      hsp_due_date: '',
      auth_30_number: '',
      auth_30_start: '',
      auth_30_end: '',
      auth_150_number: '',
      auth_150_start: '',
      auth_150_end: '',
      auth_180_number: '',
      auth_180_start: '',
      auth_180_end: '',
      next_action_due_date: '',
      closed_date: '',
      reason_closed: '',
      assigned_employee_id: '',
      notes: '',
    },
  });


  const handleSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    
    try {
      // Default to current user's profile if no case manager selected
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      const assignedId =
        data.assigned_employee_id && data.assigned_employee_id !== '__none__'
          ? data.assigned_employee_id
          : data.assigned_employee_id === '__none__'
            ? null
            : profile?.id ?? null;

      const clientData = {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        member_id: data.member_id || null,
        insurance: data.insurance || null,
        level_of_need: data.level_of_need || null,
        county: data.county || null,
        mco_housing_manager: data.mco_housing_manager || null,
        approval_status: data.approval_status || null,
        date_of_birth: data.date_of_birth || null,
        intake_date: data.intake_date || undefined,
        assessment_due_date: data.assessment_due_date || null,
        iat_date: data.iat_date || null,
        hsp_due_date: data.hsp_due_date || null,
        auth_30_number: data.auth_30_number || null,
        auth_30_start: data.auth_30_start || null,
        auth_30_end: data.auth_30_end || null,
        auth_150_number: data.auth_150_number || null,
        auth_150_start: data.auth_150_start || null,
        auth_180_number: data.auth_180_number || null,
        hsp_submitted: !!data.hsp_submitted,
        auth_180_approved: !!data.auth_180_approved,
        next_action_due_date: data.next_action_due_date || null,
        closed_date: data.closed_date || null,
        reason_closed: data.reason_closed || null,
        notes: data.notes || null,
        assigned_employee_id: assignedId,
      };


      const { data: inserted, error } = await supabase
        .from('clients')
        .insert([clientData])
        .select('id')
        .single();

      if (error) throw error;

      // Auto-generate billing cycles right away if there's a 150-day start.
      if (inserted?.id && clientData.auth_150_start) {
        try {
          await regenerateClientCycles(inserted.id);
        } catch {
          /* non-fatal */
        }
      }

      // Auto-generate monthly touch-points from the HSP 150-day date, and rebalance the
      // assigned staff member's caseload so they spread evenly.
      if (inserted?.id) {
        try {
          await regenerateTouchpointsForClient(inserted.id);
          if (assignedId) await regenerateTouchpointsForStaff(assignedId);
        } catch {
          /* non-fatal */
        }
      }



      toast({
        title: "Client Added",
        description: "New client has been added successfully.",
      });

      onClientAdded();
      onOpenChange(false);
      form.reset();
    } catch (error: any) {
      toast({
        title: "Error adding client",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Section: Client info */}
            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Client Info</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="first_name" render={({ field }) => (
                  <FormItem><FormLabel>First Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="last_name" render={({ field }) => (
                  <FormItem><FormLabel>Last Name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="insurance" render={({ field }) => (
                  <FormItem>
                    <FormLabel>MCO (Insurance)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select MCO" /></SelectTrigger></FormControl>
                      <SelectContent>{INSURANCE_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="member_id" render={({ field }) => (
                  <FormItem><FormLabel>Member ID</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} type="tel" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input {...field} type="email" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                  <FormItem><FormLabel>Date of Birth</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="county" render={({ field }) => (
                  <FormItem>
                    <FormLabel>County</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select county" /></SelectTrigger></FormControl>
                      <SelectContent>{NJ_COUNTIES.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="assigned_employee_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned Staff</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Assign to me (default)" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">— Unassigned —</SelectItem>
                        {caseManagers.map((cm) => (<SelectItem key={cm.id} value={cm.id}>{caseManagerName(cm)}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mco_housing_manager" render={({ field }) => (
                  <FormItem><FormLabel>MCO Housing Manager</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </div>

            {/* Section: Status */}
            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Status</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="approval_status" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Approval Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger></FormControl>
                      <SelectContent>{APPROVAL_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="level_of_need" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level of Need (LoN)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select level of need" /></SelectTrigger></FormControl>
                      <SelectContent>{LON_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Section: Dates & authorizations */}
            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Dates and authorizations</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="intake_date" render={({ field }) => (
                  <FormItem><FormLabel>Intake date (assessment start)</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="assessment_due_date" render={({ field }) => (
                  <FormItem><FormLabel>Assessment due date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="iat_date" render={({ field }) => (
                  <FormItem><FormLabel>IAT start date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="hsp_due_date" render={({ field }) => (
                  <FormItem><FormLabel>HSP due date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">30-day authorization</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="auth_30_number" render={({ field }) => (
                    <FormItem><FormLabel>30-day auth #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_30_start" render={({ field }) => (
                    <FormItem><FormLabel>30-day start date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_30_end" render={({ field }) => (
                    <FormItem><FormLabel>30-day end date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  150-day authorization — the HSP approval start date drives billing
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="auth_150_number" render={({ field }) => (
                    <FormItem><FormLabel>150-day auth #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_150_start" render={({ field }) => (
                    <FormItem>
                      <FormLabel>HSP approval start date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">Billing cycle 1 starts on this date.</p>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormItem>
                    <FormLabel>150-day end date</FormLabel>
                    <FormControl>
                      <Input value={derivedEnds.end150} type="date" readOnly disabled />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Calculated as start + 149 days.</p>
                  </FormItem>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">180-day authorization</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="auth_180_number" render={({ field }) => (
                    <FormItem><FormLabel>180-day auth #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormItem>
                    <FormLabel>180-day start date</FormLabel>
                    <FormControl>
                      <Input value={derivedEnds.start180} type="date" readOnly disabled />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Set once the extension is approved.</p>
                  </FormItem>
                  <FormItem>
                    <FormLabel>180-day end date</FormLabel>
                    <FormControl>
                      <Input value={derivedEnds.end180} type="date" readOnly disabled />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Calculated as start + 329 days.</p>
                  </FormItem>
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <FormField control={form.control} name="hsp_submitted" render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>HSP submitted</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Required before billing cycles are generated.
                      </p>
                    </div>
                  </FormItem>
                )} />
                <FormField control={form.control} name="auth_180_approved" render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0">
                    <FormControl>
                      <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>180-day extension approved</FormLabel>
                      <p className="text-xs text-muted-foreground">
                        Extends the client from 5 to 11 billing cycles.
                      </p>
                    </div>
                  </FormItem>
                )} />
              </div>


            </div>

            {/* Section: Follow-up */}
            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Follow-up</h4>
              <FormField control={form.control} name="next_action_due_date" render={({ field }) => (
                <FormItem><FormLabel>Next Action Due Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>

            {/* Section: Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Initial Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
            )} />

            <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
              You can set scheduled visit availability date ranges after creating the client, by editing their record.
            </p>


            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : 'Add Client'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};