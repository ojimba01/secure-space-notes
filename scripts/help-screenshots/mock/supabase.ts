// Stands in for '@/integrations/supabase/client' while the Help guide
// screenshots are taken: the real app, signed in as a made-up person, over
// made-up data (./seed.ts). Nothing here talks to the real database.
//
// Sign in as the case manager with ?as=staff (remembered for the tab), or as
// the administrator by default. ?signedout shows the sign-in page.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeFrom, type Tables } from './query';
import { ADMIN, STAFF, seed } from './seed';

const params = new URLSearchParams(window.location.search);
if (params.get('as')) sessionStorage.setItem('helpShotsAs', params.get('as')!);
if (params.has('signedout')) sessionStorage.setItem('helpShotsSignedOut', '1');
const who = sessionStorage.getItem('helpShotsAs') === 'staff' ? STAFF : ADMIN;
const signedOut = sessionStorage.getItem('helpShotsSignedOut') === '1';

const db: Tables = seed();
// ?reminders=0 leaves out the touchpoint reminders that pop up on Clients,
// for the rest of the tab.
if (params.get('reminders') === '0') sessionStorage.setItem('helpShotsNoReminders', '1');
if (sessionStorage.getItem('helpShotsNoReminders') === '1') db.touchpoint_reminders = [];
(window as any).__helpDb = db;
const log = (m: string) => console.debug('[mock]', m);

const user = { id: who.user, email: who === STAFF ? 'taylor.brooks@example.org' : 'jordan.price@example.org', user_metadata: {}, app_metadata: {}, aud: 'authenticated', created_at: '' };
const session = signedOut ? null : { user, access_token: 'mock', refresh_token: 'mock', expires_in: 3600, token_type: 'bearer' };

const blankPdf = () =>
  new Blob(
    ['%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF'],
    { type: 'application/pdf' },
  );

/** A handwritten-looking signature, so saved signatures have something to show. */
const signaturePng = (path: string) => {
  const text = path.endsWith('sig-2.png') ? 'TB' : 'Taylor Brooks';
  const font = 'italic 600 64px "Brush Script MT", "Segoe Script", cursive';
  const c = document.createElement('canvas');
  const m = c.getContext('2d')!;
  m.font = font;
  // Cropped close to the ink, as a saved signature is.
  c.width = Math.ceil(m.measureText(text).width) + 8;
  c.height = 76;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1e3a8a';
  g.font = font;
  g.textBaseline = 'middle';
  g.fillText(text, 4, 40);
  return c.toDataURL('image/png');
};
const dataUrlBlob = (url: string) => {
  const bin = atob(url.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
};

const rpcs: Record<string, (args: any) => any> = {
  can_view_staff_activity: () => who === ADMIN,
  staff_activity_people: () => db.profiles.filter((p) => p.id !== ADMIN.profile && p.active !== false),
  staff_activity_client_names: ({ _ids }: any) => db.clients.filter((c) => _ids.includes(c.id)).map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` })),
  staff_activity_changes: () => [],
  start_staff_activity: () => null,
};

export const supabase: any = {
  from: makeFrom(db, log),
  rpc: (name: string, args: any) => Promise.resolve({ data: rpcs[name] ? rpcs[name](args) : null, error: null }),
  auth: {
    getSession: () => Promise.resolve({ data: { session }, error: null }),
    getUser: () => Promise.resolve({ data: { user: session ? user : null }, error: null }),
    onAuthStateChange: (cb: any) => {
      setTimeout(() => cb(session ? 'SIGNED_IN' : 'SIGNED_OUT', session), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    signInWithPassword: () => Promise.resolve({ data: { session }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    signUp: () => Promise.resolve({ data: {}, error: null }),
    resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
    updateUser: () => Promise.resolve({ data: {}, error: null }),
  },
  storage: {
    from: (bucket: string) => ({
      download: (path: string) =>
        Promise.resolve({ data: bucket === 'signatures' ? dataUrlBlob(signaturePng(path)) : blankPdf(), error: null }),
      upload: () => Promise.resolve({ data: { path: 'x' }, error: null }),
      createSignedUrl: (path: string) =>
        Promise.resolve({ data: { signedUrl: bucket === 'signatures' ? signaturePng(path) : 'about:blank' }, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: 'about:blank' } }),
      list: () => Promise.resolve({ data: [], error: null }),
      remove: () => Promise.resolve({ data: [], error: null }),
    }),
  },
  functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  channel: () => {
    const ch: any = { on: () => ch, subscribe: () => ch, unsubscribe: () => {} };
    return ch;
  },
  removeChannel: () => {},
};
