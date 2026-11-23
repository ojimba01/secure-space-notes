// How many of this person's notices are unread, for the Inbox in the menu.
// Read again every minute, on coming back to the tab, and when the Inbox or
// the bell marks something read.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useEffectiveProfileId } from '@/hooks/useEffectiveProfileId';

export function useUnreadCount(): number {
  const profileId = useEffectiveProfileId();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!profileId) return;
    // Newer than the generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: n } = await (supabase.from as any)('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', profileId)
      .is('read_at', null);
    setCount(n ?? 0);
  }, [profileId]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onChange = () => void load();
    window.addEventListener('focus', onChange);
    window.addEventListener('notifications-changed', onChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('notifications-changed', onChange);
    };
  }, [load]);

  return count;
}
