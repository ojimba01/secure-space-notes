// Comments on a form's questions: the open ones shown on the question, with
// Done for the person who fixes them, and a short composer of ready-made
// comments for a supervisor (src/lib/formComments.ts).
import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, MessageSquarePlus, MessageSquareWarning } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { COMMENT_PRESETS, type FormComment } from '@/lib/formComments';

/** The open comments on one question (or, with field null, on the whole form). */
export const OpenComments: React.FC<{
  comments: FormComment[];
  authorName: (id: string | null) => string;
  canResolve: boolean;
  onResolve: (id: string) => void;
}> = ({ comments, authorName, canResolve, onResolve }) => {
  const open = comments.filter((c) => !c.resolved_at);
  if (!open.length) return null;
  return (
    <div className="space-y-1.5">
      {open.map((c) => (
        <div key={c.id} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm">
          <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            {c.quote && (
              <p className="mb-0.5 text-xs text-amber-950/80">
                On <mark className="rounded-sm bg-yellow-200 px-0.5 text-amber-950">{c.quote}</mark>
              </p>
            )}
            <p className="font-medium text-amber-950">{c.body}</p>
            <p className="text-xs text-amber-900/80">
              {c.field_label && !c.field ? `${c.field_label} · ` : ''}
              {authorName(c.author_id)} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
            </p>
          </div>
          {canResolve && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 bg-white" onClick={() => onResolve(c.id)}>
              <Check className="mr-1 h-3.5 w-3.5" />
              Done
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};

/** Pick a ready-made comment, add a note if needed, and send. */
export const CommentComposer: React.FC<{
  onSend: (preset: string | null, note: string) => Promise<void>;
  onCancel: () => void;
}> = ({ onSend, onCancel }) => {
  const [preset, setPreset] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3">
      <div className="flex flex-wrap gap-1.5">
        {COMMENT_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPreset((cur) => (cur === p.key ? null : p.key))}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              preset === p.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note (optional)" className="h-8 bg-background" />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={sending || (!preset && !note.trim())}
          onClick={async () => {
            setSending(true);
            try {
              await onSend(preset, note);
            } finally {
              setSending(false);
            }
          }}
        >
          {sending ? 'Sending…' : 'Send comment'}
        </Button>
      </div>
    </div>
  );
};

/**
 * The comment icon in the margin of a question, as in Word. Highlight words
 * in the answer first to comment on just those; the comment keeps them.
 */
export const MarginComment: React.FC<{
  field: string;
  label: string;
  onSend: (preset: string | null, note: string, quote: string | null) => Promise<void>;
}> = ({ field, label, onSend }) => {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<string | null>(null);

  /** The words highlighted in this question's answer box, if any. */
  const readSelection = () => {
    const box = document.getElementById(`wf-${field}`) as HTMLInputElement | HTMLTextAreaElement | null;
    if (box && typeof box.selectionStart === 'number' && box.selectionEnd !== box.selectionStart) {
      return box.value.slice(box.selectionStart ?? 0, box.selectionEnd ?? 0).trim() || null;
    }
    const text = window.getSelection()?.toString().trim();
    return text ? text.slice(0, 200) : null;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setQuote(readSelection());
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          // Keeps the highlight in the answer box while the icon is pressed.
          onMouseDown={(e) => e.preventDefault()}
          title={`Comment on ${label}`}
          aria-label={`Comment on ${label}`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-amber-100 hover:text-amber-800"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {quote && (
          <p className="border-b px-3 py-2 text-xs text-muted-foreground">
            On <mark className="rounded-sm bg-yellow-200 px-0.5 text-foreground">{quote}</mark>
          </p>
        )}
        <CommentComposer
          onSend={async (preset, note) => {
            await onSend(preset, note, quote);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
};
