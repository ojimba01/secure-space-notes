// Remembers what this person can see (admin, superadmin, Staff activity) so the
// left menu is drawn whole on every page instead of re-asking the database and
// popping items in a moment later. Each check still refreshes in the background.
//
// Held in memory for page changes, and in sessionStorage so a reload of the same
// tab draws the menu at once too. Only true/false per role is kept; it is
// cleared with the tab and keyed by user, so another sign-in starts fresh.

export type RoleKey = 'admin' | 'superadmin' | 'staffActivity';

const mem = new Map<string, boolean>();
const key = (userId: string, role: RoleKey) => `role:${userId}:${role}`;

export function cachedRole(userId: string | undefined, role: RoleKey): boolean | undefined {
  if (!userId) return undefined;
  const k = key(userId, role);
  if (mem.has(k)) return mem.get(k);
  try {
    const v = sessionStorage.getItem(k);
    if (v === 'true' || v === 'false') {
      mem.set(k, v === 'true');
      return v === 'true';
    }
  } catch {
    // Storage blocked: memory alone still covers page changes.
  }
  return undefined;
}

export function rememberRole(userId: string, role: RoleKey, value: boolean): void {
  const k = key(userId, role);
  mem.set(k, value);
  try {
    sessionStorage.setItem(k, String(value));
  } catch {
    // Storage blocked: memory alone still covers page changes.
  }
}
