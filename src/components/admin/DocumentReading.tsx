// What the background reader has and has not managed to read.
//
// Two jobs on one screen, because they are the same question asked twice:
// which documents does the app still not understand?
//
//   * Documents still to read — the queue, with a button to work through it.
//   * Documents that are only pictures — read, but there was nothing in the
//     file to read. Optical recognition is offered here, one at a time,
//     because it takes over a minute a page.
//   * Documents needing a person — anything that could not be read at all, and
//     anything filed as Unsorted because no rule could name it.
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { FileSearch, RotateCcw, AlertTriangle, ScanLine } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { runDocumentQueue, readWithOcr, type QueueProgress } from '@/lib/documentQueue';
import { SCAN_THRESHOLD_CHARS } from '@/lib/documentText';

interface Counts {
  pending: number;
  processing: number;
  done: number;
  failed: number;
  skipped: number;
  unsorted: number;
  withText: number;
  ocrRead: number;
  scans: number;
  nameMismatch: number;
}

interface ProblemRow {
  id: string;
  title: string;
  form_type: string;
  source_filename: string | null;
  processing_status: string | null;
  processing_error: string | null;
  name_matches_client?: boolean | null;
  field_member_name?: string | null;
  clients?: { first_name: string; last_name: string } | null;
}

const ZERO: Counts = {
  pending: 0, processing: 0, done: 0, failed: 0,
  skipped: 0, unsorted: 0, withText: 0, ocrRead: 0, scans: 0, nameMismatch: 0,
};

const Stat: React.FC<{ label: string; value: number; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-lg border p-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="text-2xl font-bold mt-1">{value.toLocaleString()}</div>
    {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
  </div>
);

export const DocumentReading: React.FC = () => {
  const { toast } = useToast();
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState<QueueProgress | null>(null);
  const [scanRows, setScanRows] = useState<ProblemRow[]>([]);
  /** The one document currently being read by optical recognition, if any. */
  const [ocrId, setOcrId] = useState<string | null>(null);

  const countWhere = useCallback(async (build: (q: any) => any) => {
    const { count } = await build(
      supabase.from('client_forms').select('id', { count: 'exact', head: true }),
    );
    return count ?? 0;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pending, processing, done, failed, skipped, unsorted, withText, ocrRead, scans, nameMismatch] =
        await Promise.all([
          countWhere((q) => q.eq('processing_status', 'pending')),
          countWhere((q) => q.eq('processing_status', 'processing')),
          countWhere((q) => q.eq('processing_status', 'done')),
          countWhere((q) => q.eq('processing_status', 'failed')),
          countWhere((q) => q.eq('processing_status', 'skipped')),
          countWhere((q) => q.eq('form_type', 'Unsorted')),
          countWhere((q) => q.gte('text_char_count', SCAN_THRESHOLD_CHARS)),
          countWhere((q) => q.eq('ocr_applied', true)),
          // Read, but nothing was there to read: the file is a picture.
          countWhere((q) =>
            q.eq('processing_status', 'done').lt('text_char_count', SCAN_THRESHOLD_CHARS),
          ),
          countWhere((q) => q.eq('name_matches_client', false)),
        ]);
      setCounts({ pending, processing, done, failed, skipped, unsorted, withText, ocrRead, scans, nameMismatch });

      const { data } = await supabase
        .from('client_forms')
        .select(
          'id, title, form_type, source_filename, processing_status, processing_error, name_matches_client, field_member_name, clients:client_id (first_name, last_name)',
        )
        .or('processing_status.eq.failed,form_type.eq.Unsorted,name_matches_client.is.false')
        .order('created_at', { ascending: false })
        .limit(50);
      setProblems((data as unknown as ProblemRow[]) ?? []);

      const { data: scanData } = await supabase
        .from('client_forms')
        .select(
          'id, title, form_type, source_filename, processing_status, processing_error, page_count, clients:client_id (first_name, last_name)',
        )
        .eq('processing_status', 'done')
        .lt('text_char_count', SCAN_THRESHOLD_CHARS)
        .order('created_at', { ascending: false })
        .limit(25);
      setScanRows((scanData as unknown as ProblemRow[]) ?? []);
    } finally {
      setLoading(false);
    }
  }, [countWhere]);

  useEffect(() => {
    load();
  }, [load]);

  const read = async () => {
    setReading(true);
    setProgress({ done: 0, failed: 0, remaining: counts.pending });
    try {
      const final = await runDocumentQueue(setProgress);
      toast({
        title: `${final.done} document${final.done === 1 ? '' : 's'} read`,
        description: final.remaining > 0
          ? `${final.remaining.toLocaleString()} still to read. Press again to continue.`
          : 'Nothing is left to read.',
      });
    } finally {
      setReading(false);
      await load();
    }
  };

  /**
   * Read one picture-only document with optical recognition.
   *
   * Deliberately one at a time and never in a loop: a single full page
   * measured at over a minute, so a batch would mean a browser left open for
   * hours. The person pressing this has decided this document is worth it.
   */
  const ocrOne = async (row: ProblemRow) => {
    setOcrId(row.id);
    try {
      const result = await readWithOcr(row.id);
      toast({
        title: result.ok
          ? result.chars > 0
            ? `Read ${result.chars.toLocaleString()} characters`
            : 'Nothing could be read from this document'
          : 'The document could not be read',
        description: result.ok
          ? result.chars > 0
            ? `${row.title} is now searchable.`
            : 'The picture is not clear enough to read. It keeps its file and stays on this list.'
          : result.error,
        variant: result.ok ? undefined : 'destructive',
      });
    } finally {
      setOcrId(null);
      await load();
    }
  };

  /** Put a failed document back in the queue so it is tried again. */
  const retry = async (id: string) => {
    await supabase
      .from('client_forms')
      .update({ processing_status: 'pending', processing_error: null, processing_started_at: null })
      .eq('id', id);
    await load();
  };

  const retryAllFailed = async () => {
    await supabase
      .from('client_forms')
      .update({ processing_status: 'pending', processing_error: null, processing_started_at: null })
      .eq('processing_status', 'failed');
    toast({ title: 'Queued to be read again' });
    await load();
  };

  const total = counts.pending + counts.processing + counts.done + counts.failed + counts.skipped;
  const read_ = counts.done + counts.skipped;
  const percent = total > 0 ? Math.round((read_ / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5" /> Reading stored documents
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            A document is searchable once its words have been read. Most PDFs carry their text
            already, and those are read in a moment — a six-page form takes well under a second.
            A document that is only a picture has to be read by optical recognition, which takes
            over a minute a page, so it is offered one document at a time below rather than run
            over a batch. All of this happens in this browser: no document is sent anywhere to be
            read, and the reading only runs while this page is open.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Still to read" value={counts.pending} />
            <Stat label="Searchable" value={counts.withText} hint="Words read from the file" />
            <Stat label="Pictures only" value={counts.scans} hint="No text in the file" />
            <Stat
              label="Could not be read"
              value={counts.failed}
              hint={counts.nameMismatch > 0 ? `${counts.nameMismatch} filed under the wrong name` : undefined}
            />
          </div>

          {total > 0 && (
            <div className="space-y-1">
              <Progress value={percent} />
              <p className="text-xs text-muted-foreground">
                {read_.toLocaleString()} of {total.toLocaleString()} documents read.
              </p>
            </div>
          )}

          {reading && progress && (
            <p className="text-sm">
              Reading. {progress.done} done, {progress.remaining.toLocaleString()} to go.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={read} disabled={reading || counts.pending === 0}>
              {reading ? 'Reading documents' : 'Read the documents waiting'}
            </Button>
            {counts.failed > 0 && (
              <Button variant="outline" onClick={retryAllFailed} disabled={reading}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Try the {counts.failed} that failed again
              </Button>
            )}
            <Button variant="ghost" onClick={load} disabled={loading || reading}>
              Refresh
            </Button>
          </div>

          {counts.pending > 25 && (
            <p className="text-xs text-muted-foreground">
              Documents are read 25 at a time so the page stays usable. Press the button again to
              carry on; the count is kept in the database, so closing the browser loses nothing.
            </p>
          )}
        </CardContent>
      </Card>

      {scanRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5" /> Documents that are only pictures
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These were read and held no text, so they are photographs or scans rather than
              documents the computer can read. Optical recognition can read the picture, taking
              over a minute a page and holding this page while it works. Most of these came from
              the agency's archive, where the same recognition has already been tried and could
              not read them, so expect a poor result on those.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {scanRows.map((r) => (
              <div key={r.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{r.title}</span>
                    <Badge variant="secondary">{r.form_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {r.clients ? `${r.clients.first_name} ${r.clients.last_name}` : 'No client'}
                    {r.source_filename ? ` \u00b7 ${r.source_filename}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocrId !== null}
                  onClick={() => ocrOne(r)}
                >
                  {ocrId === r.id ? 'Reading the picture' : 'Read the picture'}
                </Button>
              </div>
            ))}
            {counts.scans > scanRows.length && (
              <p className="text-xs text-muted-foreground">
                {scanRows.length} of {counts.scans.toLocaleString()} shown.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Documents needing a person
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Documents the app could not read, documents filed as Unsorted because no rule could
            name them, and documents whose printed name is not the client they are filed under.
            Nothing here is guessed at — an unnamed document keeps its file and waits, and a
            document on the wrong client is never allowed to write to that client's record.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading.</p>
          ) : problems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every stored document has been read and named.
            </p>
          ) : (
            <div className="space-y-2">
              {problems.map((p) => (
                <div key={p.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{p.title}</span>
                      {p.form_type === 'Unsorted' && <Badge variant="secondary">Unsorted</Badge>}
                      {p.processing_status === 'failed' && (
                        <Badge variant="destructive">Could not be read</Badge>
                      )}
                      {p.name_matches_client === false && (
                        <Badge variant="destructive">Name does not match</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : 'No client'}
                      {p.source_filename ? ` · ${p.source_filename}` : ''}
                    </p>
                    {p.processing_error && (
                      <p className="text-xs text-destructive">{p.processing_error}</p>
                    )}
                    {p.name_matches_client === false && p.field_member_name && (
                      <p className="text-xs text-destructive">
                        The document is printed for {p.field_member_name}. Nothing from it was
                        written to this client.
                      </p>
                    )}
                  </div>
                  {p.processing_status === 'failed' && (
                    <Button size="sm" variant="outline" onClick={() => retry(p.id)}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Try again
                    </Button>
                  )}
                </div>
              ))}
              {problems.length === 50 && (
                <p className="text-xs text-muted-foreground">
                  The 50 most recent are shown. Work through these and the rest will follow.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
