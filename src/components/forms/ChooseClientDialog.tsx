// The first step of filling in a blank form: which client it is for. The form
// opens only once a client is chosen, already filled in with their details.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ClientPicker, type PickableClient } from '@/components/ClientPicker';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useViewAs } from '@/components/ViewAsProvider';

interface Props {
  formName: string;
  profileId: string;
  onCancel: () => void;
  onChoose: (client: { id: string; name: string }) => void;
}

export const ChooseClientDialog: React.FC<Props> = ({ formName, profileId, onCancel, onChoose }) => {
  const { isAdmin } = useIsAdmin();
  const { isViewingAs } = useViewAs();
  const [clients, setClients] = useState<PickableClient[] | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let query = supabase
        .from('clients')
        .select('id, first_name, last_name, member_id')
        .is('deleted_at', null)
        .neq('status', 'closed')
        .order('first_name');
      // Staff file forms for their own clients only, as in the form itself.
      if (!isAdmin || isViewingAs) query = query.eq('assigned_employee_id', profileId);
      const { data } = await query;
      setClients((data ?? []) as PickableClient[]);
    })();
  }, [isAdmin, isViewingAs, profileId]);

  const chosen = clients?.find((c) => c.id === clientId);

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{formName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Client</label>
          <ClientPicker clients={clients ?? []} value={clientId} onChange={setClientId} className="w-full" />
          {clients !== null && clients.length === 0 && (
            <p className="text-xs text-muted-foreground">No clients are assigned to you yet.</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={!chosen}
            onClick={() =>
              chosen && onChoose({ id: chosen.id, name: `${chosen.last_name ?? ''}, ${chosen.first_name ?? ''}` })
            }
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
