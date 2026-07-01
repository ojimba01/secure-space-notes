import { useMyProfileId } from '@/hooks/useMyProfileId';
import { useViewAs } from '@/components/ViewAsProvider';

/**
 * The profile id whose data employee-facing screens should load.
 * When a superadmin is in a "view as employee" session this is the
 * selected employee's profile id; otherwise it's the logged-in user's.
 */
export function useEffectiveProfileId(): string | null {
  const myProfileId = useMyProfileId();
  const { viewAsEmployeeId } = useViewAs();
  return viewAsEmployeeId ?? myProfileId;
}
