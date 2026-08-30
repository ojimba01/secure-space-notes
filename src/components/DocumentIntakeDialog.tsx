import React, { useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { FileUp, Loader2 } from 'lucide-react';
import {
  applyIntake,
  proposeFromReadings,
  readDroppedDocuments,
  type DocumentReading,
  type ProposedValue,
} from '@/lib/documentIntake';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  /** What the record holds now, so a proposal can be shown against it. */
  current: Record<string, unknown>;
  onApplied: () => void;
}

/**
 * Drop a client's documents in, see what they say, correct it, save.
 *
 * Three steps and no decisions hidden between them: choose the files, look at
 * what was read, apply what is right. A value the record already holds is
 * shown beside the proposal and left unticked, because a document is evidence
 * and a person who typed something is not overruled by a regex.
 */
export const DocumentIntakeDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  clientId,
  clientName,
  current,
  onApplied,
}) => {
  const { toast } = useToast();
  const profileId = useEffectiveProfileId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'choose' | 'review'>('choose');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');
  const [readings, setReadings] = useState<DocumentReading[]>([]);
  const [proposals, setProposals] = useState<ProposedValue[]>([]);
  const [conflicts, setConflicts] = useState<{ label: string; values: string[] }[]>([]);
  const [chosen, setChosen] = useState<Record<string, { include: boolean; value: string }>>({});
  const [dragging, setDragging] = useState(false);
  /** The scan currently being read with optical recognition, if any. */
  const [ocrFor, setOcrFor] = useState<string | null>(null);

  /**
   * Read one scan the slow way.
   *
   * A page measured at over 100 seconds, so this is never done to a batch. It
   * is one document, chosen by somebody who has decided it is worth the wait.
   */
  const readWithOcr = async (target: DocumentReading) => {
    setOcrFor(target.file.name);
    try {
      const [reread] = await readDroppedDocuments(
        [target.file],
        undefined,
        current as { first_name?: string | null; last_name?: string | null },
        { ocr: true },
      );
      if (!reread) return;
      const next = readings.map((r) => (r.file.name === target.file.name ? reread : r));
      const { proposals: found, conflicts: clashes } = proposeFromReadings(next, current);
      setReadings(next);
      setProposals(found);
      setConflicts(clashes);
      setChosen((c) =>
        Object.fromEntries(
          found.map((p) => [p.column, c[p.column] ?? { include: p.current === null, value: p.value }]),
        ),
      );
      toast({
        title: reread.hasText ? 'Read' : 'Nothing readable in that scan',
        description: reread.hasText ? 'Check anything it filled in below.' : undefined,
      });
    } catch (err: any) {
      toast({ title: 'Could not read it', description: err.message, variant: 'destructive' });
    } finally {
      setOcrFor(null);
    }
  };

  const reset = () => {
    setStep('choose');
    setReadings([]);
    setProposals([]);
    setConflicts([]);
    setChosen({});
    setBusy(false);
    setBusyLabel('');
  };

  const take = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setBusyLabel(`Reading 0 of ${files.length}`);
    try {
      const result = await readDroppedDocuments(
        files,
        (done, total) => setBusyLabel(`Reading ${done} of ${total}`),
        current as { first_name?: string | null; last_name?: string | null },
      );
      // Added to what is already staged, so documents can go in one at a time.
      const all = [...readings, ...result];
      const { proposals: found, conflicts: clashes } = proposeFromReadings(all, current);
      setReadings(all);
      setProposals(found);
      setConflicts(clashes);
      setChosen(
        Object.fromEntries(
          // A blank on the record is ticked. A value already there is not:
          // overwriting what a person entered is their decision, not the default.
          found.map((p) => [p.column, { include: p.current === null, value: p.value }]),
        ),
      );
      setStep('review');
    } catch (err: any) {
      toast({ title: 'Could not read those', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  const apply = async () => {
    if (!profileId) return;
    setBusy(true);
    setBusyLabel('Saving');
    try {
      const accepted: Record<string, string> = {};
      for (const p of proposals) {
        const row = chosen[p.column];
        if (row?.include && row.value.trim()) accepted[p.column] = row.value.trim();
      }
      const result = await applyIntake(clientId, profileId, readings, accepted);
      toast({
        title: `${result.filed} document${result.filed === 1 ? '' : 's'} filed`,
        description: Object.keys(accepted).length
          ? `${Object.keys(accepted).length} detail${Object.keys(accepted).length === 1 ? '' : 's'} updated on the client record.`
          : 'No client details were changed.',
      });
      if (result.failed.length) {
        toast({
          title: `${result.failed.length} could not be filed`,
          description: result.failed[0].error,
          variant: 'destructive',
        });
      }
      onApplied();
      onOpenChange(false);
      reset();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setBusy(false);
      setBusyLabel('');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 'choose' ? `Upload forms for ${clientName}` : 'What the documents say'}
          </DialogTitle>
          <DialogDescription>
            {step === 'choose'
              ? 'The documents are read here, in your browser, and filed on this client. Nothing is sent anywhere to be read.'
              : 'Tick what should go onto the client record. Every document is filed either way.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'choose' ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              take([...e.dataTransfer.files]);
            }}
            className={`flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-10 text-center ${
              dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30'
            }`}
          >
            {busy ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <p className="text-sm">{busyLabel}</p>
              </>
            ) : (
              <>
                <FileUp className="h-6 w-6 text-muted-foreground" />
                <p className="text-sm">Drag this client's documents here.</p>
                <Button variant="outline" onClick={() => fileInput.current?.click()}>
                  Choose files
                </Button>
                <p className="text-xs text-muted-foreground">
                  PDFs are read for a member ID, Medicaid ID, date of birth and diagnosis.
                  Anything else is filed without being read.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-h-[55vh] overflow-y-auto">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {readings.length} document{readings.length === 1 ? '' : 's'} ready to file
                </span>
                <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                  Add another
                </Button>
              </div>
              <div className="space-y-1">
                {readings.map((r) => (
                  <div key={r.file.name} className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">
                      {r.suggestedName}
                      {!r.hasText && !r.error && ' · scan, no readable text'}
                    </p>
                    {!r.hasText && !r.error && !r.ocrApplied && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 text-[11px]"
                        disabled={!!ocrFor}
                        onClick={() => readWithOcr(r)}
                      >
                        {ocrFor === r.file.name ? 'Reading, this takes a while' : 'Read with OCR'}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing could be read off these documents that belongs on the client record.
              </p>
            ) : (
              <div className="space-y-3">
                {proposals.map((p) => (
                  <div key={p.column} className="flex items-start gap-3 rounded-md border p-3">
                    <Checkbox
                      id={`take-${p.column}`}
                      checked={chosen[p.column]?.include ?? false}
                      onCheckedChange={(v) =>
                        setChosen((c) => ({
                          ...c,
                          [p.column]: { ...c[p.column], include: v === true },
                        }))
                      }
                      className="mt-2"
                    />
                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`take-${p.column}`} className="cursor-pointer">
                        {p.label}
                      </Label>
                      <Input
                        value={chosen[p.column]?.value ?? p.value}
                        onChange={(e) =>
                          setChosen((c) => ({
                            ...c,
                            [p.column]: { ...c[p.column], value: e.target.value },
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Read from {p.from}.
                        {p.current !== null && (
                          <span className="text-amber-700">
                            {' '}The record already says {p.current}. Ticking this replaces it.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                {conflicts.map((c) => (
                  <p key={c.label}>
                    The documents disagree about {c.label.toLowerCase()}: {c.values.join(', ')}.
                    Nothing is proposed for it.
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Outside both steps, so Add another works on the review as well. */}
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            take(files);
          }}
        />

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={reset} disabled={busy}>
                Start again
              </Button>
              <Button onClick={apply} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {busyLabel}
                  </>
                ) : (
                  'Done'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
