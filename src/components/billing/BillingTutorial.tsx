import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface BillingTutorialStep {
  title: string;
  body: string;
  cta: string;
  selector: string;
  before?: () => void;
}

export function BillingTutorial({ steps, onClose, onFinish }: { steps: BillingTutorialStep[]; onClose: () => void; onFinish: () => void }) {
  const [n, setN] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[n];

  useEffect(() => { step.before?.(); }, [n]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const el = document.querySelector(step.selector);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    const t = window.setTimeout(measure, 250);
    const interval = window.setInterval(measure, 600);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t); window.clearInterval(interval); cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [n, step.selector]);

  const cardStyle: React.CSSProperties = rect
    ? {
        top: Math.min(window.innerHeight - 300, Math.max(16, rect.bottom + 16)),
        left: Math.min(window.innerWidth - 420, Math.max(16, rect.left)),
      }
    : { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' };

  const next = () => (n === steps.length - 1 ? onFinish() : setN(n + 1));

  return createPortal(
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-slate-950/55" onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div
          className="absolute rounded-lg border-2 border-blue-500 pointer-events-none"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(2,6,23,0.55)' }}
        />
      )}
      <Card className="absolute w-[min(400px,calc(100vw-32px))] p-5 shadow-2xl" style={cardStyle}>
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">Billing walkthrough · {n + 1} of {steps.length}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <h2 className="mt-3 text-lg font-bold">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" disabled={!n} onClick={() => setN(n - 1)}>Back</Button>
          <Button size="sm" onClick={next}>{step.cta}</Button>
        </div>
      </Card>
    </div>,
    document.body,
  );
}
