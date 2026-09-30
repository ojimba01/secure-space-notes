// The Support button, bottom-right on every page.
//
// Describe the problem, and show it: a screenshot of the page to draw on, a
// recording of the screen, or a file. Support is emailed straight away, and
// replies come back here, with a dot on the button when there is a new one.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Camera,
  CircleHelp,
  Loader2,
  Paperclip,
  Square,
  Video,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { ScreenshotMarkup } from '@/components/support/ScreenshotMarkup';
import { TicketThread } from '@/components/support/TicketThread';
import {
  hasNewReply,
  loadMyTickets,
  markSeen,
  openTicket,
  STATUS_CLASS,
  STATUS_LABEL,
  uploadAttachment,
  type Attachment,
  type Ticket,
  ticketTitle,
} from '@/lib/support';

/** Longest recording, so a forgotten one does not run on. */
const MAX_RECORDING_MS = 3 * 60_000;

interface Pending {
  id: string;
  blob: Blob;
  kind: Attachment['kind'];
  name: string;
  preview?: string;
}

export const SupportButton: React.FC = () => {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'new' | 'mine'>('new');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [sending, setSending] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [markup, setMarkup] = useState<HTMLCanvasElement | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [viewing, setViewing] = useState<Ticket | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setTickets(await loadMyTickets(user.id));
  }, [user]);

  // Other pages can open the panel, such as Contact support in the Help guide.
  useEffect(() => {
    const show = () => {
      setTab('new');
      setViewing(null);
      setOpen(true);
    };
    window.addEventListener('open-support', show);
    return () => window.removeEventListener('open-support', show);
  }, []);

  // Look for replies on load and every few minutes, for the dot on the button.
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3 * 60_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!user || pathname.startsWith('/auth') || pathname.startsWith('/reset-password')) return null;

  const unread = tickets.filter(hasNewReply).length;

  const add = (blob: Blob, kind: Attachment['kind'], name: string) =>
    setPending((p) => [
      ...p,
      {
        id: crypto.randomUUID(),
        blob,
        kind,
        name,
        preview: kind === 'screenshot' ? URL.createObjectURL(blob) : undefined,
      },
    ]);

  const screenshot = async () => {
    setCapturing(true);
    setOpen(false);
    try {
      // Let the panel close before the page is photographed.
      await new Promise((r) => setTimeout(r, 150));
      const { default: html2canvas } = await import('html2canvas-pro');
      const canvas = await html2canvas(document.body, {
        ignoreElements: (el) => el instanceof HTMLElement && el.dataset.supportWidget !== undefined,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        logging: false,
        useCORS: true,
      });
      setMarkup(canvas);
    } catch (e) {
      setOpen(true);
      toast({
        title: 'Could not take a screenshot',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setCapturing(false);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast({ title: 'Screen recording is not supported in this browser', variant: 'destructive' });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        recorder.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' });
        if (blob.size) add(blob, 'recording', `screen-recording-${format(new Date(), 'yyyy-MM-dd-HHmm')}.webm`);
        setOpen(true);
      };
      // Stopping from the browser's own "Stop sharing" bar ends it too.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => rec.state !== 'inactive' && rec.stop());
      rec.start(1000);
      recorder.current = rec;
      setRecording(true);
      setOpen(false);
      window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), MAX_RECORDING_MS);
    } catch {
      // Choosing Cancel in the browser's share picker is not an error.
    }
  };

  const send = async () => {
    if (!title.trim()) {
      toast({ title: 'Enter a title', variant: 'destructive' });
      return;
    }
    if (!message.trim()) {
      toast({ title: 'Describe the issue before sending', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const attachments: Attachment[] = [];
      for (const p of pending) attachments.push(await uploadAttachment(user.id, p.blob, p.kind, p.name));
      await openTicket(title, message, attachments);
      pending.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      setPending([]);
      setTitle('');
      setMessage('');
      await refresh();
      setTab('mine');
      toast({
        title: 'Support request sent',
        description: 'Support has been notified. Replies will appear under My requests.',
      });
    } catch (e) {
      toast({
        title: 'Could not send the request',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const openTicketView = (t: Ticket) => {
    setViewing(t);
    if (hasNewReply(t)) void markSeen(t.id).then(refresh);
  };

  return (
    <>
      {markup && (
        <ScreenshotMarkup
          image={markup}
          onCancel={() => {
            setMarkup(null);
            setOpen(true);
          }}
          onSave={(png) => {
            add(png, 'screenshot', `screenshot-${format(new Date(), 'yyyy-MM-dd-HHmm')}.png`);
            setMarkup(null);
            setOpen(true);
          }}
        />
      )}

      <div data-support-widget className="fixed bottom-4 right-4 z-[90] flex flex-col items-end gap-2">
        {open && (
          <div className="flex max-h-[min(640px,calc(100vh-6rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              {viewing ? (
                <button className="flex items-center gap-1.5 text-sm font-medium" onClick={() => setViewing(null)}>
                  <ArrowLeft className="h-4 w-4" />
                  My requests
                </button>
              ) : (
                <div>
                  <div className="font-semibold">Support</div>
                  <div className="text-xs text-muted-foreground">Report a problem or ask a question.</div>
                </div>
              )}
              <Button variant="ghost" size="icon" aria-label="Close support" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {!viewing && (
              <div className="flex gap-1 border-b px-3 py-2">
                <Button size="sm" variant={tab === 'new' ? 'default' : 'ghost'} onClick={() => setTab('new')}>
                  New request
                </Button>
                <Button size="sm" variant={tab === 'mine' ? 'default' : 'ghost'} onClick={() => setTab('mine')}>
                  My requests
                  {unread > 0 && (
                    <span className="ml-1.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unread}</span>
                  )}
                </Button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {viewing ? (
                <div className="space-y-3">
                  <h3 className="font-semibold">{ticketTitle(viewing)}</h3>
                  <span className={`rounded-md px-2 py-0.5 text-xs ${STATUS_CLASS[viewing.status]}`}>
                    {STATUS_LABEL[viewing.status]}
                  </span>
                  <TicketThread ticket={viewing} asSupport={false} onReplied={refresh} />
                </div>
              ) : tab === 'new' ? (
                <div className="space-y-3">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Title"
                    aria-label="Title"
                    maxLength={100}
                  />
                  <Textarea
                    aria-label="Description"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Describe the issue. What were you trying to do, and what happened?"
                    rows={5}
                    maxLength={4000}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-2" onClick={() => void screenshot()} disabled={capturing}>
                      {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                      <span className="text-xs">Screenshot</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-2" onClick={() => void startRecording()}>
                      <Video className="h-4 w-4" />
                      <span className="text-xs">Record screen</span>
                    </Button>
                    <Button variant="outline" size="sm" className="h-auto flex-col gap-1 py-2" onClick={() => fileInput.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                      <span className="text-xs">Attach file</span>
                    </Button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        if (f.size > 25 * 1024 * 1024) {
                          toast({ title: 'Files must be 25 MB or smaller', variant: 'destructive' });
                        } else {
                          add(f, f.type.startsWith('image/') ? 'screenshot' : 'file', f.name);
                        }
                      }
                      e.target.value = '';
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Screenshot captures this page so you can circle the problem. Record screen captures up
                    to 3 minutes.
                  </p>
                  {pending.length > 0 && (
                    <div className="space-y-2">
                      {pending.map((p) => (
                        <div key={p.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                          {p.preview ? (
                            <img src={p.preview} alt="" className="h-10 w-16 rounded object-cover" />
                          ) : p.kind === 'recording' ? (
                            <Video className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <Paperclip className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Remove attachment"
                            onClick={() => setPending((all) => all.filter((x) => x.id !== p.id))}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <Button className="w-full" onClick={() => void send()} disabled={sending}>
                    {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send to support
                  </Button>
                </div>
              ) : tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">You have not sent any support requests.</p>
              ) : (
                <div className="space-y-2">
                  {tickets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => openTicketView(t)}
                      className="w-full rounded-md border p-3 text-left hover:bg-muted/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-xs ${STATUS_CLASS[t.status]}`}>
                          {STATUS_LABEL[t.status]}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {hasNewReply(t) && <span className="h-2 w-2 rounded-full bg-red-600" />}
                          {format(new Date(t.created_at), 'MMM d')}
                        </span>
                      </div>
                      <p className="mt-1.5 truncate text-sm font-medium">{ticketTitle(t)}</p>
                      {hasNewReply(t) && <p className="mt-1 text-xs font-medium text-red-700">New reply from support</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {recording ? (
          <Button className="gap-2 rounded-full bg-red-600 shadow-lg hover:bg-red-700" onClick={() => recorder.current?.stop()}>
            <Square className="h-4 w-4 fill-current" />
            Stop recording
          </Button>
        ) : (
          <Button
            className="relative gap-2 rounded-full shadow-lg"
            onClick={() => {
              setOpen((o) => !o);
              if (!open) void refresh();
            }}
            aria-label="Support"
          >
            <CircleHelp className="h-5 w-5" />
            <span className="hidden sm:inline">Support</span>
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] text-white">
                {unread}
              </span>
            )}
          </Button>
        )}
      </div>
    </>
  );
};
