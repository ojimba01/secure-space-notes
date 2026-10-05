// One manual-entry client: their backlog cycles and their generated notes, in a popup.
//
// Keeps the Generate Notes page to one note at a time. The 150-day start date
// and the extension are set here; each cycle shows whether it has a saved or
// an assigned note, and Add note starts the note for that cycle back on the
// page. A name without a backlog just lists its notes.
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Check, ClipboardCopy, Plus, Trash2, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ClientPicker, type PickableClient } from '@/components/ClientPicker';
import { cn } from '@/lib/utils';
import { categoryById } from '@/lib/clinicalNotes/tree';
import { backlogCycles, cycleDates, day, type BacklogCycle } from '@/lib/clinicalNotes/backlog';
import { loadBacklogNotes, type DraftNote } from '@/lib/clinicalNotes/save';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  /** The typed name; null for notes saved without one. */
  label: string | null;
  /** This name's generated notes (saved, not yet assigned). */
  drafts: DraftNote[];
  /** Backlog settings to start from. */
  start: string;
  extension: boolean;
  /** The cycle being written on the page right now, if it is this name's. */
  activeCycle: number | null;
  caseload: PickableClient[];
  onAddCycleNote: (cycle: BacklogCycle, start: string, extension: boolean) => void;
  onAddNote: () => void;
  onEdit: (d: DraftNote) => void;
  onCopy: (d: DraftNote) => void;
  onDelete: (d: DraftNote) => void;
  onAssign: (d: DraftNote, clientId: string) => void;
}

export const ManualClientDialog: React.FC<Props> = (props) => {
  const { open, onOpenChange, userId, label, drafts, activeCycle, caseload } = props;
  const [start, setStart] = useState(props.start);
  const [ext, setExt] = useState(props.extension);
  const [done, setDone] = useState<Record<number, { id: string; status: 'draft' | 'saved' }>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<string | null>(null);

  // Start from the given settings each time it opens.
  useEffect(() => {
    if (!open) return;
    setStart(props.start);
    setExt(props.extension);
    setAssigning(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const draftKey = drafts.map((d) => `${d.id}:${d.updated_at}`).join(',');
  useEffect(() => {
    if (!open || !userId || !label || !start) {
      setDone({});
      return;
    }
    void loadBacklogNotes(userId, label, start).then(setDone).catch(() => setDone({}));
  }, [open, userId, label, start, draftKey]);

  const cycles = label ? backlogCycles(start, ext) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{label ?? 'Notes without a name'}</DialogTitle>
          <DialogDescription className="sr-only">Backlog cycles and generated notes for this name.</DialogDescription>
        </DialogHeader>

        {label && (
          <section className="space-y-3">
            <h3 className="font-semibold">Backlog</h3>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <p className="text-base font-semibold text-foreground">150-day start date</p>
                <Input aria-label="150-day start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-12 w-52 text-lg" />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <Checkbox checked={ext} onCheckedChange={(c) => setExt(c === true)} />
                Include 180-day extension
              </label>
            </div>
            {cycles.length > 0 && (
              <ul className="divide-y rounded-md border">
                {cycles.map((c) => {
                  const d = done[c.n];
                  const draft = d?.status === 'draft' ? drafts.find((x) => x.id === d.id) : undefined;
                  const writing = activeCycle === c.n;
                  return (
                    <li key={c.n} className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-sm', writing && 'bg-primary/5')}>
                      <span className="w-16 font-semibold">Cycle {c.n}</span>
                      <span className="text-muted-foreground">{cycleDates(c)}</span>
                      <span className="ml-auto flex items-center gap-2">
                        {writing ? (
                          <span className="text-xs font-semibold text-primary">Writing</span>
                        ) : d?.status === 'saved' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                            Assigned
                          </span>
                        ) : d ? (
                          <>
                            <span className="text-xs text-muted-foreground">Saved</span>
                            {draft && (
                              <Button size="sm" variant="outline" className="h-7" onClick={() => props.onEdit(draft)}>
                                Edit
                              </Button>
                            )}
                          </>
                        ) : (
                          <Button size="sm" className="h-7" onClick={() => props.onAddCycleNote(c, start, ext)}>
                            Add note
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">Generated notes ({drafts.length})</h3>
            {label && (
              <Button size="sm" variant="outline" className="h-8" onClick={props.onAddNote}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add a note
              </Button>
            )}
          </div>
          {drafts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No generated notes yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {drafts.map((d) => (
                <li key={d.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{categoryById(d.primary_topic ?? '')?.label ?? 'Note'}</span>
                    {d.backlog_cycle && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Cycle {d.backlog_cycle}</span>}
                    {d.contact_date && <span>Contact {day(d.contact_date)}</span>}
                    <span>Saved {format(new Date(d.updated_at), "MMM d 'at' h:mm a")}</span>
                  </div>
                  <p className="line-clamp-3 text-sm">{d.final_narrative}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setAssigning(d.id);
                        // A typed name that matches a client in the caseload is picked for you.
                        const name = (d.client_label ?? '').trim().toLowerCase();
                        const match = name ? caseload.find((c) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim().toLowerCase() === name) : undefined;
                        setAssignTo(match?.id ?? null);
                      }}
                    >
                      <UserRound className="mr-1.5 h-3.5 w-3.5" />
                      Assign to client
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => props.onCopy(d)}>
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => props.onEdit(d)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-50" aria-label="Delete note" onClick={() => props.onDelete(d)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {assigning === d.id && (
                    <div className="max-w-md space-y-2 rounded-lg border bg-muted/30 p-3">
                      <ClientPicker clients={caseload} value={assignTo} onChange={setAssignTo} className="h-9 w-full" />
                      <div className="flex gap-2">
                        <Button size="sm" disabled={!assignTo} onClick={() => assignTo && props.onAssign(d, assignTo)}>
                          Continue
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAssigning(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
};
