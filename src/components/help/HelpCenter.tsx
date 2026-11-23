// Help: the panel behind the Help button and the Help guide link.
//
// Ask how to do something (typed, or spoken where speech stays on the device),
// or pick a common task, then press Show me: a cartoon hand walks through it in
// the real app (src/components/help/Walkthrough.tsx). Contacting support is at
// the foot of the panel.
//
// Opened with the window event "help:open" (or "help:toggle"), so the Support
// launcher and the sidebar can open it without passing anything down.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, CircleHelp, Loader2, MessageSquare, Mic, Play, Square, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WALKTHROUGHS, type Walkthrough as Walk } from '@/lib/help/walkthroughs';
import { askHelp } from '@/lib/help/assistant';
import { useOnDeviceDictation } from '@/hooks/useOnDeviceDictation';
import { Walkthrough } from '@/components/help/Walkthrough';

interface Turn {
  role: 'you' | 'help';
  text: string;
  walk?: Walk | null;
}

export const openHelp = () => window.dispatchEvent(new Event('help:open'));

export const HelpCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [walk, setWalk] = useState<Walk | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const before = useRef('');

  const dictation = useOnDeviceDictation((text, final) => {
    setQuestion(`${before.current}${before.current && text ? ' ' : ''}${text}`);
    if (final) before.current = '';
  });

  useEffect(() => {
    const show = () => setOpen(true);
    const toggle = () => setOpen((o) => !o);
    window.addEventListener('help:open', show);
    window.addEventListener('help:toggle', toggle);
    return () => {
      window.removeEventListener('help:open', show);
      window.removeEventListener('help:toggle', toggle);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns, asking]);

  const showMe = useCallback((w: Walk) => {
    setOpen(false);
    setWalk(w);
  }, []);

  const ask = async () => {
    const q = question.trim();
    if (!q || asking) return;
    dictation.stop();
    setQuestion('');
    setTurns((t) => [...t, { role: 'you', text: q }]);
    setAsking(true);
    const answer = await askHelp(q);
    setAsking(false);
    setTurns((t) => [...t, { role: 'help', text: answer.text, walk: answer.walkthrough }]);
  };

  const listening = dictation.status === 'listening';

  return (
    <>
      {walk && <Walkthrough key={walk.id} walk={walk} onEnd={() => setWalk(null)} />}
      {open && (
        <div
          data-help-ui
          role="dialog"
          aria-label="Help"
          className="fixed bottom-20 right-4 z-[95] flex max-h-[min(640px,calc(100vh-7rem))] w-[min(400px,calc(100vw-2rem))] animate-rise flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_40px_-6px_hsl(202_43%_19%/0.25)]"
        >
          <div className="flex items-center gap-2.5 bg-primary px-4 py-3 text-primary-foreground">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
              <CircleHelp className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 text-base font-semibold">Help</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-white/15" aria-label="Close Help">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 && (
              <>
                <p className="text-lg font-semibold text-foreground">What do you want to do?</p>
                <p className="text-[13px] text-muted-foreground">Ask, or pick a task. I’ll show you on the screen.</p>
              </>
            )}
            {turns.map((t, i) =>
              t.role === 'you' ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] animate-rise rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">{t.text}</p>
                </div>
              ) : (
                <div key={i} className="max-w-[92%] animate-rise space-y-2.5 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3 text-sm text-foreground">
                  <p>{t.text}</p>
                  {t.walk && (
                    <>
                      <ol className="space-y-1.5">
                        {t.walk.steps.map((s, n) => (
                          <li key={n} className="flex gap-2 text-[13px]">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-primary">{n + 1}</span>
                            {s.say}
                          </li>
                        ))}
                      </ol>
                      <button
                        type="button"
                        onClick={() => showMe(t.walk!)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.98]"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Show me
                      </button>
                    </>
                  )}
                </div>
              ),
            )}
            {asking && (
              <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Finding it
              </div>
            )}
            {(turns.length === 0 || turns[turns.length - 1]?.walk === null) && (
              <div className="stagger space-y-1.5">
                {WALKTHROUGHS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => showMe(w)}
                    className="group flex w-full items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    <Play className="h-3.5 w-3.5 fill-primary text-primary" />
                    <span className="flex-1">{w.title}</span>
                    <ChevronRight className="nudge h-4 w-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask();
              }}
              className={cn(
                'flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5 transition-colors',
                listening ? 'border-[#d9483b] ring-2 ring-[#d9483b]/15' : 'border-input focus-within:border-primary/50',
              )}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask how to do something"
                aria-label="Ask how to do something"
                className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              />
              {dictation.supported && (
                <button
                  type="button"
                  onClick={() => {
                    if (listening) dictation.stop();
                    else {
                      before.current = question;
                      void dictation.start();
                    }
                  }}
                  disabled={dictation.status === 'downloading' || dictation.status === 'checking'}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all',
                    listening ? 'animate-pulse bg-[#d9483b] text-white' : 'bg-accent text-primary hover:bg-accent/70',
                  )}
                  aria-label={listening ? 'Stop listening' : 'Speak your question'}
                  title={dictation.status === 'needs-download' ? 'Set up speech on this computer' : undefined}
                >
                  {dictation.status === 'downloading' || dictation.status === 'checking' ? <Loader2 className="h-4 w-4 animate-spin" /> : listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <button
                type="submit"
                disabled={!question.trim() || asking}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
                aria-label="Ask"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
            {listening && <p className="mt-1.5 px-1 text-xs font-medium text-[#d9483b]">Listening… speech stays on this computer.</p>}
            {dictation.status === 'downloading' && <p className="mt-1.5 px-1 text-xs text-muted-foreground">Setting up speech on this computer.</p>}
            {dictation.status === 'needs-download' && <p className="mt-1.5 px-1 text-xs text-muted-foreground">Press the mic again to set up speech on this computer.</p>}
            {dictation.status === 'unavailable' && <p className="mt-1.5 px-1 text-xs text-muted-foreground">Speaking isn’t available on this computer. Type your question instead.</p>}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event('support:open'));
            }}
            className="flex items-center gap-2 border-t border-border bg-muted/50 px-4 py-2.5 text-[13px] font-semibold text-primary hover:bg-muted"
          >
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Contact support
          </button>
        </div>
      )}
    </>
  );
};
