// Sending touchpoint reminders to a case manager, from Team touchpoints.
//
// Opened three ways: for one overdue client, for all of a case manager's
// overdue clients, or blank, to pick any case manager and any of their
// clients. Each reminder pops up for the case manager the next time they open
// Clients.
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { sendReminders } from '@/lib/touchpointReminders';

export interface ReminderTarget {
  employeeId: string | null;
  clientIds: string[];
}

interface Props {
  target: ReminderTarget | null;
  managers: { id: string; name: string }[];
  senderId: string | null;
  onClose: () => void;
  onSent: () => void;
}

export const SendReminderDialog: React.FC<Props> = ({ target, managers, senderId, onClose, onSent }) => {
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!target) return;
    setEmployeeId(target.employeeId);
    setChosen(new Set(target.clientIds));
    setNote('');
  }, [target]);

  useEffect(() => {
    if (!employeeId) {
      setClients([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void supabase
      .from('clients')
      .select('id, first_name, last_name, status')
      .eq('assigned_employee_id', employeeId)
      .neq('status', 'closed')
      .order('last_name')
      .then(({ data }) => {
        if (cancelled) return;
        setClients((data ?? []).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}`.trim() })));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    if (!employeeId || chosen.size === 0) return;
    setSending(true);
    try {
      await sendReminders(
        [...chosen].map((clientId) => ({ clientId, employeeId })),
        senderId,
        note,
      );
      const manager = managers.find((m) => m.id === employeeId)?.name ?? 'The case manager';
      toast({
        title: chosen.size === 1 ? 'Reminder sent' : `${chosen.size} reminders sent`,
        description: `${manager} will see ${chosen.size === 1 ? 'it' : 'them'} the next time they open Clients.`,
      });
      onSent();
      onClose();
    } catch (e) {
      toast({
        title: 'Could not send the reminder',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send a touchpoint reminder</DialogTitle>
          <DialogDescription>
            The case manager sees the reminder the next time they open Clients, and it closes on its
            own once they log the touchpoint.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Case manager</Label>
            <Select
              value={employeeId ?? undefined}
              onValueChange={(v) => {
                setEmployeeId(v);
                setChosen(new Set());
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a case manager" />
              </SelectTrigger>
              <SelectContent>
                {managers.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {employeeId && (
            <div className="space-y-1.5">
              <Label>Clients</Label>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
                {loading ? (
                  <p className="p-1 text-sm text-muted-foreground">Loading…</p>
                ) : clients.length === 0 ? (
                  <p className="p-1 text-sm text-muted-foreground">No open cases for this case manager.</p>
                ) : (
                  clients.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                    >
                      <Checkbox checked={chosen.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                      {c.name}
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reminder-note">Note (optional)</Label>
            <Textarea
              id="reminder-note"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="For example: Please complete the in-person visit this week."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void send()} disabled={sending || !employeeId || chosen.size === 0}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {chosen.size > 1 ? `Send ${chosen.size} reminders` : 'Send reminder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
