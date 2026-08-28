// Closing a case ends the work, not the record.
//
// The client, their forms, notes, touchpoints and billing history all stay
// exactly where they are. What changes is that the lifecycle moves to Closed,
// so the app stops asking anyone to do anything for them.
//
// Deliberately does NOT set status to inactive. Billing only counts active
// clients, and a case is routinely closed while its last cycles are still
// inside the six-month filing window — deactivating here would hide money that
// can still be claimed. The dialog says how many of those are outstanding so
// closing is never a surprise.

import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useViewAs } from '@/components/ViewAsProvider';
import { isStillBillable, todayAgency, type BillingCycle } from '@/lib/billing';

const REASON_OPTIONS = [
  'Housed',
  'Moved',
  'Lost Contact',
  'Deceased',
  'Transferred to Other Agency',
  'Medicaid Expired',
  'Other',
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onClosed: () => void;
}

export const CloseCaseDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  onClosed,
}) => {
  const { toast } = useToast();
  const { isViewingAs } = useViewAs();
  const [reason, setReason] = useState<string>('');
  const [reasonOther, setReasonOther] = useState('');
  const [closedDate, setClosedDate] = useState(todayAgency());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [outstanding, setOutstanding] = useState<number | null>(null);

  const loadOutstanding = useCallback(async () => {
    const { data } = await supabase
      .from('billing_cycles')
      .select('cycle_end, final_deadline, approval_state, billing_status')
      .eq('client_id', clientId)
      .eq('is_active', true);
    const rows = (data ?? []) as unknown as BillingCycle[];
    setOutstanding(
      rows.filter((c) => isStillBillable(c) && c.billing_status !== 'Submitted').length,
    );
  }, [clientId]);

  useEffect(() => {
    if (open) {
      setReason('');
      setReasonOther('');
      setClosedDate(todayAgency());
      setNotes('');
      setOutstanding(null);
      loadOutstanding();
    }
  }, [open, loadOutstanding]);

  const save = async () => {
    if (isViewingAs) {
      toast({ title: 'Preview only', description: 'Changes are not saved while viewing as an employee.' });
      return;
    }
    if (!reason) {
      toast({ title: 'Choose a reason for closing', variant: 'destructive' });
      return;
    }
    const finalReason = reason === 'Other' ? reasonOther.trim() || 'Other' : reason;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          workflow_stage: 'closed',
          workflow_stage_updated_at: new Date().toISOString(),
          closed_date: closedDate,
          reason_closed: finalReason,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        })
        .eq('id', clientId);
      if (error) throw error;

      toast({
        title: 'Case closed',
        description: `${clientName} is no longer an open case. Nothing has been deleted.`,
      });
      onOpenChange(false);
      onClosed();
    } catch (err: any) {
      toast({ title: 'Could not close the case', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Close this case?</DialogTitle>
          <DialogDescription>
            {clientName} stops appearing as work: no next step, no touchpoints to make. The record,
            forms, notes and billing history all stay exactly as they are, and the case can be
            reopened by changing the stage back.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason for closing</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a reason" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === 'Other' && (
              <Input
                placeholder="Reason for closing"
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="closed-date">Date closed</Label>
            <Input
              id="closed-date"
              type="date"
              value={closedDate}
              onChange={(e) => setClosedDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="close-notes">Closing note (optional)</Label>
            <Textarea
              id="close-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes for the record"
            />
          </div>

          {outstanding !== null && (
            <div
              className={`rounded-md border p-3 text-sm ${
                outstanding > 0
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-slate-200 bg-muted/30 text-muted-foreground'
              }`}
            >
              {outstanding > 0 ? (
                <>
                  <span className="font-medium">
                    {outstanding} billing cycle{outstanding === 1 ? '' : 's'} can still be filed.
                  </span>{' '}
                  Closing does not change that — they stay in Billing until they are submitted or
                  their six-month window closes.
                </>
              ) : (
                'No billing cycles are outstanding for this client.'
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Closing…' : 'Close case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CloseCaseDialog;
