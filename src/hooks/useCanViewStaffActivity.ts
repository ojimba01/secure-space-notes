import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';
import { usePreview } from '@/components/ViewAsProvider';
import { cachedRole, rememberRole } from '@/lib/roleCache';

/**
 * Whether this person can open Staff activity: superadmins, and anyone given
 * access to it alone (docs/staff-activity-access.sql). Access to it is kept
 * apart from the superadmin role, which also hides an account from staff
 * lists and case assignment — wrong for a supervisor who carries a caseload.
 */
export const useCanViewStaffActivity = () => {
  const { user } = useAuth();
  const [canView, setCanView] = useState(() => cachedRole(user?.id, 'staffActivity') ?? false);
  const [loading, setLoading] = useState(() => cachedRole(user?.id, 'staffActivity') === undefined);

  useEffect(() => {
    if (!user) {
      setCanView(false);
      setLoading(false);
      return;
    }
    const known = cachedRole(user.id, 'staffActivity');
    if (known !== undefined) {
      setCanView(known);
      setLoading(false);
    }
    let cancelled = false;
    // Newer than the generated types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void (supabase.rpc as any)('can_view_staff_activity', { _user_id: user.id }).then(
      ({ data }: { data: boolean | null }) => {
        if (cancelled) return;
        rememberRole(user.id, 'staffActivity', data === true);
        setCanView(data === true);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  // A preview shows the previewed person's access.
  const { previewing, access } = usePreview();
  if (previewing) return { canView: !!access?.canViewStaffActivity, loading: !access };
  return { canView, loading };
};
