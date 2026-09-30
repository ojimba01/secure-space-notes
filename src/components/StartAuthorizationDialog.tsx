// Start a client's next 30-day authorization after the last one lapsed.
import React, { useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { startNewAuthorizationRound } from '@/lib/reopenCase';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  onStarted: () => void;
}

export const StartAuthorizationDialog: React.FC<Props> = ({ open, onOpenChange, clientId, clientName, onStarted }) => {
  const { toast } = useToast();
  const [start, setStart] = useState('');
  const [number, setNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!start) {
      toast({ title: 'Enter a 30-day start date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await startNewAuthorizationRound(clientId, { startDate: start, authorizationNumber: number });
      toast({ title: '2nd authorization started', description: `${clientName} has a new 30-day authorization.` });
      onOpenChange(false);
      onStarted();
    } catch (err) {
      toast({
        title: 'Unable to start authorization',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start 2nd authorization</DialogTitle>
          <DialogDescription>
            {clientName}. Earlier billing cycles stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="round-start">30-day start date</Label>
            <Input id="round-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <p className="text-xs text-muted-foreground">Used for billing cycles and touchpoints.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="round-number">Authorization number</Label>
            <Input id="round-number" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Optional" />
          </div>
          <p className="text-xs text-muted-foreground">Submit a new IAT, LON, and HSP on the Forms tab.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Starting…' : 'Start authorization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
