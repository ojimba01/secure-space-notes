import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { useIsPreviewing } from '@/components/ViewAsProvider';

export const useIsSuperadmin = () => {
  const { user } = useAuth();
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setIsSuperadmin(false);
        setLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'superadmin');

        setIsSuperadmin(!!data && data.length > 0);
      } catch (error) {
        console.error('Error checking superadmin status:', error);
        setIsSuperadmin(false);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [user]);

  // Nothing superadmin-only shows during a preview; see useIsAdmin.
  const previewing = useIsPreviewing();
  return { isSuperadmin: isSuperadmin && !previewing, loading };
};
