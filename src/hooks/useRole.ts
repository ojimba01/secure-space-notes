import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'superadmin' | 'admin' | 'staff';

/**
 * Consolidated role hook. Staff maps to the existing `employee` DB role.
 * - superadmin: full access + Advanced tools / staff workflow preview
 * - admin: same navigation as superadmin minus Advanced tools
 * - staff: Touchpoints, Calendar, My clients, Notes, Help Guide only
 */
export const useRole = () => {
  const { user } = useAuth();
  const [role, setRole] = useState<AppRole>('staff');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      if (!user) {
        setRole('staff');
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        const roles = (data ?? []).map((r) => r.role);
        if (roles.includes('superadmin')) setRole('superadmin');
        else if (roles.includes('admin')) setRole('admin');
        else setRole('staff');
      } catch (e) {
        console.error('Error resolving role:', e);
        setRole('staff');
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [user]);

  return {
    role,
    loading,
    isSuperadmin: role === 'superadmin',
    isAdmin: role === 'admin' || role === 'superadmin',
    isStaff: role === 'staff',
  };
};
