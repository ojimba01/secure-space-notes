// The document reader, run on a schedule rather than in somebody's browser.
//
// The app has always read uploaded documents in the browser, which means a
// document is only read while someone has the app open — a backlog of 1,665
// sat waiting on whoever happened to leave a tab up. This works the same queue
// from the server: pg_cron calls it every few seconds (docs/document-reader-cron.sql),
// and each call reads a handful of documents and stops, well inside an edge
// function's time limit. A browser that is open reads alongside it; the claim
// on each row keeps the two from reading the same document twice.
//
// The documents do not leave the project to be read. They are downloaded from
// this project's own storage by this project's own function, which is the same
// boundary they are stored inside — not the third-party reading docs/ocr.md
// rules out. OCR is still never run here: it is minutes a page, and scans stay
// the person-by-person job they were.
//
// The rules for what a document says are the app's own, shared through
// ../_shared, so the server and the browser cannot read the same document two
// ways. Only the PDF opening differs: unpdf here, pdf.js in the browser.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  claimNext,
  pendingCount,
  processOne,
  reclaimStale,
} from '../_shared/documentReading.ts';
import { readOnServer } from './reader.ts';

/**
 * Documents per call, kept small on purpose.
 *
 * An edge function gets about two seconds of CPU per call, and parsing a PDF is
 * CPU. A few documents fit comfortably; the schedule makes up the rest by
 * calling often (docs/document-reader-cron.sql). A call cut off anyway leaves
 * its document to be reclaimed and tried once more — see reclaimStale.
 */
const PER_CALL = 3;

/** Stop starting new documents after this long, so a slow file cannot run a call out. */
const BUDGET_MS = 20_000;

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const started = Date.now();
  let done = 0;
  let failed = 0;

  // Nothing waiting is the usual minute. Say so without touching anything.
  if ((await pendingCount(db)) === 0) {
    await reclaimStale(db);
    return Response.json({ done, failed, remaining: await pendingCount(db) });
  }

  await reclaimStale(db);
  while (done + failed < PER_CALL && Date.now() - started < BUDGET_MS) {
    const row = await claimNext(db);
    if (!row) break;
    const outcome = await processOne(db, row, readOnServer);
    if (outcome === 'done') done++;
    else failed++;
  }

  // Counts only. Whoever can reach this learns how far the queue has got and
  // nothing about any document in it.
  return Response.json({ done, failed, remaining: await pendingCount(db) });
});
