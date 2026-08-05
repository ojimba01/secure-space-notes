import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface BillingTutorialStep {
  title: string;
  body: string;
  /** Label for the advance button when the step does not require pressing the highlighted element. */
  cta: string;
  selector: string;
  /** When true the user must press the highlighted element to move on. */
  requireClick?: boolean;
  before?: () => void;
}

export function BillingTutorial({ steps, onClose, onFinish }: { steps: BillingTutorialStep[]; onClose: () => void; onFinish: () => void }) {
  const [n, setN] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [done, setDone] = useState(false);
  const stepIndex = useRef(0);
  const step = steps[n];
  stepIndex.current = n;

  useEffect(() => { step?.before?.(); }, [n]);

  useEffect(() => {
    if (done || !step) return;
    const measure = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    const t = window.setTimeout(() => {
      document.querySelector(step.selector)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      measure();
    }, 200);
    const interval = window.setInterval(measure, 400);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t); window.clearInterval(interval);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [n, step?.selector, done]);

  // Advance when the user presses the highlighted element itself.
  useEffect(() => {
    if (done || !step?.requireClick) return;
    const handler = (event: MouseEvent) => {
      const target = document.querySelector(step.selector);
      if (target && event.target instanceof Node && target.contains(event.target)) {
        window.setTimeout(() => {
          if (stepIndex.current !== n) return;
          if (n === steps.length - 1) setDone(true); else setN(n + 1);
        }, 350);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [n, step?.selector, step?.requireClick, steps.length, done]);

  const cardStyle: React.CSSProperties = rect && !done
    ? {
        top: Math.min(window.innerHeight - 320, Math.max(16, rect.bottom + 16)),
        left: Math.min(window.innerWidth - 430, Math.max(16, rect.left)),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };

  const advance = () => (n === steps.length - 1 ? setDone(true) : setN(n + 1));

  if (done) {
    return createPortal(
      <div className="fixed inset-0 z-[9998]">
        <div className="absolute inset-0 bg-slate-950/60" />
        <Card className="absolute w-[min(440px,calc(100vw-32px))] p-6 shadow-2xl" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <h2 className="text-lg font-bold">Billing tutorial complete</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">You have completed the Billing tutorial.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Begin with Current billing deadlines to see which clients require attention. Use Add or set up client billing to enter client information or complete missing information.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">You can restart the tutorial at any time by pressing Learn how to use Billing.</p>
          <div className="mt-5 flex justify-end"><Button onClick={onFinish}>Return to Billing</Button></div>
        </Card>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {!rect && <div className="absolute inset-0 bg-slate-950/55" />}
      {rect && (
        <div
          className="absolute rounded-lg border-2 border-blue-500"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(2,6,23,0.55)' }}
        />
      )}
      <Card className="pointer-events-auto absolute w-[min(420px,calc(100vw-32px))] p-5 shadow-2xl" style={cardStyle}>
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Billing tutorial · Step {n + 1} of {steps.length}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmClose(true)}><X className="h-4 w-4" /></Button>
        </div>
        <h2 className="mt-3 text-lg font-bold">{step.title}</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={!n} onClick={() => setN(n - 1)}>Previous</Button>
          {step.requireClick
            ? <span className="text-xs font-medium text-blue-700">{step.cta}</span>
            : <Button size="sm" onClick={advance}>{n === steps.length - 1 ? 'Complete tutorial' : step.cta}</Button>}
        </div>
      </Card>

      {confirmClose && (
        <div className="pointer-events-auto absolute inset-0 z-10 grid place-items-center bg-slate-950/50">
          <Card className="w-[min(400px,calc(100vw-32px))] p-5 shadow-2xl">
            <h3 className="font-semibold">Are you sure you want to leave the tutorial?</h3>
            <p className="mt-2 text-sm text-muted-foreground">Your practice progress will not be saved.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmClose(false)}>Continue tutorial</Button>
              <Button size="sm" onClick={onClose}>Leave tutorial</Button>
            </div>
          </Card>
        </div>
      )}
    </div>,
    document.body,
  );
}
