import React, { useEffect, useState } from 'react';
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
import { reopenCaseFields, STAGE_COLUMNS, type StageFields } from '@/lib/reopenCase';
import { regenerateTouchpointsForClient, regenerateTouchpointsForStaff } from '@/lib/touchpoints';
import { visibleProfiles } from '@/lib/testAccounts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  /** Who held the case when it closed. Offered first, if they are still active. */
  currentEmployeeId?: string | null;
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
  currentEmployeeId,
  onReopened,
}) => {
  const { toast } = useToast();
  // Who takes the case. Reopening used to hand it back to whoever held it
  // when it closed, without asking - often someone who had since left or been
  // moved - and reassigning was a separate trip to another screen.
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [assignee, setAssignee] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      // Everyone active, superadmins included: they carry caseloads too, and
      // leaving them out meant a case of theirs could not go back to them.
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, email')
        .eq('active', true)
        .order('first_name');
      if (cancelled) return;
      const list = visibleProfiles(profs)
        .map((p) => ({
          id: p.id as string,
          name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email as string),
        }));
      setManagers(list);
      // The case manager they had, if they can still take it; otherwise blank,
      // so a case never reopens onto somebody who is no longer here.
      setAssignee(currentEmployeeId && list.some((m) => m.id === currentEmployeeId) ? currentEmployeeId : '');
    })();
    return () => { cancelled = true; };
  }, [open, currentEmployeeId]);
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
      toast({ title: 'Enter a 30-day start date', variant: 'destructive' });
      return;
    }
    if (!assignee) {
      toast({ title: 'Select a case manager', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from('clients')
        .select(STAGE_COLUMNS)
        .eq('id', clientId)
        .maybeSingle();
      const reopened = reopenCaseFields(
        newRound ? { startDate: start, authorizationNumber: number } : null,
        new Date(),
        (current ?? {}) as StageFields,
      );

      const { error } = await supabase
        .from('clients')
        .update(reopened as never)
        .eq('id', clientId);
      if (error) throw error;

      // Through reassign_client, as the Reassign button does, so the change of
      // hands is written to the case's History like any other.
      if (assignee !== currentEmployeeId) {
        const { error: reassignError } = await supabase.rpc('reassign_client', {
          _client_id: clientId,
          _new_employee_id: assignee,
          _reason: 'Assigned when the case was reopened',
        });
        if (reassignError) throw reassignError;
        await regenerateTouchpointsForStaff(assignee).catch(() => {});
        if (currentEmployeeId) await regenerateTouchpointsForStaff(currentEmployeeId).catch(() => {});
      }
      await regenerateTouchpointsForClient(clientId).catch(() => {});

      if (!newRound) {
        // Billing cycles are switched off while a case is closed; bring them back.
        await resyncDerivedSchedules(clientId).catch(() => undefined);
      }

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
          ? `${clientName} is active with a new 30-day authorization.`
          : `${clientName} has been restored.`,
      });
      close(false);
      onReopened();
    } catch (err: any) {
      toast({ title: 'Unable to reopen case', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reopen case</DialogTitle>
          <DialogDescription>
            {clientName}. Select a case manager and a reason.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reopen-assignee">Case manager</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="reopen-assignee">
                <SelectValue placeholder="Select a case manager" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentEmployeeId && !managers.some((m) => m.id === currentEmployeeId) && managers.length > 0 && (
              <p className="text-xs text-amber-700">
                The previous case manager is inactive. Select a new case manager.
              </p>
            )}
          </div>

          <div className="space-y-2" role="radiogroup" aria-label="Reason for reopening">
            <button
              type="button"
              role="radio"
              aria-checked={!newRound}
              onClick={() => setNewRound(false)}
              className={`w-full rounded-md border p-3 text-left text-sm ${!newRound ? 'border-primary bg-primary/5' : ''}`}
            >
              <span className="font-medium">Closed in error</span>
              <span className="block text-xs text-muted-foreground">
                Restore the case with its existing authorizations.
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={newRound}
              onClick={() => setNewRound(true)}
              className={`w-full rounded-md border p-3 text-left text-sm ${newRound ? 'border-primary bg-primary/5' : ''}`}
            >
              <span className="font-medium">New referral</span>
              <span className="block text-xs text-muted-foreground">
                Start a new 30-day authorization.
              </span>
            </button>
          </div>

          {newRound && (
            <div className="space-y-3 rounded-md border border-dashed p-3">
              <div className="space-y-1.5">
                <Label htmlFor="reopen-start">30-day start date</Label>
                <Input
                  id="reopen-start"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Used for billing cycles and touchpoints.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reopen-number">Authorization number</Label>
                <Input
                  id="reopen-number"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Submit a new IAT, LON, and HSP on the Forms tab.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={reopen} disabled={saving || !assignee}>
            {saving ? 'Reopening…' : 'Reopen case'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
