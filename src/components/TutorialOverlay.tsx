import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TutorialDefinition, TutorialPlacement } from '@/lib/tutorials';

interface TutorialOverlayProps {
  definition: TutorialDefinition;
  onComplete: () => void;
  onSkip: () => void;
}

const CARD_WIDTH = 340;
const GAP = 16;
const MARGIN = 12;

interface PanelPos {
  top: number;
  left: number;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  definition,
  onComplete,
  onSkip,
}) => {
  const steps = definition.steps;
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const step = steps[index];

  const measure = useCallback(() => {
    const el = step?.target
      ? (document.querySelector(step.target) as HTMLElement | null)
      : null;
    if (el) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useLayoutEffect(() => {
    measure();
    // Re-measure shortly after in case of layout/scroll settling.
    const t = setTimeout(measure, 120);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  // Robust placement: never cover the target, always stay on screen.
  useLayoutEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardH = cardRef.current?.offsetHeight ?? 200;
    const isMobile = vw < 768;

    if (isMobile || !targetRect) {
      // Center horizontally; pin to bottom on mobile, center when no target.
      if (!targetRect) {
        setPanelPos({
          top: Math.max(MARGIN, vh / 2 - cardH / 2),
          left: Math.max(MARGIN, vw / 2 - CARD_WIDTH / 2),
        });
      } else {
        setPanelPos({ top: vh - cardH - MARGIN, left: MARGIN });
      }
      return;
    }

    const spaceTop = targetRect.top;
    const spaceBottom = vh - targetRect.bottom;
    const spaceLeft = targetRect.left;
    const spaceRight = vw - targetRect.right;

    const order: TutorialPlacement[] = [];
    if (step?.placement && step.placement !== 'auto') order.push(step.placement);
    // Fallback preference by available room.
    const byRoom: Array<[TutorialPlacement, number]> = [
      ['bottom', spaceBottom],
      ['top', spaceTop],
      ['right', spaceRight],
      ['left', spaceLeft],
    ];
    byRoom.sort((a, b) => b[1] - a[1]);
    byRoom.forEach(([p]) => order.includes(p) || order.push(p));

    const fits = (p: TutorialPlacement): boolean => {
      if (p === 'bottom') return spaceBottom >= cardH + GAP;
      if (p === 'top') return spaceTop >= cardH + GAP;
      if (p === 'right') return spaceRight >= CARD_WIDTH + GAP;
      if (p === 'left') return spaceLeft >= CARD_WIDTH + GAP;
      return false;
    };

    const chosen = order.find(fits) ?? order[0];

    let top = 0;
    let left = 0;
    const cx = targetRect.left + targetRect.width / 2;
    const cy = targetRect.top + targetRect.height / 2;

    switch (chosen) {
      case 'top':
        top = targetRect.top - cardH - GAP;
        left = cx - CARD_WIDTH / 2;
        break;
      case 'left':
        top = cy - cardH / 2;
        left = targetRect.left - CARD_WIDTH - GAP;
        break;
      case 'right':
        top = cy - cardH / 2;
        left = targetRect.right + GAP;
        break;
      case 'bottom':
      default:
        top = targetRect.bottom + GAP;
        left = cx - CARD_WIDTH / 2;
        break;
    }

    // Clamp inside viewport.
    left = Math.min(Math.max(MARGIN, left), vw - CARD_WIDTH - MARGIN);
    top = Math.min(Math.max(MARGIN, top), vh - cardH - MARGIN);
    setPanelPos({ top, left });
  }, [targetRect, index, step]);

  const handleNext = () => {
    if (index < steps.length - 1) setIndex((i) => i + 1);
    else onComplete();
  };
  const handlePrev = () => index > 0 && setIndex((i) => i - 1);

  if (steps.length === 0) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Dimmer with a cut-out highlight around the target */}
      {targetRect ? (
        <div
          className="absolute border-2 border-primary rounded-lg pointer-events-none transition-all"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      <Card
        ref={cardRef}
        className="absolute shadow-2xl border-primary/20 w-[calc(100%-24px)] md:w-[340px]"
        style={panelPos ? { top: panelPos.top, left: panelPos.left } : { opacity: 0 }}
      >
        <CardHeader className="pb-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
                {index + 1}
              </span>
              <CardTitle className="text-base truncate">{step.title}</CardTitle>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onSkip}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <CardDescription className="text-sm leading-relaxed">
            {step.description}
          </CardDescription>

          <div className="flex items-center gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  i <= index ? 'bg-primary' : 'bg-muted',
                )}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePrev}
              disabled={index === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <span className="text-xs text-muted-foreground">
              {index + 1} of {steps.length}
            </span>
            <Button size="sm" onClick={handleNext} className="gap-1">
              {index === steps.length - 1 ? (
                <>
                  Finish
                  <Check className="h-4 w-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>,
    document.body,
  );
};

export default TutorialOverlay;
