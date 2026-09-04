import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  formatFaxNumber,
  isSendableFaxNumber,
  loadMcoFaxNumbers,
  sendFax,
} from '@/lib/fax';

interface Props {
  formId: string;
  formTitle: string;
  clientId: string;
  clientName: string;
  onClose: () => void;
  /** Called once the fax service has taken it, so the list can catch up. */
  onSent: () => void;
}

/**
 * Fax one completed form to the MCO.
 *
 * The number is shown as it will be dialled and has to be confirmed rather
 * than assumed, because this is the one action in the app that sends a
 * member's record outside it. Getting it wrong faxes their name, Medicaid ID
 * and housing history to a stranger, and there is no recalling a fax.
 */
export const FaxFormDialog: React.FC<Props> = ({
  formId,
  formTitle,
  clientId,
  clientName,
  onClose,
  onSent,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useIsAdmin();
  const [mco, setMco] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [known, setKnown] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: client }, numbers] = await Promise.all([
          supabase.from('clients').select('insurance').eq('id', clientId).maybeSingle(),
          loadMcoFaxNumbers().catch(() => ({} as Record<string, string>)),
        ]);
        if (cancelled) return;
        const theirs = (client?.insurance ?? '').trim();
        setMco(theirs || null);
        // Matched loosely, because "Wellpoint" and "Wellpoint NJ" are one MCO
        // as far as a fax number is concerned.
        const hit = theirs
          ? Object.entries(numbers).find(
              ([name]) =>
                name.toLowerCase() === theirs.toLowerCase() ||
                theirs.toLowerCase().includes(name.toLowerCase()),
            )
          : undefined;
        setKnown(hit?.[1] ?? null);
        setNumber(hit ? formatFaxNumber(hit[1]) : '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const valid = isSendableFaxNumber(number);
  const changed = !known || number.replace(/\D+/g, '') !== known.replace(/\D+/g, '');

  const send = async () => {
    if (!valid) return;
    setSending(true);
    try {
      const { warning } = await sendFax({
        formId,
        toNumber: number,
        toName: mco ?? 'Managed Care Organization',
        note: note.trim() || undefined,
        saveNumberForMco: isAdmin && remember && mco ? mco : undefined,
      });
      toast({
        title: 'Sent to the fax service',
        description:
          warning ?? 'The form is marked as faxed once the other machine answers.',
      });
      onSent();
      onClose();
    } catch (err: unknown) {
      toast({
        title: 'Could not send it',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fax this form</DialogTitle>
          <DialogDescription>
            {formTitle} for {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fax-number">Fax number</Label>
            <Input
              id="fax-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder={loading ? 'Loading' : '(201) 555-0134'}
              inputMode="tel"
              autoComplete="off"
            />
            {mco ? (
              <p className="text-xs text-muted-foreground">
                {known
                  ? `The number on file for ${mco}. Check it against their letterhead before sending.`
                  : `No number on file for ${mco}. Type the one on their letterhead.`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This client has no MCO recorded, so there is no number on file.
              </p>
            )}
            {number && !valid && (
              <p className="text-xs text-destructive">
                A fax number is ten digits. This one is {number.replace(/\D+/g, '').length}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fax-note">Cover note</Label>
            <Textarea
              id="fax-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={`${formTitle} attached.`}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Printed on the cover sheet, ahead of the form.
            </p>
          </div>

          {isAdmin && mco && changed && valid && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-1"
              />
              <span>
                Keep this number for {mco}, so it is offered next time.
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={!valid || sending || loading}>
              {sending ? 'Sending' : `Fax to ${formatFaxNumber(number) || 'the MCO'}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
