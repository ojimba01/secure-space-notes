import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/components/AuthProvider';
import { usePreview } from '@/components/ViewAsProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCanViewStaffActivity } from '@/hooks/useCanViewStaffActivity';
import { todayAgency } from '@/lib/billing';
import { AutosaveIllustration } from '@/components/illustrations/AutosaveIllustration';
import { EditHistoryIllustration } from '@/components/illustrations/EditHistoryIllustration';
import { FEATURES, RIBBON_MS, loadViews, markNotified, markSeen, type Feature, type FeatureAudience } from '@/lib/whatsNew';

const ILLUSTRATIONS = { autosave: AutosaveIllustration, editHistory: EditHistoryIllustration } as const;

/**
 * A NEW band across the top left corner, wrapping round the card's edges: the
 * two dark triangles are the band's ends folding behind.
 */
const CornerRibbon = () => (
  <div className="pointer-events-none absolute -left-2 -top-2 z-10 h-28 w-28 overflow-hidden">
    <span className="absolute right-0 top-0 h-2 w-2 bg-red-800" />
    <span className="absolute bottom-0 left-0 h-2 w-2 bg-red-800" />
    <span className="absolute -left-10 top-7 block w-44 -rotate-45 bg-gradient-to-r from-red-600 to-orange-500 py-1.5 text-center text-sm font-bold uppercase tracking-widest text-white shadow-md">
      New
    </span>
  </div>
);

/** Shows each new feature's notice once, to the people it is for (src/lib/whatsNew.ts). */
export const WhatsNew = () => {
  const { user } = useAuth();
  const { previewing } = usePreview();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { canView, loading: activityLoading } = useCanViewStaffActivity();
  const navigate = useNavigate();
  /**
   * Every popup this person has not seen yet, shown one after another. Each
   * has to be acknowledged with Got it before the next, so nobody misses one.
   */
  const [queue, setQueue] = useState<Feature[]>([]);
  const [index, setIndex] = useState(0);
  const popup = queue[index] ?? null;

  useEffect(() => {
    if (!user || previewing || adminLoading || activityLoading) return;
    const fits: Record<FeatureAudience, boolean> = { everyone: true, admins: isAdmin, staffActivity: canView };
    const today = todayAgency();
    let cancelled = false;
    void loadViews(user.id).then((views) => {
      if (cancelled) return;
      const popups: Feature[] = [];
      for (const f of FEATURES) {
        if (!fits[f.audience] || today > f.announceUntil || views.get(f.key)?.notified_at) continue;
        if (f.popup) {
          // Counted as seen when its Got it is pressed, so one left unread
          // comes back on the next visit.
          popups.push(f);
        } else {
          toast(f.message, { position: 'top-center', duration: 5000 });
          void markNotified(user.id, f.key);
        }
      }
      setQueue(popups);
      setIndex(0);
    });
    return () => {
      cancelled = true;
    };
  }, [user, previewing, isAdmin, adminLoading, canView, activityLoading]);

  if (!popup?.popup) return null;
  const { title, steps, body, illustration, goTo } = popup.popup;
  /** Got it: this one is seen; on to the next. */
  const close = () => {
    if (user) void markNotified(user.id, popup.key);
    setIndex((i) => i + 1);
  };
  /** "1 of 2" when there is more than one. */
  const counter =
    queue.length > 1 ? (
      <p className="text-xs font-medium text-muted-foreground">
        {index + 1} of {queue.length}
      </p>
    ) : null;
  /** Only Got it closes it: not a click outside, Escape or an X. */
  const stay = {
    hideClose: true,
    onInteractOutside: (e: Event) => e.preventDefault(),
    onEscapeKeyDown: (e: KeyboardEvent) => e.preventDefault(),
  };

  if (illustration) {
    const Picture = ILLUSTRATIONS[illustration];
    return (
      <Dialog open>
        <DialogContent key={popup.key} {...stay} className="max-w-lg gap-0 overflow-visible rounded-2xl border-0 p-0 sm:rounded-2xl">
          <CornerRibbon />
          <div className="overflow-hidden rounded-t-2xl bg-gradient-to-br from-sky-100 via-sky-50 to-orange-50 px-6 pb-2 pt-8">
            <Picture className="mx-auto h-48 w-full max-w-sm" />
          </div>
          <div className="space-y-3 px-8 pb-8 pt-6 text-center">
            {counter}
            <DialogTitle className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">{title}</DialogTitle>
            {body && <p className="text-base text-muted-foreground">{body}</p>}
            <div className="flex justify-center gap-2 pt-3">
              {goTo ? (
                <Button
                  size="lg"
                  onClick={() => {
                    close();
                    navigate(goTo.path, { state: goTo.state });
                  }}
                >
                  {goTo.label}
                </Button>
              ) : (
                <Button size="lg" className="min-w-36" onClick={close}>
                  Got it
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open>
      <DialogContent key={popup.key} {...stay} className="max-w-md">
        <DialogHeader>
          {counter}
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {(steps ?? []).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={close}>
            Got it
          </Button>
          {goTo && (
            <Button
              onClick={() => {
                close();
                navigate(goTo.path, { state: goTo.state });
              }}
            >
              {goTo.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/** Whether a feature's "New" ribbon shows: for 24 hours from the first time the person sees it. */
export function useNewRibbon(feature: string): boolean {
  const { user } = useAuth();
  const { previewing } = usePreview();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const f = FEATURES.find((x) => x.key === feature);
    if (!user || previewing || !f || todayAgency() > f.announceUntil) return;
    let cancelled = false;
    void markSeen(user.id, feature).then((seen) => {
      if (cancelled) return;
      const left = new Date(seen).getTime() + RIBBON_MS - Date.now();
      if (left <= 0) return;
      setShow(true);
      const timer = window.setTimeout(() => setShow(false), left);
      return () => window.clearTimeout(timer);
    });
    return () => {
      cancelled = true;
    };
  }, [user, previewing, feature]);

  return show;
}

/**
 * The small "New" ribbon. Over the corner of a control (its parent needs
 * `relative`), or `inline` beside a text link.
 */
export const NewRibbon = ({ inline = false }: { inline?: boolean }) => (
  <span
    className={`pointer-events-none z-10 rounded bg-red-600 px-1.5 py-px text-[10px] font-semibold uppercase leading-4 text-white shadow-sm ${
      inline ? 'ml-1.5 inline-block align-middle' : 'absolute -right-1 -top-2'
    }`}
  >
    New
  </span>
);
