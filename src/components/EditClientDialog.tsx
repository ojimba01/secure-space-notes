import React, { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { VisitAvailabilitySection } from '@/components/VisitAvailability';
import { regenerateClientCycles } from '@/lib/billingSync';
import { regenerateTouchpointsForClient } from '@/lib/touchpoints';
import { useViewAs } from '@/components/ViewAsProvider';

const INSURANCE_OPTIONS = ['AETNA', 'HORIZON', 'WELLPOINT', 'UNITED HEALTH', 'FIDELIS'] as const;

const LON_OPTIONS = ['Low Level', 'High Level'] as const;

const APPROVAL_STATUS_OPTIONS = ['Not Submitted', 'Submitted', 'Approved', 'Denied'] as const;

const REASON_CLOSED_OPTIONS = [
  'Housed', 'Moved', 'Lost Contact', 'Deceased',
  'Transferred to Other Agency', 'Medicaid Expired', 'Other',
] as const;

const NJ_COUNTIES = [
  'ATLANTIC', 'BERGEN', 'BURLINGTON', 'CAMDEN', 'CAPE MAY', 'CUMBERLAND',
  'ESSEX', 'GLOUCESTER', 'HUDSON', 'HUNTERDON', 'MERCER', 'MIDDLESEX',
  'MONMOUTH', 'MORRIS', 'OCEAN', 'PASSAIC', 'SALEM', 'SOMERSET',
  'SUSSEX', 'UNION', 'WARREN',
] as const;

const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(20).optional(),
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
  hsp_150_date: z.string().optional(),
  hsp_180_date: z.string().optional(),
  hsp_due_date: z.string().optional(),
  next_action_due_date: z.string().optional(),
  closed_date: z.string().optional(),
  reason_closed: z.string().trim().max(100).optional(),
  auth_30_number: z.string().trim().max(100).optional(),
  auth_150_number: z.string().trim().max(100).optional(),
  auth_180_number: z.string().trim().max(100).optional(),
  auth_150_start: z.string().optional(),
  auth_150_end: z.string().optional(),
  auth_180_start: z.string().optional(),
  auth_180_end: z.string().optional(),
  status: z.enum(['active', 'inactive']),
  notes: z.string().trim().max(2000).optional(),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  member_id?: string;
  insurance?: string;
  level_of_need?: string;
  county?: string;
  status: string;
  intake_date: string;
  date_of_birth?: string;
  iat_date?: string;
  hsp_150_date?: string;
  hsp_180_date?: string;
  auth_150_start?: string;
  auth_150_end?: string;
  auth_180_start?: string;
  auth_180_end?: string;
  mco_housing_manager?: string;
  approval_status?: string;
  assessment_due_date?: string;
  hsp_due_date?: string;
  next_action_due_date?: string;
  closed_date?: string;
  reason_closed?: string;
  auth_30_number?: string;
  auth_150_number?: string;
  auth_180_number?: string;
  notes?: string;
}

interface EditClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: Client;
  onClientUpdated: () => void;
}

export const EditClientDialog: React.FC<EditClientDialogProps> = ({
  open,
  onOpenChange,
  client,
  onClientUpdated,
}) => {
  const { toast } = useToast();
  const { guardWrite } = useViewAs();
  const { isAdmin } = useIsAdmin();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      member_id: client.member_id || '',
      insurance: client.insurance || '',
      level_of_need: client.level_of_need || '',
      county: client.county || '',
      mco_housing_manager: client.mco_housing_manager || '',
      approval_status: client.approval_status || 'Not Submitted',
      date_of_birth: client.date_of_birth || '',
      intake_date: client.intake_date || '',
      assessment_due_date: client.assessment_due_date || '',
      iat_date: client.iat_date || '',
      hsp_150_date: client.hsp_150_date || '',
      hsp_180_date: client.hsp_180_date || '',
      hsp_due_date: client.hsp_due_date || '',
      next_action_due_date: client.next_action_due_date || '',
      closed_date: client.closed_date || '',
      reason_closed: client.reason_closed || '',
      auth_30_number: client.auth_30_number || '',
      auth_150_number: client.auth_150_number || '',
      auth_180_number: client.auth_180_number || '',
      auth_150_start: client.auth_150_start || '',
      auth_150_end: client.auth_150_end || '',
      auth_180_start: client.auth_180_start || '',
      auth_180_end: client.auth_180_end || '',
      status: client.status as 'active' | 'inactive',
      notes: client.notes || '',
    },
  });

  const handleSubmit = async (data: ClientFormData) => {
    // Sandbox (view-as): show the change happened, but skip the DB write.
    if (guardWrite()) {
      onOpenChange(false);
      return;
    }
    setIsSubmitting(true);


    try {
      const { error } = await supabase
        .from('clients')
        .update({
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
          intake_date: data.intake_date || null,
          assessment_due_date: data.assessment_due_date || null,
          iat_date: data.iat_date || null,
          hsp_150_date: data.hsp_150_date || null,
          hsp_180_date: data.hsp_180_date || null,
          hsp_due_date: data.hsp_due_date || null,
          next_action_due_date: data.next_action_due_date || null,
          closed_date: data.closed_date || null,
          reason_closed: data.reason_closed || null,
          auth_30_number: data.auth_30_number || null,
          auth_150_number: data.auth_150_number || null,
          auth_180_number: data.auth_180_number || null,
          auth_150_start: data.auth_150_start || null,
          auth_150_end: data.auth_150_end || null,
          auth_180_start: data.auth_180_start || null,
          auth_180_end: data.auth_180_end || null,
          status: data.status,
          notes: data.notes || null,
        })
        .eq('id', client.id);

      if (error) throw error;

      // Refresh billing cycles if auth dates or level of need changed.
      const billingChanged =
        (data.auth_150_start || '') !== (client.auth_150_start || '') ||
        (data.auth_150_end || '') !== (client.auth_150_end || '') ||
        (data.auth_180_start || '') !== (client.auth_180_start || '') ||
        (data.auth_180_end || '') !== (client.auth_180_end || '') ||
        (data.level_of_need || '') !== (client.level_of_need || '');
      if (billingChanged) {
        try {
          await regenerateClientCycles(client.id);
        } catch {
          /* non-fatal */
        }
      }

      // Regenerate touch-points if the HSP 150-day date or level of need changed.
      const touchpointsChanged =
        (data.hsp_150_date || '') !== (client.hsp_150_date || '') ||
        (data.level_of_need || '') !== (client.level_of_need || '');
      if (touchpointsChanged) {
        try {
          await regenerateTouchpointsForClient(client.id);
        } catch {
          /* non-fatal */
        }
      }

      toast({
        title: "Client Updated",
        description: "Client information has been updated successfully.",
      });

      onClientUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error updating client",
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
          <DialogTitle>Edit Client</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name *</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isAdmin} />
                    </FormControl>
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">Only admins can edit names</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name *</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={!isAdmin} />
                    </FormControl>
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">Only admins can edit names</p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="member_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member ID</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insurance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select insurance" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INSURANCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="level_of_need"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Level of Need (LoN)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select level of need" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LON_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="county"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>County</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select county" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NJ_COUNTIES.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="date_of_birth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input {...field} type="date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="mco_housing_manager" render={({ field }) => (
                <FormItem><FormLabel>MCO Housing Manager</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="intake_date" render={({ field }) => (
                <FormItem><FormLabel>Intake Date (Assessment Start)</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="assessment_due_date" render={({ field }) => (
                <FormItem><FormLabel>Assessment Due Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="hsp_due_date" render={({ field }) => (
                <FormItem><FormLabel>HSP Due Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="next_action_due_date" render={({ field }) => (
                <FormItem><FormLabel>Next Action Due Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
            </div>


            {(() => {
              const watchedIat = form.watch('iat_date');
              const watchedHsp150 = form.watch('hsp_150_date');
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const iatDue = watchedIat ? new Date(watchedIat) : null;
              if (iatDue) iatDue.setDate(iatDue.getDate() + 30);
              const hsp150Due = watchedHsp150 ? new Date(watchedHsp150) : null;
              if (hsp150Due) hsp150Due.setDate(hsp150Due.getDate() + 150);

              const lock150 = !iatDue || today < iatDue;
              const lock180 = !hsp150Due || today < hsp150Due;

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="iat_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IAT Start Date</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hsp_150_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HSP 150-day Start</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" disabled={lock150} />
                        </FormControl>
                        {lock150 && (
                          <p className="text-xs text-muted-foreground">
                            {iatDue
                              ? `Unlocks on ${iatDue.toLocaleDateString()} (after IAT 30-day due date)`
                              : 'Set the IAT start date first'}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="hsp_180_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HSP 180-day Start</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" disabled={lock180} />
                        </FormControl>
                        {lock180 && (
                          <p className="text-xs text-muted-foreground">
                            {hsp150Due
                              ? `Unlocks on ${hsp150Due.toLocaleDateString()} (after 150-day due date)`
                              : 'Set the HSP 150-day start first'}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              );
            })()}

            <div className="rounded-md border p-4 space-y-4">
              <div>
                <h4 className="text-sm font-semibold">Billing Authorization Period</h4>
                <p className="text-xs text-muted-foreground">
                  Drives the billing section. Distinct from HSP milestone dates above. All optional.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="auth_150_start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>150-Day Start</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="auth_150_end"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>150-Day End</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="auth_180_start"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>180-Day Start</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="auth_180_end"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>180-Day End</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>




            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={3} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Updating...' : 'Update Client'}
              </Button>
            </div>
          </form>
        </Form>

        <div className="pt-2">
          <VisitAvailabilitySection clientId={client.id} />
        </div>

      </DialogContent>
    </Dialog>
  );
};