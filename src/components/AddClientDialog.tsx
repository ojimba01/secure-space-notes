import React, { useState, useEffect, useRef } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchActiveCaseManagers, caseManagerName, CaseManagerOption } from '@/lib/billingSync';
import { syncAuthorizationsFromLegacyColumns, resyncDerivedSchedules } from '@/lib/authorizations';
import { regenerateTouchpointsForStaff } from '@/lib/touchpoints';
import { MCO_OPTIONS, hspDueDateFor, addDays } from '@/lib/billing';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { FileUp, Loader2 } from 'lucide-react';
import {
  applyIntake,
  nameFromReadings,
  proposeFromReadings,
  readDroppedDocuments,
  type DocumentReading,
} from '@/lib/documentIntake';

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
  phone: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  member_id: z.string().trim().max(50).optional(),
  insurance: z.string().trim().max(50).optional(),
  level_of_need: z.string().trim().max(50).optional(),
  lon_score: z.string().trim().max(3).optional(),
  county: z.string().trim().max(50).optional(),
  mco_housing_manager: z.string().trim().max(200).optional(),
  date_of_birth: z.string().optional(),
  intake_date: z.string().optional(),
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
  closed_date: z.string().optional(),
  reason_closed: z.string().trim().max(100).optional(),
  assigned_employee_id: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});


type ClientFormData = z.infer<typeof clientSchema>;

interface AddClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * `created` names the client that was just added, so the caller can carry on
   * with them — recording a touchpoint, for instance, which needs a client
   * that exists.
   */
  onClientAdded: (created?: { id: string; name: string; levelOfNeed: string | null }) => void;
  /** Called instead of onClientAdded when the touchpoint button was used. */
  onAddTouchpoint?: (created: { id: string; name: string; levelOfNeed: string | null }) => void;
}

export const AddClientDialog: React.FC<AddClientDialogProps> = ({
  open,
  onOpenChange,
  onClientAdded,
  onAddTouchpoint,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caseManagers, setCaseManagers] = useState<CaseManagerOption[]>([]);
  /**
   * Documents first, because the answers are usually already in a folder.
   * Typing a member ID that a PDF is holding is work nobody needs to do.
   */
  const [step, setStep] = useState<'documents' | 'form'>('documents');
  const [readings, setReadings] = useState<DocumentReading[]>([]);
  const [reading, setReading] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      fetchActiveCaseManagers().then(setCaseManagers).catch(() => setCaseManagers([]));
      setStep('documents');
      setReadings([]);
    }
  }, [open]);

  /**
   * Read what was dropped in and put it into the form.
   *
   * Straight into the fields rather than a separate confirmation list: the
   * form is already the place where every one of these values is checked and
   * corrected, so a review step before it would ask the same question twice.
   */
  const takeDocuments = async (files: File[]) => {
    if (!files.length) return;
    setReading(`Reading 0 of ${files.length}`);
    try {
      const result = await readDroppedDocuments(files, (done, total) =>
        setReading(`Reading ${done} of ${total}`),
      );
      setReadings(result);

      const { proposals } = proposeFromReadings(result);
      const byColumn: Record<string, string> = {};
      for (const p of proposals) byColumn[p.column] = p.value;
      if (byColumn.member_id) form.setValue('member_id', byColumn.member_id);
      if (byColumn.date_of_birth) form.setValue('date_of_birth', byColumn.date_of_birth);

      const name = nameFromReadings(result);
      if (name) {
        // Documents write a name either way round. A comma is the tell.
        const [first, last] = name.includes(',')
          ? [name.split(',')[1]?.trim() ?? '', name.split(',')[0]?.trim() ?? '']
          : [name.split(/\s+/)[0] ?? '', name.split(/\s+/).slice(1).join(' ')];
        if (first) form.setValue('first_name', first);
        if (last) form.setValue('last_name', last);
      }

      const found = Object.keys(byColumn).length + (name ? 1 : 0);
      toast({
        title: found
          ? `${found} detail${found === 1 ? '' : 's'} read from ${files.length} document${files.length === 1 ? '' : 's'}`
          : 'Nothing could be read from those',
        description: found ? 'Check every box before saving.' : undefined,
      });
      setStep('form');
    } catch (err: any) {
      toast({ title: 'Could not read those', description: err.message, variant: 'destructive' });
    } finally {
      setReading('');
    }
  };

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
      lon_score: '',
      county: '',
      mco_housing_manager: '',
      date_of_birth: '',
      intake_date: '',
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
      closed_date: '',
      reason_closed: '',
      assigned_employee_id: '',
      notes: '',
    },
  });


  /** Only United assigns a housing specialist, so only United is asked for one. */
  const insuranceValue = form.watch('insurance');
  const auth30Start = form.watch('auth_30_start');
  const derivedHspDue = hspDueDateFor(auth30Start || null);
  const isUnited = (insuranceValue ?? '').toLowerCase().includes('united');

  const handleSubmit = async (data: ClientFormData, thenTouchpoint = false) => {
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
        lon_score: data.lon_score ? Number(data.lon_score) : null,
        county: data.county || null,
        date_of_birth: data.date_of_birth || null,
        intake_date: data.intake_date || undefined,
        // The IAT start and the 30-day authorization start are the same
        // day. Asked for once, stored in both, so the milestone displays
        // that read iat_date keep working.
        iat_date: data.auth_30_start || null,
        hsp_due_date: hspDueDateFor(data.auth_30_start || null),
        auth_30_number: data.auth_30_number || null,
        auth_30_start: data.auth_30_start || null,
        // The authorization still runs its full 30 days for billing, even
        // though the plan is due on the 25th. Derived, not asked for.
        auth_30_end: data.auth_30_start ? addDays(data.auth_30_start, 29) : null,
        auth_150_number: data.auth_150_number || null,
        auth_150_start: data.auth_150_start || null,
        auth_150_end: data.auth_150_end || null,
        auth_180_number: data.auth_180_number || null,
        auth_180_start: data.auth_180_start || null,
        auth_180_end: data.auth_180_end || null,
        closed_date: data.closed_date || null,
        reason_closed: data.reason_closed || null,
        notes: data.notes || null,
        assigned_employee_id: assignedId,
        ...(isUnited ? { mco_housing_manager: data.mco_housing_manager || null } : {}),
        // Place the record in the lifecycle from the authorizations entered.
        workflow_stage: data.auth_150_start
          ? 'active_authorization'
          : data.auth_30_start
            ? 'initial_30_active'
            : 'referred',
      };


      const { data: inserted, error } = await supabase
        .from('clients')
        .insert([clientData])
        .select('id')
        .single();

      if (error) throw error;

      // Authorization dates entered here have to reach both places: the
      // history in client_authorizations, and the billing cycles and
      // touchpoints derived from them. Doing one without the other is the
      // single most repeated source of defects in this app, so both helpers
      // are called, in this order, exactly as everywhere else.
      if (inserted?.id) {
        try {
          await syncAuthorizationsFromLegacyColumns(inserted.id);
          await resyncDerivedSchedules(inserted.id);
        } catch (err: any) {
          toast({
            title: 'The client was created, but their schedule was not built',
            description: `${err.message} — open the client and save again to retry.`,
            variant: 'destructive',
          });
        }
        // Spread the new client into the assigned case manager's existing
        // schedule rather than leaving it bunched.
        if (assignedId) {
          try {
            await regenerateTouchpointsForStaff(assignedId);
          } catch {
            // Their other clients keep the schedule they already had.
          }
        }
      }



      toast({
        title: 'Client added',
        description: `${data.first_name} ${data.last_name} is now on the client list.`,
      });

      // The documents that filled this form belong on the client they made.
      // A failure here must not lose the client that was just created, so it
      // is reported and the rest carries on.
      if (readings.length && profileId) {
        try {
          await applyIntake(inserted.id, profileId, readings, {});
        } catch (err: any) {
          toast({
            title: 'Client saved, but the documents were not filed',
            description: err.message,
            variant: 'destructive',
          });
        }
      }

      const created = {
        id: inserted.id,
        name: `${data.first_name} ${data.last_name}`.trim(),
        levelOfNeed: data.level_of_need || null,
      };

      onOpenChange(false);
      form.reset();
      if (thenTouchpoint && onAddTouchpoint) onAddTouchpoint(created);
      else onClientAdded(created);
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

        {step === 'documents' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              takeDocuments([...e.dataTransfer.files]);
            }}
            className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-10 text-center ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
            }`}
          >
            {reading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm">{reading}</p>
              </>
            ) : (
              <>
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">
                  Drop this client's documents here and the form fills itself.
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  The name, member ID and date of birth are read out of them, in your browser.
                  Nothing is sent anywhere to be read, and you check every box before saving.
                </p>
                <div className="flex gap-2">
                  <Button type="button" onClick={() => fileInput.current?.click()}>
                    Choose files
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setStep('form')}>
                    Enter it myself
                  </Button>
                </div>
              </>
            )}
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = [...(e.target.files ?? [])];
                e.target.value = '';
                takeDocuments(files);
              }}
            />
          </div>
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit((d) => handleSubmit(d, false))} className="space-y-4">
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
                    <FormLabel>Insurance (MCO)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ''}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select MCO" /></SelectTrigger></FormControl>
                      <SelectContent>{MCO_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}</SelectContent>
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
                {isUnited && (
                  <FormField control={form.control} name="mco_housing_manager" render={({ field }) => (
                    <FormItem><FormLabel>MCO Housing Specialist</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
              </div>
            </div>

            {/* Section: Status */}
            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Status</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <FormField control={form.control} name="lon_score" render={({ field }) => (
                  <FormItem>
                    <FormLabel>LoN Score</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        inputMode="numeric"
                        onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                      />
                    </FormControl>
                    <FormDescription>
                      A score under 18 sets the level to Low.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </div>

            {/* Section: Dates & authorizations */}
            <div className="rounded-md border p-4 space-y-4">
              <h4 className="text-sm font-semibold">Dates &amp; Authorizations</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="intake_date" render={({ field }) => (
                  <FormItem><FormLabel>Intake Date</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">30-Day Authorization</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="auth_30_number" render={({ field }) => (
                    <FormItem><FormLabel>30-Day Auth #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_30_start" render={({ field }) => (
                    <FormItem><FormLabel>30-Day Start Date (IAT)</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                  {/* Derived, never typed. The plan is due on the 25th day of the
                      initial authorization, counting its start as day 1. A
                      deadline somebody can overtype is one that can be wrong. */}
                  <FormItem>
                    <FormLabel>HSP Due Date</FormLabel>
                    <div className="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm">
                      {derivedHspDue ?? 'Calculated once IAT date is entered'}
                    </div>
                  </FormItem>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">150-Day Authorization (drives billing)</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="auth_150_number" render={({ field }) => (
                    <FormItem><FormLabel>150-Day Auth #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_150_start" render={({ field }) => (
                    <FormItem><FormLabel>150-Day Start</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_150_end" render={({ field }) => (
                    <FormItem><FormLabel>150-Day End</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">180-Day Authorization</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField control={form.control} name="auth_180_number" render={({ field }) => (
                    <FormItem><FormLabel>180-Day Auth #</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_180_start" render={({ field }) => (
                    <FormItem><FormLabel>180-Day Start</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="auth_180_end" render={({ field }) => (
                    <FormItem><FormLabel>180-Day End</FormLabel><FormControl><Input {...field} type="date" /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
            </div>

            {/* Section: Notes */}
            <FormField control={form.control} name="notes" render={({ field }) => (
              <FormItem><FormLabel>Initial Notes</FormLabel><FormControl><Textarea {...field} rows={3} /></FormControl><FormMessage /></FormItem>
            )} />

            {/* Saves the client, then opens their touchpoint straight away —
                the usual next step, and the client has to exist first. */}
            <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => form.handleSubmit((d) => handleSubmit(d, true))()}
              >
                Add touchpoint
              </Button>
              <span className="text-sm text-muted-foreground">
                Saves this client, then opens their first touchpoint.
              </span>
            </div>

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
        )}
      </DialogContent>
    </Dialog>
  );
};