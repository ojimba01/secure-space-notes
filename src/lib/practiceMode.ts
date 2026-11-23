// Practice: pressing buttons without changing anything.
//
// Two things turn it on:
//   - a walkthrough is running (src/components/help/Walkthrough.tsx). It has
//     the person press the real controls, so without this a "Show me" would
//     start real intakes and save real forms;
//   - the owner's practice switch (PracticeBar), so the owner's account can
//     try anything without affecting staff work.
//
// While it is on, every write the app makes through the database client is
// stopped where it is made: inserts, updates, upserts and deletes, file
// uploads and removals, and the database functions that change data. Each
// answers with an error saying nothing was saved, which the screens already
// show. Reads are untouched. A few writes about the person themselves still go
// through, so announcements, the tour and Support keep working.
import { supabase } from '@/integrations/supabase/client';

const reasons = new Set<'walkthrough' | 'switch'>();
const listeners = new Set<() => void>();

export const PRACTICE_MESSAGE = 'Practice mode: nothing was saved.';

/** Tables written while practicing: about the person, not the agency's work. */
const ALWAYS_ALLOWED = new Set([
  'feature_views',
  'user_tutorial_progress',
  'user_onboarding',
  'support_tickets',
  'support_ticket_messages',
]);
/** Database functions that only read. */
const READ_ONLY_FUNCTIONS = new Set([
  'filed_claim_phase',
  'can_view_staff_activity',
  'staff_activity_changes',
  'staff_activity_client_names',
  'staff_activity_people',
  // The person's own activity, like the tour: not the agency's work.
  'start_staff_activity',
  'touch_staff_activity',
]);
const WRITES = new Set(['insert', 'update', 'upsert', 'delete']);
const STORAGE_WRITES = new Set(['upload', 'update', 'remove', 'move', 'copy']);

export function isPracticing(): boolean {
  return reasons.size > 0;
}

export function practiceReasons(): ReadonlySet<'walkthrough' | 'switch'> {
  return reasons;
}

export function setPractice(reason: 'walkthrough' | 'switch', on: boolean): void {
  const before = reasons.size > 0;
  if (on) reasons.add(reason);
  else reasons.delete(reason);
  if (before !== reasons.size > 0 || on) listeners.forEach((l) => l());
}

export function onPracticeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const blockedResult = () => ({ data: null, error: { message: PRACTICE_MESSAGE, code: 'practice' }, count: null, status: 403, statusText: 'Practice' });

/** A query that saves nothing: any method keeps the chain going; awaiting it gives the error. */
function blockedQuery(): unknown {
  const result = Promise.resolve(blockedResult());
  const proxy: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then') return result.then.bind(result);
      if (prop === 'catch') return result.catch.bind(result);
      if (prop === 'finally') return result.finally.bind(result);
      return () => proxy;
    },
    apply() {
      return proxy;
    },
  });
  return proxy;
}

let installed = false;

/** Put the check in front of the database client. Called once, at start. */
export function installPracticeGuard(): void {
  if (installed) return;
  installed = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;

  const from = client.from.bind(client);
  client.from = (table: string) => {
    const builder = from(table);
    if (ALWAYS_ALLOWED.has(table)) return builder;
    return new Proxy(builder, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof prop === 'string' && WRITES.has(prop) && typeof value === 'function') {
          return (...args: unknown[]) => (isPracticing() ? blockedQuery() : value.apply(target, args));
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };

  const rpc = client.rpc.bind(client);
  client.rpc = (fn: string, ...args: unknown[]) =>
    isPracticing() && !READ_ONLY_FUNCTIONS.has(fn) ? blockedQuery() : rpc(fn, ...args);

  const storageFrom = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => {
    const api = storageFrom(bucket);
    if (bucket === 'support-attachments') return api;
    return new Proxy(api, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof prop === 'string' && STORAGE_WRITES.has(prop) && typeof value === 'function') {
          return (...args: unknown[]) => (isPracticing() ? Promise.resolve(blockedResult()) : value.apply(target, args));
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  };
}
