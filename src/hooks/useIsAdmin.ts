import { supabase } from '@/integrations/supabase/client';
import { usePreview } from '@/components/ViewAsProvider';
import { useCachedRole } from '@/hooks/useCachedRole';

/** Admins and superadmins. */
const check = async (userId: string) => {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).in('role', ['admin', 'superadmin']);
  if (error) throw error;
  return !!data && data.length > 0;
};

export const useIsAdmin = () => {
  const { value, loading } = useCachedRole('admin', check);
  // A preview shows the app with the previewed person's access.
  const { previewing, access } = usePreview();
  if (previewing) return { isAdmin: !!access?.isAdmin, loading: !access };
  return { isAdmin: value, loading };
};
