import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { PenLine } from 'lucide-react';
import { SignatureManager } from '@/components/SignatureManager';
import {
  loadSignatures,
  signatureBytes,
  signatureUrl,
  type SavedSignature,
} from '@/lib/signatures';

interface Props {
  /** Called with the chosen mark's PNG bytes, to be drawn onto the form. */
  onSign: (png: ArrayBuffer, label: string) => void;
  /** How many marks are already on the form, so the button can say so. */
  count?: number;
}

/**
 * Sign the form you are filling in.
 *
 * Every press adds a mark; none of them replaces the one before it, because a
 * form can want a signature on one line and initials on another. Where more
 * than one mark is saved, the press asks which — a drawn signature, a typed
 * one and a photograph of the one signed on paper are all in the same list.
 */
export const SignOnForm: React.FC<Props> = ({ onSign, count = 0 }) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const [saved, setSaved] = useState<SavedSignature[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [making, setMaking] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!profileId) return;
    try {
      const list = await loadSignatures(profileId);
      setSaved(list);
      const pairs = await Promise.all(
        list.map(async (s) => [s.id, (await signatureUrl(s.imagePath)) ?? ''] as const),
      );
      setPreviews(Object.fromEntries(pairs));
    } catch {
      setSaved([]);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const apply = async (sig: SavedSignature) => {
    setBusy(true);
    try {
      const bytes = await signatureBytes(sig.imagePath);
      if (!bytes) throw new Error('The signature image could not be read.');
      onSign(bytes, sig.label);
      setPicking(false);
    } catch (err: any) {
      toast({ title: 'Could not add it', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const addSignature = async () => {
    const list = saved ?? [];
    // Nothing saved: the first thing to do is make one, so do that instead of
    // showing an empty list and asking again.
    if (list.length === 0) {
      setMaking(true);
      return;
    }
    // One saved mark is not a choice worth asking about. More than one is,
    // every time: the second mark on a form is rarely the same as the first.
    if (list.length === 1) {
      await apply(list[0]);
      return;
    }
    setPicking(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" onClick={addSignature} disabled={busy}>
        <PenLine className="h-4 w-4 mr-2" />
        {count > 0 ? 'Add another signature' : 'Add signature'}
      </Button>
      {(saved?.length ?? 0) > 0 && (
        <Button type="button" variant="outline" onClick={() => setMaking(true)} disabled={busy}>
          Make a new one
        </Button>
      )}
      {count > 0 && (
        <span className="text-xs text-muted-foreground">
          {count === 1 ? '1 signature on the form.' : `${count} signatures on the form.`}
        </span>
      )}

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md">
          <DialogTitle>Choose a signature</DialogTitle>
          <div className="divide-y rounded-md border">
            {(saved ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => apply(s)}
                className="flex w-full items-center gap-3 p-2.5 text-left hover:bg-muted/50"
              >
                {previews[s.id] && (
                  <img
                    src={previews[s.id]}
                    alt={s.label}
                    className="h-10 w-28 rounded border bg-white object-contain"
                  />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.kind === 'initial' ? 'Initial' : 'Signature'}
                    {s.isDefault && ' · default'}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPicking(false);
              setMaking(true);
            }}
          >
            Make a new one
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog
        open={making}
        onOpenChange={(o) => {
          setMaking(o);
          if (!o) load();
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogTitle className="sr-only">Your signature</DialogTitle>
          {/* Saving one here is the answer to "sign this form", so it closes
              and signs rather than leaving the form unsigned behind it. */}
          <SignatureManager
            onSaved={(sig) => {
              setMaking(false);
              load();
              apply(sig);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
