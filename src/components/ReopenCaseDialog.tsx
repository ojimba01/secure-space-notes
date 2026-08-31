import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  recordAuthorization,
  resyncDerivedSchedules,
  syncAuthorizationsFromLegacyColumns,
} from '@/lib/authorizations';
import { addDays } from '@/lib/billing';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onReopened: () => void;
}

/**
 * Open a closed case again, with a new authorization.
 *
 * A client who comes back is the same person with a second referral: the old
 * forms, documents and billing stay exactly where they are, and the new round
 * is a new 30-day authorization on top of them. Nothing is overwritten and
 * nothing is deleted, which is the whole reason a closed case is kept.
 */
export const ReopenCaseDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  onReopened,
}) => {
  const { toast } = useToast();
  const [start, setStart] = useState('');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const reopen = async () => {
    if (!start) {
      toast({ title: 'Enter the new 30-day start date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          status: 'active',
          workflow_stage: 'intake',
          closed_date: null,
          reason_closed: null,
          workflow_stage_updated_at: new Date().toISOString(),
          // The second round starts here. The plan has to go in again, so the
          // flag is cleared rather than carried over from the first.
          hsp_submitted: false,
          auth_30_start: start,
          auth_30_end: addDays(start, 29),
          auth_30_number: number.trim() || null,
          iat_date: start,
        } as never)
        .eq('id', clientId);
      if (error) throw error;

      // A new period, numbered after the old ones rather than replacing them.
      await recordAuthorization({
        clientId,
        type: 'initial_30',
        startDate: start,
        authorizationNumber: number.trim() || null,
      }).catch(() => undefined);

      await syncAuthorizationsFromLegacyColumns(clientId);
      await resyncDerivedSchedules(clientId);

      toast({
        title: 'Case reopened',
        description: `${clientName} is active again. Their earlier forms and billing are unchanged.`,
      });
      onOpenChange(false);
      onReopened();
    } catch (err: any) {
      toast({ title: 'Could not reopen the case', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen {clientName}</DialogTitle>
          <DialogDescription>
            Their earlier forms, documents and billing stay as they are. This starts a new
            30-day authorization on top of them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reopen-start">New 30-day start date</Label>
            <Input
              id="reopen-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The IAT date for this round. Billing cycles and touchpoints are counted from it.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reopen-number">30-day authorization number</Label>
            <Input
              id="reopen-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Add it later if you do not have it yet"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A new IAT, LON and HSP are needed for this round. Add them on the Forms tab.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={reopen} disabled={saving}>
            {saving ? 'Reopening' : 'Reopen case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
