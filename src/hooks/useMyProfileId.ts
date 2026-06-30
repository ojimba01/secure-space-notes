import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { supabase } from '@/integrations/supabase/client';

export function useMyProfileId() {
  const { user } = useAuth();
  const [profileId, setProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setProfileId(null);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (active) setProfileId(data?.id ?? null);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  return profileId;
}
