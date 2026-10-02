// Generate Notes: build a note without first opening a client.
//
// "Existing client" picks the client and opens the touchpoint with the note
// builder, so the note is saved as that client's touchpoint. "Manual entry"
// builds a note tied to no client record: copy it, or save it and assign it to
// a client later, when it becomes that client's touchpoint note. A typed name
// groups these generated notes (a backlog for someone not in the app, several
// notes for one person); it is never written into the note itself.
//
// The page has two tabs: New note, where one note is built at a time, and
// Generated notes, one row per typed name. A name's backlog cycles and notes
// open in a popup (ManualClientDialog), so the page itself never gets long.
// Backlog cycles are 30 days each from the 150-day start date, plus the
// 180-day extension when ticked. Nothing is created ahead of time: a note
// exists only once someone adds one for a cycle, dated the cycle's first day.
// After a cycle's note is saved, a popup offers the next cycle or a different
// client.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ClipboardCopy, Hand, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageShell } from '@/components/PageShell';
import { ClientPicker } from '@/components/ClientPicker';
import { AddTouchpointDialog, type TouchpointContext } from '@/components/AddTouchpointDialog';
import { Chip, NoteComposer, type ComposedNote } from '@/components/clinicalNotes/NoteComposer';
import { ManualClientDialog } from '@/components/clinicalNotes/ManualClientDialog';
import { useAuth } from '@/components/AuthProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CONTACT_METHOD_OPTIONS } from '@/lib/compliance';
import { isCaseClosed, isSetupComplete } from '@/lib/workflow';
import { deleteDraft, loadBacklogNotes, loadMyDrafts, saveDraft, type DraftNote } from '@/lib/clinicalNotes/save';
import { backlogCycles, cycleDates, day, type BacklogCycle } from '@/lib/clinicalNotes/backlog';

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
  const [tab, setTab] = useState<'new' | 'notes'>('new');
  const [mode, setMode] = useState<'client' | 'draft' | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  /** Manual entry: who the note is for, typed. Groups generated notes; not in the note. */
  const [clientLabel, setClientLabel] = useState('');
  /** Manual entry: the day the contact happened. Becomes the touchpoint date when assigned. */
  const [contactDate, setContactDate] = useState('');
  /** Manual entry: a recent visit, or an old one written up for a backlog cycle. */
  const [visit, setVisit] = useState<'recent' | 'old' | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [editingDraft, setEditingDraft] = useState<DraftNote | null>(null);
  const [drafts, setDrafts] = useState<DraftNote[]>([]);
  const [touchpoint, setTouchpoint] = useState<{ context: TouchpointContext; draft?: DraftNote } | null>(null);
  // Backlog for the note on the page: the 150-day start, the extension, and the cycle being written.
  const [backlogStart, setBacklogStart] = useState('');
  const [backlogExt, setBacklogExt] = useState(false);
  const [backlogCycle, setBacklogCycle] = useState<number | null>(null);
  /** The name whose popup is open ('' for notes without a name). */
  const [openLabel, setOpenLabel] = useState<string | null>(null);
  /** After a cycle's note is saved: go on to the next cycle, or a different client. */
  const [afterSave, setAfterSave] = useState<{ label: string; cycle: number; start: string; ext: boolean; next: BacklogCycle | null } | null>(null);

  const refresh = useCallback(() => {
    if (user) void loadMyDrafts(user.id).then(setDrafts).catch(() => setDrafts([]));
  }, [user]);
  useEffect(refresh, [refresh]);

  // One group per typed name, newest first within each; names A–Z, no name last.
  const groups = useMemo(() => {
    const by = new Map<string, DraftNote[]>();
    for (const d of [...drafts].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
      const k = d.client_label ?? '';
      by.set(k, [...(by.get(k) ?? []), d]);
    }
    return [...by.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  }, [drafts]);
  const notesFor = (label: string) => groups.find(([k]) => k === label)?.[1] ?? [];

  /** A name's backlog settings: the page's when it is that name's, else its saved notes'. */
  const backlogFor = (label: string) => {
    if (label && label === clientLabel.trim() && backlogStart) return { start: backlogStart, ext: backlogExt };
    const prior = notesFor(label).find((d) => d.backlog_start);
    return { start: prior?.backlog_start ?? '', ext: prior?.backlog_extension ?? false };
  };

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const startNote = (label: string, cycle: BacklogCycle | null, start: string, ext: boolean) => {
    setTab('new');
    setMode('draft');
    setVisit(cycle ? 'old' : 'recent');
    setClientLabel(label);
    setBacklogStart(start);
    setBacklogExt(ext);
    setBacklogCycle(cycle?.n ?? null);
    setContactDate(cycle?.start ?? '');
    setEditingDraft(null);
    setComposerKey((k) => k + 1);
    setOpenLabel(null);
    toTop();
  };

  const editDraft = (d: DraftNote) => {
    setTab('new');
    setMode('draft');
    setMethod(d.contact_method);
    setClientLabel(d.client_label ?? '');
    setContactDate(d.contact_date ?? '');
    setVisit(d.backlog_start ? 'old' : 'recent');
    setBacklogStart(d.backlog_start ?? '');
    setBacklogExt(d.backlog_extension);
    setBacklogCycle(d.backlog_cycle);
    setEditingDraft(d);
    setComposerKey((k) => k + 1);
    setOpenLabel(null);
    toTop();
  };

  const differentClient = () => {
    setAfterSave(null);
    setTab('new');
    setMode('draft');
    setClientLabel('');
    setContactDate('');
    setMethod(null);
    setBacklogStart('');
    setBacklogExt(false);
    setBacklogCycle(null);
    setEditingDraft(null);
    setComposerKey((k) => k + 1);
    toTop();
    setTimeout(() => document.getElementById('manual-client-name')?.focus(), 50);
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

  const saveNote = async (c: ComposedNote) => {
    try {
      const label = clientLabel.trim();
      const backlog = visit === 'old' && backlogStart && backlogCycle ? { start: backlogStart, cycle: backlogCycle, extension: backlogExt } : null;
      await saveDraft(c, { contactMethod: method, id: editingDraft?.id, clientLabel, contactDate, backlog });
      setEditingDraft(null);
      setContactDate('');
      setBacklogCycle(null);
      setComposerKey((k) => k + 1);
      refresh();
      if (backlog && label && user) {
        // Offer the next cycle without a note, after this one if there is one.
        const done = await loadBacklogNotes(user.id, label, backlog.start).catch(() => ({}) as Record<number, unknown>);
        const all = backlogCycles(backlog.start, backlog.extension);
        const next = all.find((x) => x.n > backlog.cycle && !done[x.n]) ?? all.find((x) => !done[x.n]) ?? null;
        setAfterSave({ label, cycle: backlog.cycle, start: backlog.start, ext: backlog.extension, next });
      } else {
        toast({ title: editingDraft ? 'Note updated' : 'Note saved', description: 'Find it under Generated notes.' });
      }
    } catch (e) {
      toast({ title: 'Could not save the note', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  /** Old visit: once the name and 150-day start date are in, show the cycles. */
  const openCycles = (start = backlogStart) => {
    const name = clientLabel.trim();
    if (!name) {
      toast({ title: 'Enter the client name first' });
      document.getElementById('manual-client-name')?.focus();
      return;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) setOpenLabel(name);
  };

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  const activeCycle = visit === 'old' && backlogStart && backlogCycle ? backlogCycles(backlogStart, backlogExt).find((x) => x.n === backlogCycle) ?? null : null;
  // The note builder shows once the visit is set up: a recent visit, or an old one with its cycle.
  const ready = visit === 'recent' || !!activeCycle;
  // A backlog cycle is chosen: the name and the cycle are all there is to set up.
  const cycleHeader = mode === 'draft' && !!activeCycle;
  const open = openLabel !== null ? { label: openLabel, ...backlogFor(openLabel) } : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-[1300px] space-y-5 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-bold">Generate Notes</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'new' | 'notes')}>
          <TabsList>
            <TabsTrigger value="new">New note</TabsTrigger>
            <TabsTrigger value="notes">Generated notes ({drafts.length})</TabsTrigger>
          </TabsList>
        </Tabs>

        {tab === 'new' && (
          <>
            <Card className="space-y-3 p-4">
              {cycleHeader && activeCycle ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-2xl font-bold">{clientLabel.trim()}</p>
                    <p className="text-base font-medium text-muted-foreground">
                      Cycle {activeCycle.n} · {cycleDates(activeCycle)}
                    </p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openCycles()}>
                      Change cycle
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setBacklogCycle(null); setEditingDraft(null); setComposerKey((k) => k + 1); }}>
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
              <>
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
                  <ClientPicker clients={caseload} value={clientId} onChange={startClientNote} className="h-10 w-full" />
                </div>
              )}

              {mode === 'draft' && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Is this a recent visit or an old one?</h3>
                  <div className="flex flex-wrap gap-2">
                    <Chip selected={visit === 'recent'} onClick={() => { setVisit('recent'); setBacklogCycle(null); }}>
                      Recent visit
                    </Chip>
                    <Chip selected={visit === 'old'} onClick={() => setVisit('old')}>
                      Old visit <span className="font-normal opacity-80">(needs the 150-day start date)</span>
                    </Chip>
                  </div>
                </div>
              )}

              {/* Revealed once the kind of visit is chosen. */}
              {mode === 'draft' && visit && (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-full max-w-md space-y-1.5">
                    <p className="text-base font-semibold text-foreground">Client name{visit === 'old' ? '' : <span className="text-sm font-normal text-muted-foreground"> (optional)</span>}</p>
                    <Input id="manual-client-name" aria-label="Client name" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} maxLength={80} className="h-12 text-lg" />
                  </div>
                  {visit === 'recent' && (
                    <div className="space-y-1.5">
                      <p className="text-base font-semibold text-foreground">Contact date</p>
                      <Input aria-label="Contact date" type="date" value={contactDate} onChange={(e) => setContactDate(e.target.value)} className="h-12 w-52 text-lg" />
                    </div>
                  )}
                  {visit === 'old' && (
                    <>
                      <div className="space-y-1.5">
                        <p className="text-base font-semibold text-foreground">150-day start date</p>
                        <Input
                          aria-label="150-day start date"
                          type="date"
                          value={backlogStart}
                          onChange={(e) => {
                            setBacklogStart(e.target.value);
                            setBacklogCycle(null);
                            openCycles(e.target.value);
                          }}
                          className="h-12 w-52 text-lg"
                        />
                      </div>
                      <label className="flex h-12 items-center gap-2 text-base">
                        <Checkbox checked={backlogExt} onCheckedChange={(c) => setBacklogExt(c === true)} />
                        Include 180-day extension
                      </label>
                      {backlogStart && (
                        <Button variant="outline" className="h-9" onClick={() => openCycles()}>
                          {activeCycle ? 'Change cycle' : 'Choose cycle'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}

              </>
              )}

              {mode === 'draft' && ready && (
                <div className="space-y-1.5">
                  <h3 className="font-semibold">
                    How did the contact happen? <span className="text-xs font-normal text-muted-foreground">Optional</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {CONTACT_METHOD_OPTIONS.map((m) => (
                      <Chip key={m.value} selected={method === m.value} onClick={() => setMethod(method === m.value ? null : m.value)}>
                        {m.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {mode === 'draft' && visit === 'old' && !activeCycle && (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Choose a cycle to start the note.</p>
            )}
            {mode === 'draft' && ready && (
              <div className="space-y-2">
                {editingDraft && (
                  <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    Editing a note saved {format(new Date(editingDraft.updated_at), 'MMM d')}.{' '}
                    <button className="underline" onClick={() => { setEditingDraft(null); setBacklogCycle(null); setComposerKey((k) => k + 1); }}>
                      Start a new note instead
                    </button>
                  </p>
                )}
                <NoteComposer
                  key={composerKey}
                  method={method}
                  initial={editingDraft?.composed ?? null}
                  useLabel={
                    <>
                      <ClipboardCopy className="mr-1.5 h-4 w-4" />
                      Copy note
                    </>
                  }
                  onUse={(c) => void copy(c.final, toast)}
                  extraActions={(c) => (
                    <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!c} onClick={() => c && void saveNote(c)}>
                      {editingDraft ? 'Update note' : 'Save note'}
                    </Button>
                  )}
                />
              </div>
            )}
          </>
        )}

        {tab === 'notes' && (
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Generated notes</h2>
              
            </div>
            {groups.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No generated notes yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Notes</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Backlog</th>
                    <th className="hidden px-4 py-2 font-medium md:table-cell">Last saved</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {groups.map(([label, list]) => {
                    const b = list.find((d) => d.backlog_start);
                    return (
                      <tr key={label || 'none'} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpenLabel(label)}>
                        <td className="px-4 py-2.5 font-semibold">{label || <span className="font-normal italic text-muted-foreground">No name</span>}</td>
                        <td className="px-4 py-2.5">{list.length}</td>
                        <td className="hidden px-4 py-2.5 text-muted-foreground sm:table-cell">
                          {b?.backlog_start ? `From ${day(b.backlog_start)}${b.backlog_extension ? ' · 180 days' : ''}` : '—'}
                        </td>
                        <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{format(new Date(list[0].updated_at), "MMM d 'at' h:mm a")}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Button size="sm" variant="outline" className="h-8">Open</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>

      {open && (
        <ManualClientDialog
          open
          onOpenChange={(o) => !o && setOpenLabel(null)}
          userId={user?.id ?? null}
          label={open.label || null}
          drafts={notesFor(open.label)}
          start={open.start}
          extension={open.ext}
          activeCycle={open.label === clientLabel.trim() && tab === 'new' && mode === 'draft' ? backlogCycle : null}
          caseload={caseload}
          onAddCycleNote={(c, start, ext) => startNote(open.label, c, start, ext)}
          onAddNote={() => startNote(open.label, null, open.start, open.ext)}
          onEdit={editDraft}
          onCopy={(d) => void copy(d.final_narrative, toast)}
          onDelete={(d) => void deleteDraft(d.id).then(refresh).catch((e) => toast({ title: 'Could not delete', description: e.message, variant: 'destructive' }))}
          onAssign={(d, id) => {
            const ctx = contextFor(id);
            // The note's contact date becomes the touchpoint date.
            if (ctx) setTouchpoint({ context: { ...ctx, date: d.contact_date ?? undefined }, draft: d });
            setOpenLabel(null);
          }}
        />
      )}

      <Dialog open={!!afterSave} onOpenChange={(o) => !o && setAfterSave(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cycle {afterSave?.cycle} saved</DialogTitle>
            <DialogDescription>
              {afterSave?.next ? `${afterSave.label}: continue with the next cycle, or start on a different client.` : `${afterSave?.label}: every cycle has a note.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-start">
            {afterSave?.next && (
              <Button
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => {
                  const a = afterSave;
                  setAfterSave(null);
                  if (a.next) startNote(a.label, a.next, a.start, a.ext);
                }}
              >
                Go to cycle {afterSave.next.n}
              </Button>
            )}
            <Button variant="outline" onClick={differentClient}>
              Different client
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const label = afterSave?.label ?? '';
                setAfterSave(null);
                setOpenLabel(label);
              }}
            >
              View cycles
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
