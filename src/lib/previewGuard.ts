// Nothing is saved while a superadmin previews the app as a team member.
//
// A preview shows the app with that person's access: an admin's preview has
// Billing, the Admin dashboard and Team touchpoints, all of which can change
// data. Rather than trust every button on every screen to remember the
// preview, the Supabase client itself refuses to write while one runs:
// inserts, updates, upserts and deletes, uploads and removals, edge functions,
// and database functions other than the read-only ones below. Reads are
// untouched. Each refusal answers with an error, so screens report that
// nothing was saved, and a notice says why.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

let previewName: string | null = null;
let lastNotice = 0;

/** Database functions that only read, and so still run during a preview. */
const READ_ONLY_RPCS = new Set([
  'can_view_staff_activity',
  'staff_activity_changes',
  'staff_activity_client_names',
  'staff_activity_people',
]);
const readOnlyRpc = (fn: string) => READ_ONLY_RPCS.has(fn) || /^(get|is|has|can)_/.test(fn);

const MESSAGE = 'Changes are not saved during a preview.';

function notSaved() {
  if (Date.now() - lastNotice > 3000) {
    lastNotice = Date.now();
    toast(`Previewing as ${previewName}. ${MESSAGE}`);
  }
}

/** Shaped like a Supabase error, and an Error, so every screen can show its message. */
const previewError = () => Object.assign(new Error(MESSAGE), { code: 'preview', details: '', hint: '' });

/** A query that goes nowhere: every method chains, and awaiting it gives an error. */
function refused(): any {
  const result = Promise.resolve({
    data: null,
    error: previewError(),
    count: null,
    status: 403,
    statusText: 'Preview',
  });
  const chain: any = new Proxy(() => chain, {
    get(_target, prop) {
      if (prop === 'then') return result.then.bind(result);
      if (prop === 'catch') return result.catch.bind(result);
      if (prop === 'finally') return result.finally.bind(result);
      return () => chain;
    },
  });
  return chain;
}

let installed = false;

function install() {
  if (installed) return;
  installed = true;
  const client = supabase as any;

  const from = client.from.bind(client);
  client.from = (relation: string) => {
    const query = from(relation);
    if (!previewName) return query;
    for (const method of ['insert', 'update', 'upsert', 'delete']) {
      query[method] = () => {
        notSaved();
        return refused();
      };
    }
    return query;
  };

  const rpc = client.rpc.bind(client);
  client.rpc = (fn: string, args?: unknown, options?: unknown) => {
    if (previewName && !readOnlyRpc(fn)) {
      notSaved();
      return refused();
    }
    return rpc(fn, args, options);
  };

  const storageFrom = client.storage.from.bind(client.storage);
  client.storage.from = (bucket: string) => {
    const api = storageFrom(bucket);
    if (!previewName) return api;
    for (const method of ['upload', 'update', 'remove', 'move', 'copy']) {
      api[method] = async () => {
        notSaved();
        return { data: null, error: previewError() };
      };
    }
    return api;
  };

  const functionsGetter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'functions')?.get;
  if (functionsGetter) {
    Object.defineProperty(client, 'functions', {
      configurable: true,
      get() {
        const functions = functionsGetter.call(client);
        if (previewName) {
          functions.invoke = async () => {
            notSaved();
            return { data: null, error: previewError() };
          };
        }
        return functions;
      },
    });
  }
}

/** Start refusing writes for a preview of `name`, or stop with null. */
export function setPreviewGuard(name: string | null) {
  install();
  previewName = name;
}
