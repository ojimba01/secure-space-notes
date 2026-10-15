// Take back a restart, after saying what that does. See undoRestart.
import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { undoRestart } from '@/lib/restartAuthorization';
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

interface Props {
  clientId: string;
  clientName: string;
  onUndone: () => void;
  size?: ButtonProps['size'];
  className?: string;
}

export const UndoRestartButton: React.FC<Props> = ({ clientId, clientName, onUndone, size = 'sm', className }) => {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  const undo = async () => {
    setWorking(true);
    try {
      await undoRestart(clientId);
      toast({ title: 'Restart undone', description: `${clientName} is back to the earlier authorization.` });
      setConfirming(false);
      onUndone();
    } catch (err) {
      toast({ title: 'Could not undo the restart', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setConfirming(true)}>
        <Undo2 className="mr-2 h-4 w-4" />
        Undo restart
      </Button>
      <AlertDialog open={confirming} onOpenChange={(o) => !working && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo this restart?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{clientName} goes back to the authorizations and dates from before the restart.</li>
                <li>The restarted authorization and its billing cycles are removed.</li>
                <li>Documents filed since the restart are kept.</li>
                <li>A case that was closed before the restart is closed again.</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Keep restart</AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={(e) => {
                e.preventDefault();
                undo();
              }}
            >
              {working ? 'Undoing…' : 'Undo restart'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
