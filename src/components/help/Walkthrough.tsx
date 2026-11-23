// "Show me": a cartoon hand walks the person through a task in the real app.
//
// For each step the page dims, a red ring circles the control to press, the
// hand glides over to it and taps, and a bubble says what to do. The person
// presses the real control; the walkthrough sees the press and moves on,
// following them to the next page. Nothing is pressed for them.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HandIcon } from '@/components/help/HandIcon';
import type { Walkthrough as Walk } from '@/lib/help/walkthroughs';
import { setPractice } from '@/lib/practiceMode';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8;

export const Walkthrough: React.FC<{ walk: Walk; onEnd: () => void }> = ({ walk, onEnd }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [lost, setLost] = useState(false);
  /** The control sits in an open window, which already dims the page. */
  const [inWindow, setInWindow] = useState(false);
  const targetRef = useRef<Element | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const step = walk.steps[index];
  const last = index === walk.steps.length - 1;

  // The person presses the real controls, so nothing they do while it runs
  // is saved (src/lib/practiceMode.ts).
  useEffect(() => {
    setPractice('walkthrough', true);
    return () => setPractice('walkthrough', false);
  }, []);

  const next = useCallback(() => {
    if (last) onEnd();
    else setIndex((i) => i + 1);
  }, [last, onEnd]);

  // Open the step's page, once, when it starts somewhere else. Sections of the
  // main page ("/?view=clients") switch through navigation state, as the
  // sidebar does; other pages by their path.
  useEffect(() => {
    if (!step.route || step.target()) return;
    const url = new URL(step.route, window.location.origin);
    const view = url.searchParams.get('view');
    if (url.pathname === '/' && view) {
      if (location.pathname !== '/' || new URLSearchParams(location.search).get('view') !== view) {
        navigate('/', { state: { view } });
      }
    } else if (location.pathname !== url.pathname) {
      navigate(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Find the control and follow it as the page moves, scrolls or changes.
  useEffect(() => {
    setBox(null);
    setLost(false);
    let scrolled = false;
    const started = Date.now();
    const find = () => {
      const el = step.target();
      targetRef.current = el;
      if (!el) {
        setBox(null);
        if (Date.now() - started > 8000) setLost(true);
        return;
      }
      setLost(false);
      setInWindow(!!el.closest('[role="dialog"]:not([data-help-ui] *), [role="alertdialog"]') && !el.matches('[role="dialog"]'));
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 0 || r.bottom > window.innerHeight;
      if (offscreen && !scrolled) {
        scrolled = true;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      setBox((b) =>
        b && Math.abs(b.top - r.top) < 1 && Math.abs(b.left - r.left) < 1 && Math.abs(b.width - r.width) < 1 && Math.abs(b.height - r.height) < 1
          ? b
          : { top: r.top, left: r.left, width: r.width, height: r.height },
      );
    };
    find();
    const timer = window.setInterval(find, 250);
    return () => window.clearInterval(timer);
  }, [step]);

  // A press on the circled control moves the walkthrough on.
  useEffect(() => {
    if (step.advance !== 'click') return;
    const onPress = (e: Event) => {
      const el = targetRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) window.setTimeout(next, 350);
    };
    document.addEventListener('click', onPress, true);
    return () => document.removeEventListener('click', onPress, true);
  }, [step, next]);

  // Escape ends it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEnd();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnd]);

  // An open window treats a press outside it as a reason to close; the bubble's
  // buttons must not count as one.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    el.addEventListener('mousedown', stop);
    return () => {
      el.removeEventListener('pointerdown', stop);
      el.removeEventListener('mousedown', stop);
    };
  });

  const ring = box && { top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 };
  // A whole window is outlined, not tapped.
  const big = !!box && (box.width > 480 || box.height > 300);
  const hand = box && !big
    ? { left: box.left + Math.min(box.width * 0.6, box.width - 12), top: box.top + box.height * 0.55 }
    : box
      ? { left: box.left + box.width - 40, top: box.top + 16 }
      : { left: window.innerWidth - 140, top: window.innerHeight - 200 };

  // The bubble goes below the control, or above it when there is no room.
  const bubbleW = Math.min(340, window.innerWidth - 32);
  let bubble = { left: window.innerWidth / 2 - bubbleW / 2, top: window.innerHeight / 2 - 60 };
  if (box) {
    const left = Math.min(Math.max(16, box.left + box.width / 2 - bubbleW / 2 + 60), window.innerWidth - bubbleW - 16);
    const below = box.top + box.height + PAD + 96;
    // A whole window: the bubble sits below or above it, inside it only when neither fits.
    const bigLeft = Math.min(window.innerWidth - bubbleW - 16, Math.max(16, box.left + box.width - bubbleW));
    bubble = big
      ? box.top + box.height + PAD + 170 < window.innerHeight
        ? { left: bigLeft, top: box.top + box.height + PAD + 14 }
        : box.top - PAD - 170 > 0
          ? { left: bigLeft, top: box.top - PAD - 170 }
          : { left: Math.min(window.innerWidth - bubbleW - 16, box.left + box.width - bubbleW - 16), top: Math.max(16, box.top + 16) }
      : below + 150 < window.innerHeight
        ? { left, top: below }
        : { left, top: Math.max(16, box.top - PAD - 170) };
  }

  return createPortal(
    <div data-help-ui className="pointer-events-none fixed inset-0 z-[120]" aria-live="polite">
      {/* The dim, with a clear window over the control. */}
      {ring ? (
        <div
          aria-hidden
          className="absolute rounded-xl transition-all duration-500"
          style={{ ...ring, boxShadow: inWindow ? 'none' : '0 0 0 9999px hsl(202 43% 19% / 0.32)', transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-[hsl(202_43%_19%/0.32)]" />
      )}
      {/* The red ring. */}
      {ring && (
        <div
          aria-hidden
          className="absolute rounded-xl border-[3px] border-[#d9483b] transition-all duration-500 [animation:walk-ring_1.4s_ease-out_infinite]"
          style={{ ...ring, transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      )}
      {/* The hand: glides to the control, then taps. */}
      <div
        aria-hidden
        className="absolute transition-all duration-700"
        style={{ left: hand.left, top: hand.top, transitionTimingFunction: 'cubic-bezier(0.34, 1.3, 0.64, 1)' }}
      >
        <HandIcon className="h-[84px] w-[74px] drop-shadow-[0_6px_10px_rgba(27,53,68,0.25)] [animation:walk-tap_1.4s_ease-in-out_infinite]" />
      </div>
      {/* The bubble. */}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-label={`${walk.title}: step ${index + 1} of ${walk.steps.length}`}
        className="pointer-events-auto absolute rounded-2xl bg-card p-4 shadow-[0_16px_40px_-8px_hsl(202_43%_19%/0.35)] transition-all duration-500"
        style={{ ...bubble, width: bubbleW, transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-semibold text-primary">
            {walk.title} · Step {index + 1} of {walk.steps.length}
          </p>
          <button type="button" onClick={onEnd} className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Exit">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p key={index} className="mt-1 animate-rise text-base font-semibold text-foreground">
          {box ? step.say : lost ? 'I can’t find it on this page.' : 'Looking for it…'}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${((index + 1) / walk.steps.length) * 100}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          {index > 0 ? (
            <button type="button" onClick={() => setIndex((i) => i - 1)} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
              Back
            </button>
          ) : (
            <span />
          )}
          {(step.advance === 'next' && box) || lost ? (
            <Button size="sm" onClick={next}>
              {last ? 'Done' : lost ? 'Skip this step' : 'Next'}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{box ? 'Waiting for you to press it' : ''}</span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
