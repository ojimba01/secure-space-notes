import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/components/AuthProvider';
import {
  pageFor,
  startActivity,
  type ActivityHandle,
  type TaskOutcome,
} from '@/lib/staffActivity';

/**
 * Records the page a signed-in person has open, one visit at a time. Mounted
 * once, inside the router.
 */
export function usePageActivity(): void {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const page = user ? pageFor(pathname, search) : null;
  // The same page reached again (a filter changed, a tab switched) is the same
  // visit; only a different page or client starts a new one.
  const key = page ? `${page.area}:${page.clientId ?? ''}` : null;

  useEffect(() => {
    if (!page) return;
    const handle = startActivity('page', page.area, page.label, page.clientId);
    return () => handle.end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user?.id]);
}

/**
 * Records a task while `active` is true — a form being filled out, a document
 * being uploaded. Call the returned function with how it ended; closing
 * without calling it records the task as closed without saving.
 */
export function useTaskActivity(
  active: boolean,
  area: string,
  label: string,
  clientId?: string | null,
): (outcome: TaskOutcome) => void {
  const handle = useRef<ActivityHandle | null>(null);

  useEffect(() => {
    if (!active) return;
    handle.current = startActivity('task', area, label, clientId);
    return () => {
      handle.current?.end('closed');
      handle.current = null;
    };
    // The label and client are read when the task opens; picking a client
    // part-way through does not start a second task.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return useCallback((outcome: TaskOutcome) => {
    handle.current?.end(outcome);
    handle.current = null;
  }, []);
}
