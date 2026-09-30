// Deactivate a staff member's account, after a confirmation.
//
// Nothing is deleted: the account can no longer sign in, the person drops out
// of staff lists and Staff activity, and their open clients become unassigned
// so they can be reassigned. Advanced tools lists deactivated staff and can
// reactivate them.
import React, { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  name: string;
  onDeactivated: () => void;
}

export const DeactivateStaffDialog: React.FC<Props> = ({ open, onOpenChange, profileId, name, onDeactivated }) => {
  const { toast } = useToast();
  const [openClients, setOpenClients] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOpenClients(null);
    void supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_employee_id', profileId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .then(({ count }) => setOpenClients(count ?? 0));
  }, [open, profileId]);

  const deactivate = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('deactivate_user', { _profile_id: profileId });
      if (error) throw error;
      toast({ title: 'Account deactivated', description: `${name} can no longer sign in.` });
      onOpenChange(false);
      onDeactivated();
    } catch (err) {
      toast({
        title: 'Unable to deactivate account',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Deactivate {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>They will no longer be able to sign in, and they will be hidden from staff lists.</p>
              {!!openClients && (
                <p className="font-medium text-amber-800">
                  Their {openClients} open client{openClients === 1 ? '' : 's'} will become unassigned and
                  need to be reassigned.
                </p>
              )}
              <p>Nothing is deleted. You can reactivate the account in Advanced tools.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              void deactivate();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {saving ? 'Deactivating…' : 'Deactivate account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
