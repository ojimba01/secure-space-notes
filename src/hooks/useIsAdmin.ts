import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

export const useIsAdmin = () => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  // Which user id the current isAdmin value was resolved for.
  const [checkedUser, setCheckedUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        setCheckedUser(null);
        return;
      }
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'superadmin']);
        if (!cancelled) setIsAdmin(!!data && data.length > 0);
      } catch (error) {
        console.error('Error checking admin status:', error);
        if (!cancelled) setIsAdmin(false);
      } finally {
        if (!cancelled) setCheckedUser(user.id);
      }
    };
    checkAdmin();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Still loading whenever we have a user we haven't finished checking yet.
  const loading = user ? checkedUser !== user.id : checkedUser === undefined;

  return { isAdmin, loading };
};
