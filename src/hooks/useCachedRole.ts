import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { cachedRole, rememberRole, type RoleKey } from '@/lib/roleCache';

/**
 * One yes/no access check for the signed-in person, remembered between pages
 * (lib/roleCache) so the menu is drawn whole at once; it still refreshes in the
 * background. Stays loading until auth has hydrated, otherwise a direct page
 * load would answer "no" before the session is known.
 */
export function useCachedRole(role: RoleKey, check: (userId: string) => Promise<boolean>) {
  const { user, loading: authLoading } = useAuth();
  const [value, setValue] = useState(() => cachedRole(user?.id, role) ?? false);
  const [loading, setLoading] = useState(() => cachedRole(user?.id, role) === undefined);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setValue(false);
      setLoading(false);
      return;
    }
    const known = cachedRole(user.id, role);
    if (known !== undefined) {
      setValue(known);
      setLoading(false);
    }
    let cancelled = false;
    check(user.id)
      .then((v) => {
        if (cancelled) return;
        rememberRole(user.id, role, v);
        setValue(v);
      })
      .catch((error) => {
        console.error(`Error checking ${role} access:`, error);
        if (!cancelled) setValue(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `check` is a fixed query per hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, role]);

  return { value, loading };
}
