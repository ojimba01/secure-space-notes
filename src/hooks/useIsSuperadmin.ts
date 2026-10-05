import { supabase } from '@/integrations/supabase/client';
import { usePreview } from '@/components/ViewAsProvider';
import { useCachedRole } from '@/hooks/useCachedRole';

const check = async (userId: string) => {
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'superadmin');
  if (error) throw error;
  return !!data && data.length > 0;
};

export const useIsSuperadmin = () => {
  const { value, loading } = useCachedRole('superadmin', check);
  // Superadmins are never previewed, so nothing superadmin-only shows in one.
  const { previewing } = usePreview();
  return { isSuperadmin: value && !previewing, loading };
};
