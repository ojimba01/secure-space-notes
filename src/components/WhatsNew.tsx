import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { usePreview } from '@/components/ViewAsProvider';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCanViewStaffActivity } from '@/hooks/useCanViewStaffActivity';
import { todayAgency } from '@/lib/billing';
import { FEATURES, RIBBON_MS, loadViews, markNotified, markSeen, type FeatureAudience } from '@/lib/whatsNew';

/** Shows each new feature's notice once, to the people it is for (src/lib/whatsNew.ts). */
export const WhatsNew = () => {
  const { user } = useAuth();
  const { previewing } = usePreview();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { canView, loading: activityLoading } = useCanViewStaffActivity();

  useEffect(() => {
    if (!user || previewing || adminLoading || activityLoading) return;
    const fits: Record<FeatureAudience, boolean> = { everyone: true, admins: isAdmin, staffActivity: canView };
    const today = todayAgency();
    let cancelled = false;
    void loadViews(user.id).then((views) => {
      if (cancelled) return;
      for (const f of FEATURES) {
        if (!fits[f.audience] || today > f.announceUntil || views.get(f.key)?.notified_at) continue;
        toast(f.message, { position: 'top-center', duration: 5000 });
        void markNotified(user.id, f.key);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, previewing, isAdmin, adminLoading, canView, activityLoading]);

  return null;
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
