import React, { useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { DIGITS_ONLY_HINT, digitsOnly } from '@/lib/ids';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { VisitAvailabilitySection } from '@/components/VisitAvailability';
import { regenerateClientCycles } from '@/lib/billingSync';
import { regenerateTouchpointsForClient } from '@/lib/touchpoints';
import { useViewAs } from '@/components/ViewAsProvider';
import { MCO_OPTIONS } from '@/lib/billing';


const LON_OPTIONS = ['Low Level', 'High Level'] as const;


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
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  member_id: z.string().trim().max(50).optional(),
  insurance: z.string().trim().max(50).optional(),
  level_of_need: z.string().trim().max(50).optional(),
  county: z.string().trim().max(50).optional(),
  mco_housing_manager: z.string().trim().max(200).optional(),
  date_of_birth: z.string().optional(),
  intake_date: z.string().optional(),
  assessment_due_date: z.string().optional(),
  iat_date: z.string().optional(),
  hsp_150_date: z.string().optional(),
  hsp_180_date: z.string().optional(),
  hsp_due_date: z.string().optional(),
  hsp_start_date: z.string().optional(),
  hsp_end_date: z.string().optional(),
  closed_date: z.string().optional(),
  reason_closed: z.string().trim().max(100).optional(),
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
  lon_score?: number | null;
  county?: string;
  status: string;
  intake_date: string;
  date_of_birth?: string;
  iat_date?: string;
  hsp_150_date?: string;
  hsp_180_date?: string;
  mco_housing_manager?: string;
  assessment_due_date?: string;
  hsp_due_date?: string;
  hsp_start_date?: string;
  hsp_end_date?: string;
  closed_date?: string;
  reason_closed?: string;
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
      date_of_birth: client.date_of_birth || '',
      intake_date: client.intake_date || '',
      assessment_due_date: client.assessment_due_date || '',
      iat_date: client.iat_date || '',
      hsp_150_date: client.hsp_150_date || '',
      hsp_180_date: client.hsp_180_date || '',
      hsp_due_date: client.hsp_due_date || '',
      hsp_start_date: client.hsp_start_date || '',
      hsp_end_date: client.hsp_end_date || '',
      closed_date: client.closed_date || '',
      reason_closed: client.reason_closed || '',
      status: client.status as 'active' | 'inactive',
      notes: client.notes || '',
    },
  });

  /**
   * Only United assigns a housing specialist, so only a United client is asked
   * for one. Watched rather than read once, so the box appears and disappears
   * as the payer is changed rather than on the next open.
   */
  const insurance = form.watch('insurance');
  const isUnited = (insurance ?? '').toLowerCase().includes('united');

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
          date_of_birth: data.date_of_birth || null,
          intake_date: data.intake_date || null,
          assessment_due_date: data.assessment_due_date || null,
          iat_date: data.iat_date || null,
          hsp_150_date: data.hsp_150_date || null,
          hsp_180_date: data.hsp_180_date || null,
          hsp_due_date: data.hsp_due_date || null,
          hsp_start_date: data.hsp_start_date || null,
          hsp_end_date: data.hsp_end_date || null,
          closed_date: data.closed_date || null,
          reason_closed: data.reason_closed || null,
          ...(isUnited ? { mco_housing_manager: data.mco_housing_manager || null } : {}),
          status: data.status,
          notes: data.notes || null,
        })
        .eq('id', client.id);

      if (error) throw error;

      // Authorization dates are no longer edited here — the Authorizations
      // panel rebuilds cycles when it changes them. Level of need still sets
      // the billing rate, so a change to it has to rebuild them from here.
      const billingChanged =
        (data.level_of_need || '') !== (client.level_of_need || '');
      if (billingChanged) {
        try {
          await regenerateClientCycles(client.id);
        } catch (err: any) {
          toast({
            title: 'Billing cycles were not rebuilt',
            description: `${err.message} — save again to retry.`,
            variant: 'destructive',
          });
        }
      }

      // Touchpoint frequency comes from the level of need; hsp_150_date is
      // still the fallback service anchor for records that predate
      // authorization tracking, so a change to either reschedules.
      const touchpointsChanged =
        (data.hsp_150_date || '') !== (client.hsp_150_date || '') ||
        (data.level_of_need || '') !== (client.level_of_need || '');
      if (touchpointsChanged) {
        try {
          await regenerateTouchpointsForClient(client.id);
        } catch (err: any) {
          toast({
            title: 'Touchpoints were not rescheduled',
            description: err.message,
            variant: 'destructive',
          });
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
                      <Input
                        {...field}
                        inputMode="numeric"
                        onChange={(e) => field.onChange(digitsOnly(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>{DIGITS_ONLY_HINT}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insurance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Insurance (MCO)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select insurance" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MCO_OPTIONS.map((opt) => (
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
                    <Select onValueChange={field.onChange} value={field.value || ''} disabled={!isAdmin}>
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
                    {!isAdmin && (
                      <p className="text-xs text-muted-foreground">
                        Level of need is set from the LoN assessment by an admin.
                      </p>
                    )}
                    {/* The database enforces this either way. Saying so here
                        stops High being chosen and then silently reverting. */}
                    {isAdmin
                      && typeof client.lon_score === 'number'
                      && client.lon_score < 18
                      && field.value === 'High Level' && (
                      <p className="text-xs text-destructive">
                        This client scored {client.lon_score} on the LoN, below the 18 needed
                        for High. Saving will record them as Low Level. Update the score
                        from the LoN form if that is wrong.
                      </p>
                    )}
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

            {isUnited && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="mco_housing_manager" render={({ field }) => (
                  <FormItem><FormLabel>MCO Housing Specialist</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="intake_date" render={({ field }) => (
                <FormItem><FormLabel>Intake Start Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="assessment_due_date" render={({ field }) => (
                <FormItem><FormLabel>Intake End Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="hsp_start_date" render={({ field }) => (
                <FormItem><FormLabel>HSP Start Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="hsp_end_date" render={({ field }) => (
                <FormItem><FormLabel>HSP End Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="hsp_due_date" render={({ field }) => (
                <FormItem><FormLabel>HSP Due Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
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

            <div className="rounded-md border p-4">
              <h4 className="text-sm font-semibold">Authorizations</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Authorization numbers and dates are edited in the Authorizations panel on the
                client record. Recording them there keeps billing cycles and touchpoint windows
                in step, and keeps the full history rather than only the latest of each type.
              </p>
            </div>

            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Closure</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="closed_date" render={({ field }) => (
                  <FormItem><FormLabel>Closed Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="reason_closed" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason Closed</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger></FormControl>
                      <SelectContent>{REASON_CLOSED_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
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