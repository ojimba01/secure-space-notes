// Picking up a newly published version of the app.
//
// Every build writes /version.json with its id (vite.config.ts). The app checks
// it every two minutes and whenever the tab comes back into view. When a newer
// build is out, the page reloads at the same address, so the person lands back
// on the screen they were on, scrolled to the same place. If they are in the
// middle of something (a form, a touchpoint or an upload is open, a dialog is
// open, or they are typing), they are asked to save first, and the page
// reloads once they have.
import { hasOpenTask, onTasksChange } from '@/lib/staffActivity';

const CHECK_MS = 120_000;
const SCROLL_KEY = 'app-update-scroll';
/** The build this tab last reloaded for, so a stale cache can never cause a reload loop. */
const RELOADED_KEY = 'app-update-reloaded-for';
/** Typing in the last this-many seconds counts as being in the middle of something. */
const TYPING_MS = 60_000;

let lastTyped = 0;
let waiting = false;
let target: string | null = null;
const waitingListeners = new Set<(waiting: boolean) => void>();

/** Other screens with unsaved work they track themselves (the note builder). */
const unsaved = new Set<string>();

/** Mark a screen as having unsaved work, or clear it. */
export function setUnsavedWork(key: string, value: boolean): void {
  if (value) unsaved.add(key);
  else unsaved.delete(key);
  if (!value) tryReload();
}

/** Whether reloading now would lose something the person is working on. */
export function isBusy(): boolean {
  if (hasOpenTask() || unsaved.size > 0) return true;
  if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return true;
  return Date.now() - lastTyped < TYPING_MS;
}

function reload() {
  try {
    if (target) sessionStorage.setItem(RELOADED_KEY, target);
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: location.pathname + location.search, y: window.scrollY }));
  } catch {
    // Scroll position is a convenience only.
  }
  location.reload();
}

function tryReload() {
  if (waiting && !isBusy()) reload();
}

function setWaiting(value: boolean) {
  waiting = value;
  for (const listener of waitingListeners) listener(value);
}

/** Called when the page should ask the person to save before it can update. */
export function onWaitingChange(listener: (waiting: boolean) => void): () => void {
  waitingListeners.add(listener);
  listener(waiting);
  return () => waitingListeners.delete(listener);
}

/** Reload now, for the Refresh button. */
export function reloadNow(): void {
  reload();
}

async function latestBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    return body.id ?? null;
  } catch {
    return null;
  }
}

async function check() {
  if (waiting) return tryReload();
  const latest = await latestBuild();
  if (!latest || latest === __BUILD_ID__) return;
  try {
    if (sessionStorage.getItem(RELOADED_KEY) === latest) return;
  } catch {
    // Without session storage, reload as normal.
  }
  target = latest;
  if (isBusy()) setWaiting(true);
  else reload();
}

let started = false;

/** Start watching for new versions. Safe to call more than once. */
export function startUpdateChecks(): void {
  if (started || import.meta.env.DEV || typeof window === 'undefined') return;
  started = true;

  // Back to where the person was before the reload.
  try {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    sessionStorage.removeItem(SCROLL_KEY);
    const { path, y } = saved ? (JSON.parse(saved) as { path: string; y: number }) : { path: '', y: 0 };
    if (path === location.pathname + location.search && y > 0) {
      // Wait for the page's data to load before scrolling.
      window.setTimeout(() => window.scrollTo(0, y), 1500);
    }
  } catch {
    // Scroll position is a convenience only.
  }

  document.addEventListener(
    'input',
    (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) lastTyped = Date.now();
    },
    { capture: true },
  );
  onTasksChange(tryReload);
  // A dialog closing or typing stopping: try again shortly.
  window.setInterval(tryReload, 5_000);
  window.setInterval(check, CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  void check();
}
