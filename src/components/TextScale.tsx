// Applies the signed-in person's text size to the whole app. In a preview it
// applies the previewed person's, so you see the app at the size they do.
import { useEffect } from 'react';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { useViewAs } from '@/components/ViewAsProvider';
import { applyTextScale, cachedTextScale, loadTextScale } from '@/lib/textScale';

/** Event fired when Advanced Tools changes someone's size, so it shows at once. */
export const TEXT_SCALE_CHANGED = 'text-scale-changed';

export const TextScale = () => {
  const mine = useMyProfileId();
  const { viewAsEmployeeId } = useViewAs();
  const profileId = viewAsEmployeeId ?? mine;

  useEffect(() => {
    if (!profileId) {
      applyTextScale(null, 1);
      return;
    }
    let cancelled = false;
    const cached = cachedTextScale(profileId);
    if (cached) applyTextScale(profileId, cached);
    const refresh = () =>
      void loadTextScale(profileId).then((s) => {
        if (!cancelled) applyTextScale(profileId, s);
      });
    refresh();
    window.addEventListener(TEXT_SCALE_CHANGED, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(TEXT_SCALE_CHANGED, refresh);
    };
  }, [profileId]);

  return null;
};
