import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ClientDetails } from '@/components/ClientDetails';

interface Props {
  clientId: string | null;
  onClose: () => void;
  /** Called after anything on the record changes, so a queue can recount. */
  onChanged?: () => void;
}

/**
 * A whole client record, without leaving the page you were working from.
 *
 * The admin queues are worked through one client after another. Opening each
 * on the clients page and finding the way back is most of the work, and the
 * reason a queue of sixty goes untouched.
 */
export const ClientRecordDialog: React.FC<Props> = ({ clientId, onClose, onChanged }) => {
  const [client, setClient] = useState<Record<string, unknown> | null>(null);

  const load = async (id: string) => {
    const { data } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    setClient((data as Record<string, unknown>) ?? null);
  };

  useEffect(() => {
    if (!clientId) {
      setClient(null);
      return;
    }
    let cancelled = false;
    (async () => {
      if (!cancelled) await load(clientId);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <Dialog open={!!clientId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0">
        {/* The record carries its own heading; this one is for screen readers. */}
        <DialogTitle className="sr-only">Client record</DialogTitle>
        {client && (
          <div className="p-4">
            <ClientDetails
              client={client as never}
              onBack={onClose}
              onUpdate={() => {
                if (clientId) load(clientId);
                onChanged?.();
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
