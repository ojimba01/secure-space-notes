import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface BillingTutorialStep {
  title: string;
  body: string;
  /** Shown after the required action is finished. The user then presses Continue. */
  followUp?: string;
  /** Area to outline. */
  selector: string;
  /** True once the required action for this step has happened. Undefined = Continue only. */
  done?: boolean;
  /** Continue stays disabled until this is true. */
  gate?: boolean;
  /** Text that tells the user which control to press. */
  hint?: string;
  /** Restores the practice screen for this step. */
  before?: () => void;
}

const CARD_WIDTH = 420;
const CARD_HEIGHT = 300;

export function BillingTutorial({ steps, completionBody, onClose, onFinish }: {
  steps: BillingTutorialStep[];
  completionBody: string[];
  onClose: () => void;
  onFinish: () => void;
}) {
  const [n, setN] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [complete, setComplete] = useState(false);
  // A step only advances once its action was seen as not-yet-done first, so
  // returning to a previous step never jumps forward again straight away.
  const [armed, setArmed] = useState(false);
  const [phase, setPhase] = useState<'main' | 'followUp'>('main');
  const step = steps[n];

  useEffect(() => {
    setArmed(false);
    setPhase('main');
    step?.before?.();
  }, [n]);

  // Measure and scroll the highlighted area into view.
  useEffect(() => {
    if (complete || !step) return;
    const measure = () => {
      const el = document.querySelector(step.selector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    const t = window.setTimeout(() => {
      document.querySelector(step.selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      measure();
    }, 250);
    const interval = window.setInterval(measure, 300);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [n, step?.selector, complete]);

  const advance = () => (n === steps.length - 1 ? setComplete(true) : setN(n + 1));

  // Watch the required action.
  useEffect(() => {
    if (complete || !step || step.done === undefined || phase === 'followUp') return;
    if (!step.done) { if (!armed) setArmed(true); return; }
    if (!armed) return;
    if (step.followUp) { setPhase('followUp'); return; }
    const t = window.setTimeout(advance, 250);
    return () => window.clearTimeout(t);
  }, [step?.done, armed, complete, phase, n]);

  if (complete) {
    return createPortal(
      <div className="fixed inset-0 z-[9998]">
        <div className="absolute inset-0 bg-slate-950/60" />
        <Card className="absolute w-[min(460px,calc(100vw-32px))] p-6 shadow-2xl" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <h2 className="text-lg font-bold">Billing tutorial complete</h2>
          {completionBody.map((p, i) => (
            <p key={i} className="mt-2 text-sm leading-6 text-muted-foreground">{p}</p>
          ))}
          <div className="mt-5 flex justify-end"><Button onClick={onFinish}>Return to Billing</Button></div>
        </Card>
      </div>,
      document.body,
    );
  }

  if (!step) return null;

  // Keep the box near the highlight without covering it.
  const cardStyle: React.CSSProperties = (() => {
    if (!rect) return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };
    const below = rect.bottom + 16;
    const roomBelow = window.innerHeight - below >= CARD_HEIGHT;
    const top = roomBelow ? below : Math.max(16, rect.top - CARD_HEIGHT - 16);
    const left = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - CARD_WIDTH - 16));
    return { top, left };
  })();

  const waiting = step.done !== undefined && phase === 'main';
  const canContinue = step.gate !== false;

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {!rect && <div className="absolute inset-0 bg-slate-950/55" />}
      {rect && (
        <div
          className="absolute rounded-lg border-2 border-blue-500"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16, boxShadow: '0 0 0 9999px rgba(2,6,23,0.55)' }}
        />
      )}
      <Card className="pointer-events-auto absolute w-[min(420px,calc(100vw-32px))] p-5 shadow-2xl" style={cardStyle}>
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Billing tutorial · Step {n + 1} of {steps.length}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmClose(true)}><X className="h-4 w-4" /></Button>
        </div>
        <h2 className="mt-3 text-lg font-bold">{step.title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
          {phase === 'followUp' ? step.followUp : step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={!n} onClick={() => setN(n - 1)}>Previous</Button>
          {waiting
            ? <span className="text-right text-xs font-medium text-blue-700">{step.hint}</span>
            : <Button size="sm" disabled={!canContinue} onClick={advance}>{n === steps.length - 1 ? 'Complete Tutorial' : 'Continue'}</Button>}
        </div>
      </Card>

      {confirmClose && (
        <div className="pointer-events-auto absolute inset-0 z-10 grid place-items-center bg-slate-950/50">
          <Card className="w-[min(400px,calc(100vw-32px))] p-5 shadow-2xl">
            <h3 className="font-semibold">Are you sure you want to leave the tutorial?</h3>
            <p className="mt-2 text-sm text-muted-foreground">Your practice progress will not be saved.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmClose(false)}>Continue Tutorial</Button>
              <Button size="sm" onClick={onClose}>Leave Tutorial</Button>
            </div>
          </Card>
        </div>
      )}
    </div>,
    document.body,
  );
}
