import { supabase } from '@/integrations/supabase/client';
import { usePreview } from '@/components/ViewAsProvider';
import { useCachedRole } from '@/hooks/useCachedRole';

const check = async (userId: string) => {
  // Newer than the generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('can_view_staff_activity', { _user_id: userId });
  if (error) throw error;
  return data === true;
};

/**
 * Whether this person can open Staff activity: superadmins, and anyone given
 * access to it alone (docs/staff-activity-access.sql). Access to it is kept
 * apart from the superadmin role, which also hides an account from staff
 * lists and case assignment — wrong for a supervisor who carries a caseload.
 */
export const useCanViewStaffActivity = () => {
  const { value, loading } = useCachedRole('staffActivity', check);
  // A preview shows the previewed person's access.
  const { previewing, access } = usePreview();
  if (previewing) return { canView: !!access?.canViewStaffActivity, loading: !access };
  return { canView: value, loading };
};
