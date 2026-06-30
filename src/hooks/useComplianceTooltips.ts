import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

let cache: Record<string, string> | null = null;

export function useComplianceTooltips() {
  const [tooltips, setTooltips] = useState<Record<string, string>>(cache ?? {});

  useEffect(() => {
    if (cache) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('compliance_settings')
        .select('value')
        .eq('key', 'tooltips')
        .maybeSingle();
      if (active && data?.value) {
        cache = data.value as Record<string, string>;
        setTooltips(cache);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return tooltips;
}
