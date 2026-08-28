import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/integrations/supabase/client';
import { DIGITS_ONLY_HINT, digitsOnly } from '@/lib/ids';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchActiveCaseManagers, caseManagerName, CaseManagerOption } from '@/lib/billingSync';
import { AlertTriangle } from 'lucide-react';

const INSURANCE_OPTIONS = ['Aetna', 'Horizon', 'Wellpoint', 'United Health', 'Fidelis'] as const;
const REFERRAL_CHANNELS = ['MCO', 'Hospital', 'Shelter', 'Self', 'Community partner', 'Other'] as const;
const NJ_COUNTIES = [
  'Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland',
  'Essex', 'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex',
  'Monmouth', 'Morris', 'Ocean', 'Passaic', 'Salem', 'Somerset',
  'Sussex', 'Union', 'Warren',
] as const;

const schema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  date_of_birth: z.string().optional(),
  member_id: z.string().trim().max(50).optional(),
  njhmis_id: z.string().trim().max(50).optional(),
  insurance: z.string().trim().max(50).optional(),
  county: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(100).optional(),
  referral_source: z.string().trim().max(200).optional(),
  referral_channel: z.string().trim().max(50).optional(),
  referral_received_date: z.string().optional(),
  assigned_employee_id: z.string().optional(),
});

type ReferralData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (clientId: string) => void;
}

/**
 * A referral is the entry point of the lifecycle: only what is known when the
 * referral arrives. Authorizations, assessments and billing come later, from
 * the client's own record.
 */
export const NewReferralDialog: React.FC<Props> = ({ open, onOpenChange, onCreated }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [caseManagers, setCaseManagers] = useState<CaseManagerOption[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const form = useForm<ReferralData>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '', last_name: '', date_of_birth: '', member_id: '', njhmis_id: '',
      insurance: '', county: '', phone: '', referral_source: '', referral_channel: '',
      referral_received_date: new Date().toISOString().slice(0, 10), assigned_employee_id: '',
    },
  });

  useEffect(() => {
    if (open && isAdmin) {
      fetchActiveCaseManagers().then(setCaseManagers).catch(() => setCaseManagers([]));
    }
  }, [open, isAdmin]);

  const first = form.watch('first_name');
  const last = form.watch('last_name');

  // Warn about look-alike records before another duplicate is created.
  useEffect(() => {
    if (!open || last.trim().length < 2) {
      setDuplicates([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('clients')
        .select('first_name, last_name, member_id')
        .is('deleted_at', null)
        .ilike('last_name', last.trim());
      if (cancelled) return;
      setDuplicates(
        (data ?? [])
          .filter((c) => !first.trim() || c.first_name.toLowerCase().startsWith(first.trim().slice(0, 3).toLowerCase()))
          .map((c) => `${c.last_name}, ${c.first_name}${c.member_id ? ` · ${c.member_id}` : ''}`),
      );
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, first, last]);

  const submit = async (data: ReferralData) => {
    setSaving(true);
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      const assignedId =
        data.assigned_employee_id && data.assigned_employee_id !== '__none__'
          ? data.assigned_employee_id
          : data.assigned_employee_id === '__none__'
            ? null
            : profile?.id ?? null;

      const { data: inserted, error } = await supabase
        .from('clients')
        .insert([{
          first_name: data.first_name,
          last_name: data.last_name,
          date_of_birth: data.date_of_birth || null,
          member_id: data.member_id || null,
          njhmis_id: data.njhmis_id || null,
          insurance: data.insurance || null,
          county: data.county || null,
          phone: data.phone || null,
          referral_source: data.referral_source || null,
          referral_channel: data.referral_channel || null,
          referral_received_date: data.referral_received_date || null,
          assigned_employee_id: assignedId,
          workflow_stage: 'referred',
          workflow_stage_updated_at: new Date().toISOString(),
          intake_status: 'not_started',
          status: 'active',
        }])
        .select('id')
        .single();
      if (error) throw error;

      toast({
        title: 'Referral created',
        description: 'Next step: complete the Initial Assessment Tool on the client record.',
      });
      form.reset();
      onOpenChange(false);
      if (inserted?.id) onCreated(inserted.id);
    } catch (err: any) {
      toast({ title: 'Could not create the referral', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New referral</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            {duplicates.length > 0 && (
              <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Possible existing record</p>
                  <p>{duplicates.slice(0, 4).join(' • ')}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField control={form.control} name="first_name" render={({ field }) => (
                <FormItem><FormLabel>First name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="last_name" render={({ field }) => (
                <FormItem><FormLabel>Last name *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="date_of_birth" render={({ field }) => (
                <FormItem><FormLabel>Date of birth</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="member_id" render={({ field }) => (
                <FormItem><FormLabel>Member ID</FormLabel><FormControl><Input {...field} inputMode="numeric" onChange={(e) => field.onChange(digitsOnly(e.target.value))} /></FormControl><FormDescription>{DIGITS_ONLY_HINT}</FormDescription><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="njhmis_id" render={({ field }) => (
                <FormItem><FormLabel>NJHMIS ID</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="insurance" render={({ field }) => (
                <FormItem>
                  <FormLabel>Insurance (MCO)</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {INSURANCE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="county" render={({ field }) => (
                <FormItem>
                  <FormLabel>County</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {NJ_COUNTIES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="referral_channel" render={({ field }) => (
                <FormItem>
                  <FormLabel>Referral came from</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {REFERRAL_CHANNELS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="referral_source" render={({ field }) => (
                <FormItem><FormLabel>Referring person or agency</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="referral_received_date" render={({ field }) => (
                <FormItem><FormLabel>Referral received</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              {isAdmin && (
                <FormField control={form.control} name="assigned_employee_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned case manager</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Assign to me" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="__none__">Unassigned</SelectItem>
                        {caseManagers.map((cm) => (
                          <SelectItem key={cm.id} value={cm.id}>{caseManagerName(cm)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              Authorizations, assessments and billing are added from the client record once the
              Initial Assessment Tool has been submitted.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create referral'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default NewReferralDialog;
