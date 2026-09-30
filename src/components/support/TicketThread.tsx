// One support ticket: the request, its attachments and the conversation.
// Shared by the Support panel (the person who asked) and the Support tickets
// page (support answering).
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  loadMessages,
  reply,
  signedUrl,
  type Attachment,
  type Ticket,
  type TicketMessage,
} from '@/lib/support';

const AttachmentView: React.FC<{ a: Attachment }> = ({ a }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    void signedUrl(a.path).then(setUrl);
  }, [a.path]);
  if (!url) return <div className="h-20 w-32 animate-pulse rounded bg-muted" />;
  if (a.kind === 'screenshot') {
    return (
      <a href={url} target="_blank" rel="noreferrer" title="Open full size">
        <img src={url} alt="Screenshot" className="max-h-48 rounded border" />
      </a>
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

export const Attachments: React.FC<{ items: Attachment[] }> = ({ items }) =>
  items.length ? (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) => (
        <AttachmentView key={a.path} a={a} />
      ))}
    </div>
  ) : null;

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
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setMessages(null);
    void loadMessages(ticket.id).then(setMessages);
  }, [ticket.id]);

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await reply(ticket.id, draft, asSupport);
      setDraft('');
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

  const bubble = (fromSupport: boolean, who: string, at: string, body: string, attachments: Attachment[]) => {
    const mine = fromSupport === asSupport;
    return (
      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[85%] rounded-lg border p-3 ${fromSupport ? 'bg-sky-50' : 'bg-white'}`}>
          <div className="mb-1 text-xs text-muted-foreground">
            {who} · {format(new Date(at), "MMM d 'at' h:mm a")}
          </div>
          <p className="whitespace-pre-wrap text-sm">{body}</p>
          <Attachments items={attachments} />
        </div>
      </div>
    );
  };

  return (
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
            )}
          </React.Fragment>
        ))
      )}
      <div className="space-y-2 border-t pt-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={asSupport ? 'Write a reply to the staff member…' : 'Add more detail or reply to support…'}
          maxLength={4000}
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => void send()} disabled={sending || !draft.trim()}>
            {sending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            Send reply
          </Button>
        </div>
      </div>
    </div>
  );
};
