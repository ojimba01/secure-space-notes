import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { reopenCaseFields } from '@/lib/reopenCase';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onReopened: () => void;
}

/**
 * Open a closed case again.
 *
 * Two different things are called reopening. Usually the case was closed by
 * mistake, or closed early, and reopening it should put it back exactly as it
 * was — same authorizations, same stage, same forms owed. Sometimes the client
 * has genuinely come back on a second referral, and that round starts with a
 * new 30-day authorization.
 *
 * This asked for the new authorization every time, so undoing a misclick meant
 * inventing a start date, and inventing one moved the case back to intake and
 * put the HSP back on the list. Now the authorization is the thing you opt
 * into; without it nothing but the closure itself is undone.
 *
 * Either way the old forms, documents and billing stay exactly where they are,
 * which is the whole reason a closed case is kept.
 */
export const ReopenCaseDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  onReopened,
}) => {
  const { toast } = useToast();
  const [newRound, setNewRound] = useState(false);
  const [start, setStart] = useState('');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const close = (next: boolean) => {
    if (!next) {
      setNewRound(false);
      setStart('');
      setNumber('');
    }
    onOpenChange(next);
  };

  const reopen = async () => {
    if (newRound && !start) {
      toast({ title: 'Enter the new 30-day start date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const reopened = reopenCaseFields(
        newRound ? { startDate: start, authorizationNumber: number } : null,
      );

      const { error } = await supabase
        .from('clients')
        .update(reopened as never)
        .eq('id', clientId);
      if (error) throw error;

      if (newRound) {
        // A new period, numbered after the old ones rather than replacing them.
        await recordAuthorization({
          clientId,
          type: 'initial_30',
          startDate: start,
          authorizationNumber: number.trim() || null,
        }).catch(() => undefined);

        await syncAuthorizationsFromLegacyColumns(clientId);
        await resyncDerivedSchedules(clientId);
      }

      toast({
        title: 'Case reopened',
        description: newRound
          ? `${clientName} is active again on a new 30-day authorization. Their earlier forms and billing are unchanged.`
          : `${clientName} is back exactly as they were.`,
      });
      close(false);
      onReopened();
    } catch (err: any) {
      toast({ title: 'Could not reopen the case', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen {clientName}</DialogTitle>
          <DialogDescription>
            This puts the case back as it was. Their authorizations, forms, documents and
            billing are untouched.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
            <Checkbox
              checked={newRound}
              onCheckedChange={(v) => setNewRound(v === true)}
              className="mt-0.5"
            />
            <span>
              They have come back on a new referral
              <span className="block text-xs text-muted-foreground">
                Starts a second 30-day authorization on top of the old ones. Leave this alone
                if the case was closed by mistake or closed early.
              </span>
            </span>
          </label>

          {newRound && (
            <div className="space-y-3 rounded-md border border-dashed p-3">
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
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
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
