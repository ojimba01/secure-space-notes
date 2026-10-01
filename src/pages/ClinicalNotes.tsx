// Clinical Notes: build a note without first opening a client.
//
// "Existing client" picks the client and opens the touchpoint with the note
// builder, so the note is saved as that client's touchpoint. "Manual entry"
// builds a note tied to no client record: copy it, or save it as a draft and
// assign it to a client later, when it becomes that client's touchpoint note.
// A typed name labels drafts (a backlog for someone not in the app, several
// notes for one person); it is never written into the note itself.
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ClipboardCopy, Hand, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
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
import { deleteDraft, loadMyDrafts, saveDraft, type DraftNote } from '@/lib/clinicalNotes/save';
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
  const [composerKey, setComposerKey] = useState(0);
  const [editingDraft, setEditingDraft] = useState<DraftNote | null>(null);
  const [drafts, setDrafts] = useState<DraftNote[]>([]);
  const [touchpoint, setTouchpoint] = useState<{ context: TouchpointContext; draft?: DraftNote } | null>(null);
  const [assigning, setAssigning] = useState<DraftNote | null>(null);
  const [assignTo, setAssignTo] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (user) void loadMyDrafts(user.id).then(setDrafts).catch(() => setDrafts([]));
  }, [user]);
  useEffect(refresh, [refresh]);

  // Drafts for the same name together, newest first within each; unnamed last.
  const grouped = [...drafts].sort(
    (a, b) => (a.client_label ?? '\uffff').localeCompare(b.client_label ?? '\uffff') || b.updated_at.localeCompare(a.updated_at),
  );

  /** Start another manual note for the same name (a backlog, say). */
  const startNoteFor = (label: string) => {
    setMode('draft');
    setClientLabel(label);
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
      await saveDraft(c, method, editingDraft?.id, clientLabel);
      // The name stays filled in, so several notes for one person go quickly.
      toast({ title: editingDraft ? 'Draft updated' : 'Draft saved', description: clientLabel.trim() ? `Saved under ${clientLabel.trim()}. Start the next note below.` : 'Assign it to a client from My drafts when you are ready.' });
      setEditingDraft(null);
      setComposerKey((k) => k + 1);
      refresh();
    } catch (e) {
      toast({ title: 'Could not save the draft', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  };

  if (!authLoading && !user) return <Navigate to="/auth" replace />;

  return (
    <PageShell>
      <div className="mx-auto max-w-[1300px] space-y-5 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-bold">Clinical Notes</h1>
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
            <div className="max-w-md space-y-1.5">
              <p className="text-xs text-muted-foreground">Client name (optional)</p>
              <Input aria-label="Client name" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} maxLength={80} className="h-9" />
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
          <div className="space-y-2">
            {editingDraft && (
              <p className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                Editing a draft from {format(new Date(editingDraft.updated_at), 'MMM d')}.{' '}
                <button className="underline" onClick={() => { setEditingDraft(null); setComposerKey((k) => k + 1); }}>
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
                      onClick={() => {
                        setMode('draft');
                        setMethod(d.contact_method);
                        setClientLabel(d.client_label ?? '');
                        setEditingDraft(d);
                        setComposerKey((k) => k + 1);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
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
                            if (ctx) setTouchpoint({ context: ctx, draft: d });
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
