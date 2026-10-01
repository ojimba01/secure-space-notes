// Generate Notes: build a note without first opening a client.
//
// "Existing client" picks the client and opens the touchpoint with the note
// builder, so the note is saved as that client's touchpoint. "Manual entry"
// builds a note tied to no client record: copy it, or save it as a draft and
// assign it to a client later, when it becomes that client's touchpoint note.
// A typed name labels drafts (a backlog for someone not in the app, several
// notes for one person); it is never written into the note itself.
//
// Backlog (under Manual entry) lists one 30-day cycle per row from the 150-day
// start date, plus the 180-day extension when ticked. Nothing is created ahead
// of time: a note exists only once someone adds one for a cycle, dated the
// cycle's first day.
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Check, ClipboardCopy, Hand, History, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { PageShell } from '@/components/PageShell';
import { ClientPicker } from '@/components/ClientPicker';
import { AddTouchpointDialog, type TouchpointContext } from '@/components/AddTouchpointDialog';
import { Chip, NoteComposer, type ComposedNote } from '@/components/clinicalNotes/NoteComposer';
import { useAuth } from '@/components/AuthProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CONTACT_METHOD_OPTIONS } from '@/lib/compliance';
import { isCaseClosed, isSetupComplete } from '@/lib/workflow';
import { topicById } from '@/lib/clinicalNotes/config';
import { deleteDraft, loadBacklogNotes, loadMyDrafts, saveDraft, type DraftNote } from '@/lib/clinicalNotes/save';
import { backlogCycles } from '@/lib/clinicalNotes/backlog';
import { cn } from '@/lib/utils';

interface Pickable {
  id: string;
  first_name: string | null;
  last_name: string | null;
  member_id: string | null;
  level_of_need: string | null;
}

/** The clients this person can record a touchpoint for: their own, or everyone's for an admin. */
function useCaseload() {
  const { isAdmin, loading } = useIsAdmin();
  const profileId = useEffectiveProfileId();
  const [clients, setClients] = useState<Pickable[]>([]);
  useEffect(() => {
    if (loading || !profileId) return;
    let q = supabase
      .from('clients')
      .select('id, first_name, last_name, member_id, level_of_need, hsp_submitted, auth_150_number, auth_180_number, auth_30_start, auth_150_start, hsp_150_date, assigned_employee_id, status, workflow_stage')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('first_name');
    if (!isAdmin) q = q.eq('assigned_employee_id', profileId);
    void q.then(({ data }) =>
      // Only clients whose setup is done and whose case is open take touchpoints.
      setClients((data ?? []).filter((c) => isSetupComplete(c) && !isCaseClosed(c)) as unknown as Pickable[]),
    );
  }, [isAdmin, loading, profileId]);
  return clients;
}

async function copy(text: string, toast: ReturnType<typeof useToast>['toast']) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: 'Note copied' });
  } catch {
    toast({ title: 'Could not copy', description: 'Select the note text and copy it manually.', variant: 'destructive' });
  }
}

export default function ClinicalNotes() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const caseload = useCaseload();
  const [mode, setMode] = useState<'client' | 'draft' | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  /** Manual entry: who the note is for, typed. Organizes drafts; not in the note. */
  const [clientLabel, setClientLabel] = useState('');
  /** Manual entry: the day the contact happened. Becomes the touchpoint date when assigned. */
  const [contactDate, setContactDate] = useState('');
  const [composerKey, setComposerKey] = useState(0);
  const [editingDraft, setEditingDraft] = useState<DraftNote | null>(null);
  const [drafts, setDrafts] = useState<DraftNote[]>([]);
  const [touchpoint, setTouchpoint] = useState<{ context: TouchpointContext; draft?: DraftNote } | null>(null);
  const [assigning, setAssigning] = useState<DraftNote | null>(null);
  // Backlog: the 150-day start, the extension, the cycle being written, and which cycles have notes.
  const [backlogOn, setBacklogOn] = useState(false);
  const [backlogStart, setBacklogStart] = useState('');
  const [backlogExt, setBacklogExt] = useState(false);
  const [backlogCycle, setBacklogCycle] = useState<number | null>(null);
  const [backlogDone, setBacklogDone] = useState<Record<number, { id: string; status: 'draft' | 'saved' }>>({});
  const cycles = backlogOn ? backlogCycles(backlogStart, backlogExt) : [];
  const [assignTo, setAssignTo] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (user) void loadMyDrafts(user.id).then(setDrafts).catch(() => setDrafts([]));
  }, [user]);
  useEffect(refresh, [refresh]);

  const loadBacklog = useCallback(() => {
    const name = clientLabel.trim();
    if (!user || !backlogOn || !backlogStart || !name) {
      setBacklogDone({});
      return;
    }
    void loadBacklogNotes(user.id, name, backlogStart).then(setBacklogDone).catch(() => setBacklogDone({}));
  }, [user, backlogOn, backlogStart, clientLabel]);
  useEffect(() => {
    const t = setTimeout(loadBacklog, 300);
    return () => clearTimeout(t);
  }, [loadBacklog]);

  const startCycle = (n: number) => {
    const c = cycles.find((x) => x.n === n);
    if (!c) return;
    setBacklogCycle(n);
    setContactDate(c.start);
    setEditingDraft(null);
    setComposerKey((k) => k + 1);
    document.getElementById('note-composer')?.scrollIntoView({ behavior: 'smooth' });
  };

  const editDraft = (d: DraftNote) => {
    setMode('draft');
    setMethod(d.contact_method);
    setClientLabel(d.client_label ?? '');
    setContactDate(d.contact_date ?? '');
    setBacklogOn(!!d.backlog_start);
    setBacklogStart(d.backlog_start ?? '');
    setBacklogExt(d.backlog_extension);
    setBacklogCycle(d.backlog_cycle);
    setEditingDraft(d);
    setComposerKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Drafts for the same name together, newest first within each; unnamed last.
  const grouped = [...drafts].sort(
    (a, b) => (a.client_label ?? '\uffff').localeCompare(b.client_label ?? '\uffff') || b.updated_at.localeCompare(a.updated_at),
  );

  /** Start another manual note for the same name (a backlog, say). */
  const startNoteFor = (label: string) => {
    setMode('draft');
    setClientLabel(label);
    setContactDate('');
    // A name with backlog notes opens its cycle list again.
    const prior = drafts.find((x) => x.client_label === label && x.backlog_start);
    setBacklogOn(!!prior);
    setBacklogStart(prior?.backlog_start ?? '');
    setBacklogExt(prior?.backlog_extension ?? false);
    setBacklogCycle(null);
    setEditingDraft(null);
    setComposerKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const contextFor = (id: string): TouchpointContext | null => {
    const c = caseload.find((x) => x.id === id);
    if (!c) return null;
    return { clientId: c.id, clientName: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(), levelOfNeed: c.level_of_need, locked: true };
  };

  const startClientNote = (id: string) => {
    setClientId(id);
    const ctx = contextFor(id);
    if (ctx) setTouchpoint({ context: ctx });
  };

  const saveAsDraft = async (c: ComposedNote) => {
    try {
      const backlog = backlogOn && backlogStart && backlogCycle ? { start: backlogStart, cycle: backlogCycle, extension: backlogExt } : null;
      await saveDraft(c, { contactMethod: method, id: editingDraft?.id, clientLabel, contactDate, backlog });
      // The name stays filled in, so several notes for one person go quickly.
      toast({ title: editingDraft ? 'Draft updated' : 'Draft saved', description: clientLabel.trim() ? `Saved under ${clientLabel.trim()}. Start the next note below.` : 'Assign it to a client from My drafts when you are ready.' });
      setEditingDraft(null);
      setContactDate('');
      setBacklogCycle(null);
      setComposerKey((k) => k + 1);
      refresh();
      loadBacklog();
    } catch (e) {
      toast({ title: 'Could not save the draft', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  return (
    <PageShell>
      <div className="mx-auto max-w-[1300px] space-y-5 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-bold">Generate Notes</h1>
          <p className="text-sm text-muted-foreground">Select what happened and get a progress note written from your selections.</p>
        </div>

        <Card className="space-y-3 p-4">
          <h2 className="font-semibold">Create note for</h2>
          <div className="flex flex-wrap gap-2">
            <Chip selected={mode === 'client'} onClick={() => setMode('client')}>
              <UserRound className="mr-1.5 inline h-4 w-4" />
              Existing client
            </Chip>
            <Chip selected={mode === 'draft'} onClick={() => setMode('draft')}>
              <Hand className="mr-1.5 inline h-4 w-4" />
              Manual entry
            </Chip>
          </div>

          {mode === 'client' && (
            <div className="max-w-md space-y-1.5">
              <p className="text-xs text-muted-foreground">Choose the client. The note is saved as their touchpoint.</p>
              <ClientPicker clients={caseload} value={clientId} onChange={startClientNote} className="h-10 w-full" />
            </div>
          )}

          {mode === 'draft' && (
            <div className="flex flex-wrap gap-3">
              <div className="w-full max-w-md space-y-1.5">
                <p className="text-xs text-muted-foreground">Client name (optional)</p>
                <Input aria-label="Client name" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} maxLength={80} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Contact date</p>
                <Input aria-label="Contact date" type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} className="h-9 w-44" />
              </div>
            </div>
          )}

          {mode === 'draft' && (
            <div className="space-y-3">
              <Chip
                size="sm"
                selected={backlogOn}
                onClick={() => {
                  setBacklogOn((on) => !on);
                  setBacklogCycle(null);
                }}
              >
                <History className="mr-1.5 inline h-3.5 w-3.5" />
                Backlog
              </Chip>
              {backlogOn && (
                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">150-day start date</p>
                      <Input aria-label="150-day start date" type="date" value={backlogStart} onChange={(e) => { setBacklogStart(e.target.value); setBacklogCycle(null); }} className="h-9 w-44" />
                    </div>
                    <label className="flex h-9 items-center gap-2 text-sm">
                      <Checkbox checked={backlogExt} onCheckedChange={(c) => setBacklogExt(c === true)} />
                      Include 180-day extension
                    </label>
                  </div>
                  {cycles.length > 0 && !clientLabel.trim() && <p className="text-xs text-amber-800">Enter the client name to save backlog notes.</p>}
                  {cycles.length > 0 && (
                    <ul className="divide-y rounded-md border bg-white">
                      {cycles.map((c) => {
                        const done = backlogDone[c.n];
                        const draft = done?.status === 'draft' ? drafts.find((d) => d.id === done.id) : undefined;
                        const writing = backlogCycle === c.n;
                        return (
                          <li key={c.n} className={cn('flex flex-wrap items-center gap-3 px-3 py-2 text-sm', writing && 'bg-primary/5')}>
                            <span className="w-16 font-semibold">Cycle {c.n}</span>
                            <span className="text-muted-foreground">
                              {format(new Date(`${c.start}T12:00:00`), 'MMM d')} – {format(new Date(`${c.end}T12:00:00`), 'MMM d, yyyy')}
                            </span>
                            <span className="ml-auto flex items-center gap-2">
                              {writing ? (
                                <span className="text-xs font-semibold text-primary">Writing</span>
                              ) : done?.status === 'saved' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <Check className="h-3.5 w-3.5" />
                                  Assigned
                                </span>
                              ) : done ? (
                                <>
                                  <span className="text-xs text-muted-foreground">Draft saved</span>
                                  {draft && (
                                    <Button size="sm" variant="outline" className="h-7" onClick={() => editDraft(draft)}>
                                      Edit
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <Button size="sm" className="h-7" disabled={!clientLabel.trim()} onClick={() => startCycle(c.n)}>
                                  Add note
                                </Button>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'draft' && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">How did the contact happen? (optional)</p>
              <div className="flex flex-wrap gap-2">
                {CONTACT_METHOD_OPTIONS.map((m) => (
                  <Chip key={m.value} size="sm" selected={method === m.value} onClick={() => setMethod(method === m.value ? null : m.value)}>
                    {m.label}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </Card>

        {mode === 'draft' && (
          <div id="note-composer" className="scroll-mt-4 space-y-2">
            {backlogCycle && !editingDraft && (
              <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                Note for cycle {backlogCycle}, dated {contactDate ? format(new Date(`${contactDate}T12:00:00`), 'MMM d, yyyy') : 'the cycle start'}.
              </p>
            )}
            {editingDraft && (
              <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                Editing a draft from {format(new Date(editingDraft.updated_at), 'MMM d')}.{' '}
                <button className="underline" onClick={() => { setEditingDraft(null); setBacklogCycle(null); setComposerKey((k) => k + 1); }}>
                  Start a new note instead
                </button>
              </p>
            )}
            <NoteComposer
              key={composerKey}
              method={method}
              initial={editingDraft?.composed ?? null}
              useLabel="Copy note"
              onUse={(c) => void copy(c.final, toast)}
              extraActions={(c) => (
                <Button variant="outline" disabled={!c} onClick={() => c && void saveAsDraft(c)}>
                  {editingDraft ? 'Update draft' : 'Save draft'}
                </Button>
              )}
            />
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">My drafts ({drafts.length})</h2>
            <p className="text-sm text-muted-foreground">Notes not yet assigned to a client. Only you can see them.</p>
          </div>
          {drafts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No drafts.</p>
          ) : (
            <ul className="divide-y">
              {grouped.map((d, i) => (
                <React.Fragment key={d.id}>
                {(i === 0 || grouped[i - 1].client_label !== d.client_label) && (
                  <li className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-4 py-2">
                    <span className="text-sm font-semibold">
                      {d.client_label ?? 'No name'}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {grouped.filter((x) => x.client_label === d.client_label).length} note
                        {grouped.filter((x) => x.client_label === d.client_label).length === 1 ? '' : 's'}
                      </span>
                    </span>
                    {d.client_label && (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => startNoteFor(d.client_label ?? '')}>
                        + Add a note
                      </Button>
                    )}
                  </li>
                )}
                <li className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {d.client_label && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">{d.client_label}</span>}
                    <span className="font-semibold text-foreground">{topicById(d.primary_topic ?? '')?.label ?? 'Note'}</span>
                    {d.backlog_cycle && <span className="rounded-full bg-muted px-2 py-0.5 font-medium">Cycle {d.backlog_cycle}</span>}
                    {d.contact_date && <span>Contact {format(new Date(`${d.contact_date}T12:00:00`), 'MMM d, yyyy')}</span>}
                    <span>Saved {format(new Date(d.updated_at), "MMM d 'at' h:mm a")}</span>
                  </div>
                  <p className="line-clamp-3 text-sm">{d.final_narrative}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setAssigning(d);
                        // A typed name that matches a client in the caseload is picked for you.
                        const name = (d.client_label ?? '').trim().toLowerCase();
                        const match = name ? caseload.find((c) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim().toLowerCase() === name) : undefined;
                        setAssignTo(match?.id ?? null);
                      }}
                    >
                      <UserRound className="mr-1.5 h-3.5 w-3.5" />
                      Assign to client
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void copy(d.final_narrative, toast)}>
                      <ClipboardCopy className="mr-1.5 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => editDraft(d)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-700 hover:bg-red-50"
                      aria-label="Delete draft"
                      onClick={() => void deleteDraft(d.id).then(refresh).catch((e) => toast({ title: 'Could not delete', description: e.message, variant: 'destructive' }))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {assigning?.id === d.id && (
                    <div className={cn('max-w-md space-y-2 rounded-lg border bg-muted/30 p-3')}>
                      <p className="text-xs text-muted-foreground">Choose the client. The draft becomes their touchpoint note.</p>
                      <ClientPicker clients={caseload} value={assignTo} onChange={setAssignTo} className="h-9 w-full" />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!assignTo}
                          onClick={() => {
                            const ctx = assignTo ? contextFor(assignTo) : null;
                            // The draft's contact date becomes the touchpoint date.
                            if (ctx) setTouchpoint({ context: { ...ctx, date: d.contact_date ?? undefined }, draft: d });
                            setAssigning(null);
                          }}
                        >
                          Continue
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAssigning(null)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </li>
                </React.Fragment>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AddTouchpointDialog
        open={!!touchpoint}
        onOpenChange={(o) => {
          if (!o) setTouchpoint(null);
        }}
        context={touchpoint?.context ?? null}
        startWithBuilder={!touchpoint?.draft}
        fromDraft={touchpoint?.draft ? { id: touchpoint.draft.id, composed: touchpoint.draft.composed, contactMethod: touchpoint.draft.contact_method } : null}
        onSaved={() => {
          setTouchpoint(null);
          setClientId(null);
          refresh();
        }}
      />
    </PageShell>
  );
}
