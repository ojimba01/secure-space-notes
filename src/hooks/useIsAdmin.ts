import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { usePreview } from '@/components/ViewAsProvider';
import { cachedRole, rememberRole } from '@/lib/roleCache';

export const useIsAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  // Known from an earlier page: no wait, so the menu does not change as it loads.
  const [isAdmin, setIsAdmin] = useState(() => cachedRole(user?.id, 'admin') ?? false);
  const [loading, setLoading] = useState(() => cachedRole(user?.id, 'admin') === undefined);

  useEffect(() => {
    const checkAdmin = async () => {
      // Stay in the loading state until auth has hydrated, otherwise a direct
      // page load resolves "not admin" before the session is known.
      if (authLoading) {
        setLoading(true);
        return;
      }
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }
      const known = cachedRole(user.id, 'admin');
      if (known !== undefined) {
        setIsAdmin(known);
        setLoading(false);
      }

      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'superadmin']);

        const value = !!data && data.length > 0;
        rememberRole(user.id, 'admin', value);
        setIsAdmin(value);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [user, authLoading]);

  // A preview shows the app with the previewed person's access.
  const { previewing, access } = usePreview();
  if (previewing) return { isAdmin: !!access?.isAdmin, loading: !access };
  return { isAdmin, loading };
};
