import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { usePreview } from '@/components/ViewAsProvider';
import { cachedRole, rememberRole } from '@/lib/roleCache';

export const useIsSuperadmin = () => {
  const { user } = useAuth();
  const [isSuperadmin, setIsSuperadmin] = useState(() => cachedRole(user?.id, 'superadmin') ?? false);
  const [loading, setLoading] = useState(() => cachedRole(user?.id, 'superadmin') === undefined);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setIsSuperadmin(false);
        setLoading(false);
        return;
      }
      const known = cachedRole(user.id, 'superadmin');
      if (known !== undefined) {
        setIsSuperadmin(known);
        setLoading(false);
      }

      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'superadmin');

        const value = !!data && data.length > 0;
        rememberRole(user.id, 'superadmin', value);
        setIsSuperadmin(value);
      } catch (error) {
        console.error('Error checking superadmin status:', error);
        setIsSuperadmin(false);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user]);

  // Superadmins are never previewed, so nothing superadmin-only shows in one.
  const { previewing } = usePreview();
  return { isSuperadmin: isSuperadmin && !previewing, loading };
};
