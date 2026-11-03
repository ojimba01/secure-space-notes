// One support ticket: the request, its attachments and the conversation.
// Shared by the Support panel (the person who asked) and the Support tickets
// page (support answering).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, CircleHelp, FileText, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { ReplyEditor, type ReplyEditorHandle } from '@/components/support/ReplyEditor';
import { RichText } from '@/components/support/RichText';
import { cleanRich, hasFormatting } from '@/lib/richText';
import {
  loadMessages,
  askFollowUp,
  reply,
  signedUrl,
  uploadAttachment,
  type Attachment,
  type Ticket,
  type TicketMessage,
} from '@/lib/support';

// ---- screenshots open in a large viewer on the page, with arrows between them

const ShotsContext = createContext<{ open: (path: string) => void } | null>(null);

/** Every screenshot in its group (a ticket, or one message), viewable one after another. */
const ShotsProvider: React.FC<{ paths: string[]; children: React.ReactNode }> = ({ paths, children }) => {
  const [index, setIndex] = useState<number | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const open = useCallback((path: string) => setIndex(Math.max(0, paths.indexOf(path))), [paths]);
  const path = index === null ? null : paths[index];

  useEffect(() => {
    if (!path || urls[path]) return;
    void signedUrl(path).then((u) => u && setUrls((m) => ({ ...m, [path]: u })));
  }, [path, urls]);

  const step = useCallback((by: number) => setIndex((i) => (i === null ? i : (i + by + paths.length) % paths.length)), [paths.length]);
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, step]);

  return (
    <ShotsContext.Provider value={{ open }}>
      {children}
      <Dialog open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-[95vw] flex-col gap-3 p-4">
          <DialogTitle className="sr-only">Screenshot</DialogTitle>
          <DialogDescription className="sr-only">
            Screenshot {index === null ? '' : index + 1} of {paths.length}
          </DialogDescription>
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-md bg-muted/40">
            {path && urls[path] ? (
              <img src={urls[path]} alt={`Screenshot ${index! + 1} of ${paths.length}`} className="max-h-full max-w-full object-contain" />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
          {paths.length > 1 && (
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" size="icon" aria-label="Previous screenshot" onClick={() => step(-1)}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <span className="min-w-16 text-center text-sm tabular-nums text-muted-foreground">
                {index === null ? '' : index + 1} of {paths.length}
              </span>
              <Button variant="outline" size="icon" aria-label="Next screenshot" onClick={() => step(1)}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ShotsContext.Provider>
  );
};

const shotPaths = (items: Attachment[]) => items.filter((a) => a.kind === 'screenshot').map((a) => a.path);

const AttachmentView: React.FC<{ a: Attachment }> = ({ a }) => {
  const shots = useContext(ShotsContext);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void signedUrl(a.path).then(setUrl);
  }, [a.path]);
  if (!url) return <div className="h-20 w-32 animate-pulse rounded bg-muted" />;
  if (a.kind === 'screenshot') {
    return (
      <button type="button" title="View screenshot" onClick={() => shots?.open(a.path)} className="rounded border transition hover:ring-2 hover:ring-primary">
        <img src={url} alt="Screenshot" className="max-h-48 rounded" />
      </button>
    );
  }
  if (a.kind === 'recording') {
    return <video src={url} controls className="max-h-64 w-full rounded border bg-black" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary underline">
      <FileText className="h-4 w-4" />
      {a.name ?? 'File'}
    </a>
  );
};

export const Attachments: React.FC<{ items: Attachment[] }> = ({ items }) => {
  const inThread = useContext(ShotsContext);
  if (!items.length) return null;
  const list = (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <AttachmentView key={a.path} a={a} />
      ))}
    </div>
  );
  // Inside a ticket the viewer steps through all of its screenshots; on its own, through these.
  return inThread ? list : <ShotsProvider paths={shotPaths(items)}>{list}</ShotsProvider>;
};

interface Props {
  ticket: Ticket;
  /** Replying as support, rather than as the person who asked. */
  asSupport: boolean;
  requesterName?: string;
  onReplied?: () => void;
}

export const TicketThread: React.FC<Props> = ({ ticket, asSupport, requesterName, onReplied }) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<TicketMessage[] | null>(null);
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Support writes in the formatting editor; the person who asked keeps a plain box.
  const editorRef = useRef<ReplyEditorHandle>(null);
  const [editorHasContent, setEditorHasContent] = useState(false);

  useEffect(() => {
    setMessages(null);
    void loadMessages(ticket.id).then(setMessages);
  }, [ticket.id]);

  const send = async (followUp = false) => {
    const content = asSupport ? editorRef.current?.read() : null;
    if (asSupport ? !content || (!content.plain && !content.images.length) : !draft.trim()) return;
    setSending(true);
    try {
      if (content) {
        if (content.images.length && !user) throw new Error('Sign in again to attach images.');
        const attachments: Attachment[] = [];
        for (const img of content.images) {
          attachments.push(await uploadAttachment(user!.id, img.blob, 'screenshot', img.name));
        }
        // A reply that is only images still says so in plain text.
        const plain = content.plain || (attachments.length === 1 ? 'Image attached.' : 'Images attached.');
        const extras = { rich: hasFormatting(content.blocks) ? content.blocks : undefined, attachments };
        if (followUp) await askFollowUp(ticket.id, plain, extras);
        else await reply(ticket.id, plain, true, extras);
        editorRef.current?.clear();
      } else {
        if (followUp) await askFollowUp(ticket.id, draft);
        else await reply(ticket.id, draft, asSupport);
        setDraft('');
      }
      setMessages(await loadMessages(ticket.id));
      onReplied?.();
    } catch (e) {
      toast({
        title: 'Could not send the reply',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const bubble = (
    fromSupport: boolean,
    who: string,
    at: string,
    body: string,
    attachments: Attachment[],
    rich?: unknown,
  ) => {
    const mine = fromSupport === asSupport;
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] rounded-lg border p-3 ${fromSupport ? 'bg-sky-50' : 'bg-white'}`}>
          <div className="mb-1 text-xs text-muted-foreground">
            {who} · {format(new Date(at), "MMM d 'at' h:mm a")}
          </div>
          {cleanRich(rich).length ? <RichText value={rich} /> : <p className="whitespace-pre-wrap text-sm">{body}</p>}
          <Attachments items={attachments} />
        </div>
      </div>
    );
  };

  const canSend = asSupport ? editorHasContent : !!draft.trim();

  const allShots = shotPaths([...ticket.attachments, ...(messages ?? []).flatMap((m) => m.attachments)]);

  return (
    <ShotsProvider paths={allShots}>
    <div className="space-y-3">
      {bubble(false, requesterName ?? 'You', ticket.created_at, ticket.message, ticket.attachments)}
      {messages === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        messages.map((m) => (
          <React.Fragment key={m.id}>
            {bubble(
              m.from_support,
              m.from_support ? 'Support' : requesterName ?? 'You',
              m.created_at,
              m.body,
              m.attachments,
              m.body_rich,
            )}
          </React.Fragment>
        ))
      )}
      <div className="space-y-2 border-t pt-3">
        {asSupport ? (
          <ReplyEditor
            ref={editorRef}
            placeholder="Write a reply to the staff member…"
            disabled={sending}
            onChange={setEditorHasContent}
          />
        ) : (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add more detail or reply to support…"
            maxLength={4000}
            rows={3}
          />
        )}
        <div className="flex justify-end gap-2">
          {asSupport && (
            <Button size="sm" variant="outline" onClick={() => void send(true)} disabled={sending || !canSend}>
              <CircleHelp className="mr-1.5 h-4 w-4" />
              Ask follow-up
            </Button>
          )}
          <Button size="sm" onClick={() => void send()} disabled={sending || !canSend}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send reply
          </Button>
        </div>
      </div>
    </div>
    </ShotsProvider>
  );
};
