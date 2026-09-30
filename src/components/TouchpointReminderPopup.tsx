// Touchpoint reminders, shown to a case manager when they open Clients.
//
// One reminder at a time, with arrows to move between them. Each can be
// completed now (the touchpoint form opens for that client), marked as
// already completed, or put off for a few hours.
import React, { useCallback, useEffect, useState } from 'react';
import { BellRing, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useViewAs } from '@/components/ViewAsProvider';
import {
  completeReminder,
  loadMyReminders,
  snoozeReminder,
  SNOOZE_HOURS,
  type Reminder,
} from '@/lib/touchpointReminders';

interface Props {
  employeeId: string | null;
  /** Open the touchpoint form for this reminder's client. */
  onCompleteNow: (reminder: Reminder) => void;
}

export const TouchpointReminderPopup: React.FC<Props> = ({ employeeId, onCompleteNow }) => {
  const { toast } = useToast();
  const { guardWrite } = useViewAs();
  const [items, setItems] = useState<Reminder[]>([]);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    const mine = await loadMyReminders(employeeId);
    setItems(mine);
    setIndex(0);
    setOpen(mine.length > 0);
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items[index];

  /** Take the current reminder out of the list and move on, closing when none are left. */
  const drop = () => {
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
    if (next.length === 0) setOpen(false);
  };

  const act = async (action: 'later' | 'done') => {
    if (!current || guardWrite()) return;
    setBusy(true);
    try {
      if (action === 'later') await snoozeReminder(current.id);
      else await completeReminder(current.id, 'marked_done');
      toast({
        title: action === 'later' ? 'Reminder snoozed' : 'Marked as completed',
        description:
          action === 'later'
            ? `We'll remind you about ${current.clientName} again in ${SNOOZE_HOURS} hours.`
            : `The reminder for ${current.clientName} is closed.`,
      });
      drop();
    } catch (e) {
      toast({
        title: 'Could not update the reminder',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-600" />
            Touchpoint reminder
          </DialogTitle>
          <DialogDescription>
            {items.length === 1
              ? 'You have 1 touchpoint to complete.'
              : `You have ${items.length} touchpoints to complete.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-amber-50/60 p-4">
          <div className="text-lg font-semibold">{current.clientName}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Sent by {current.senderName ?? 'an administrator'} on{' '}
            {format(new Date(current.created_at), "MMM d 'at' h:mm a")}
          </div>
          {current.note && (
            <p className="mt-3 rounded-md border bg-white p-2 text-sm">{current.note}</p>
          )}
        </div>

        {items.length > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous reminder"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {index + 1} of {items.length}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next reminder"
              disabled={index === items.length - 1}
              onClick={() => setIndex((i) => i + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" disabled={busy} onClick={() => void act('later')}>
            Remind me later
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" disabled={busy} onClick={() => void act('done')}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              This has been completed
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                // The reminder closes itself once the touchpoint is saved.
                setOpen(false);
                onCompleteNow(current);
              }}
            >
              Complete now
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
