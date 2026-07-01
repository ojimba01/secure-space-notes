import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { BillingCycle, BILLING_STATUSES, PAYMENT_STATUSES, todayAgency } from '@/lib/billing';

interface Props {
  cycle: BillingCycle | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export const BillingCycleDialog: React.FC<Props> = ({ cycle, open, onOpenChange, onSaved }) => {
  const [form, setForm] = useState<Partial<BillingCycle>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (cycle) setForm({ ...cycle });
  }, [cycle]);

  if (!cycle) return null;

  const set = (k: keyof BillingCycle, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('billing_cycles')
      .update({
        cycle_start: form.cycle_start,
        cycle_end: form.cycle_end,
        phase: form.phase,
        billed_amount: form.billed_amount === null || form.billed_amount === undefined ? null : Number(form.billed_amount),
        paid_amount: Number(form.paid_amount ?? 0),
        billing_status: form.billing_status,
        payment_status: form.payment_status,
        claim_number: form.claim_number || null,
        submitted_date: form.submitted_date || null,
        paid_date: form.paid_date || null,
        notes: form.notes || null,
        is_auto_generated: false, // hand-edited: never overwrite on regenerate
      })
      .eq('id', cycle.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Cycle updated');
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit cycle #{cycle.cycle_number}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Cycle start</Label>
            <Input type="date" value={form.cycle_start ?? ''} onChange={(e) => set('cycle_start', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Cycle end</Label>
            <Input type="date" value={form.cycle_end ?? ''} onChange={(e) => set('cycle_end', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Phase</Label>
            <Select value={form.phase} onValueChange={(v) => set('phase', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="150-Day">150-Day</SelectItem>
                <SelectItem value="180-Day">180-Day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Billed amount ($)</Label>
            <Input type="number" value={form.billed_amount ?? ''} onChange={(e) => set('billed_amount', e.target.value === '' ? null : e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Billing status</Label>
            <Select value={form.billing_status} onValueChange={(v) => {
              set('billing_status', v);
              if (v === 'Submitted' && !form.submitted_date) set('submitted_date', todayAgency());
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BILLING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Payment status</Label>
            <Select value={form.payment_status} onValueChange={(v) => {
              set('payment_status', v);
              if (v === 'Paid') {
                if (!form.paid_amount) set('paid_amount', form.billed_amount ?? 0);
                if (!form.paid_date) set('paid_date', todayAgency());
              }
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Paid amount ($)</Label>
            <Input type="number" value={form.paid_amount ?? 0} onChange={(e) => set('paid_amount', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Claim number</Label>
            <Input value={form.claim_number ?? ''} onChange={(e) => set('claim_number', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Submitted date</Label>
            <Input type="date" value={form.submitted_date ?? ''} onChange={(e) => set('submitted_date', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Paid date</Label>
            <Input type="date" value={form.paid_date ?? ''} onChange={(e) => set('paid_date', e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
