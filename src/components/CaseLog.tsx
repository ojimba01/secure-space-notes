// One case manager's week, as the HMIS Case Log asks for it.
//
// The rows come from touchpoints already logged in the app, so the form opens
// filled in. A case manager checks it rather than writes it — which is the
// only reason a weekly paper form is worth having in software at all.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import '@/lib/pdfWorker';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Eye, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  caseLogEntries,
  loadCaseLog,
  resetCaseLog,
  saveCaseLog,
  weekEndingText,
  weekLabel,
  weeksAvailable,
  type CaseLogRow,
} from '@/lib/caseLog';
import {
  CASE_LOG_TEMPLATE,
  buildCaseLogPdf,
  caseLogFileName,
  pagesNeeded,
  ROWS_PER_PAGE,
  type CaseLogEntry,
} from '@/lib/caseLogForm';

interface Props {
  employeeId: string;
  caseManagerName: string;
  /** An admin reads someone else's log; only its author edits it. */
  readOnly?: boolean;
  /** Open on this week (its Sunday) rather than the current one, for a look-up. */
  initialWeek?: string;
  /**
   * Show the filled form as soon as the rows are in, rather than waiting for
   * View form to be pressed. The Forms page's View form button opens the log
   * this way, so it lands on the same form Touchpoints shows.
   */
  openFormOnLoad?: boolean;
  /** Told whether there are rows on screen that have not been saved. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Told after a save, so a summary elsewhere can refresh. */
  onSaved?: () => void;
}

const blank = (): CaseLogEntry => ({ clientName: '', date: '', completed: false });

export const CaseLog: React.FC<Props> = ({
  employeeId,
  caseManagerName,
  readOnly = false,
  initialWeek,
  openFormOnLoad = false,
  onDirtyChange,
  onSaved,
}) => {
  const weeks = useMemo(() => weeksAvailable(), []);
  const [week, setWeek] = useState(initialWeek ?? weeks[0]);
  const [stored, setStored] = useState<CaseLogRow | null>(null);
  const [entries, setEntries] = useState<CaseLogEntry[]>([]);
  /** The rows as last loaded or saved, to tell an unsaved edit from none. */
  const [loadedEntries, setLoadedEntries] = useState<CaseLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState(0);
  const [scale, setScale] = useState(1);
  const { toast } = useToast();

  // A Blob URL leaks until it is revoked, and a week switch builds a new one.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const editable = !readOnly;

  const dirty = useMemo(
    () => JSON.stringify(entries) !== JSON.stringify(loadedEntries),
    [entries, loadedEntries],
  );
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await loadCaseLog(employeeId, week);
      setStored(row);
      const rows = await caseLogEntries(employeeId, week, row);
      setEntries(rows);
      setLoadedEntries(rows);
    } catch (e) {
      toast({
        title: 'Could not open the log',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [employeeId, week, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const edit = (i: number, patch: Partial<CaseLogEntry>) =>
    setEntries((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  /** Save these rows, or with null, drop the edits and refill from touchpoints. */
  const persist = async (rows: CaseLogEntry[] | null) => {
    setBusy(true);
    try {
      if (rows) await saveCaseLog(employeeId, week, rows);
      else await resetCaseLog(employeeId, week);
      await load();
      onSaved?.();
      toast(rows
        ? { title: 'Draft saved', description: 'It is the same log on Touchpoints and on Forms.' }
        : { title: 'Refilled from your touchpoints' });
    } catch (e) {
      toast({
        title: 'Could not save the log',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  /** The filled form, as bytes. Both viewing and downloading go through here. */
  const buildPdf = async (): Promise<Uint8Array> => {
    const res = await fetch(CASE_LOG_TEMPLATE);
    if (!res.ok) throw new Error(`Could not load the blank form (${res.status}).`);
    return await buildCaseLogPdf(
      await res.arrayBuffer(),
      { caseManager: caseManagerName, weekEnding: weekEndingText(week) },
      entries.filter((e) => e.clientName.trim()),
    );
  };

  const view = async () => {
    setBusy(true);
    try {
      const bytes = await buildPdf();
      // react-pdf holds the buffer, and pdf.js detaches whatever it is handed.
      // A Blob URL keeps the bytes out of React state and survives a rerender.
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      });
      setPreviewPages(0);
    } catch (e) {
      toast({
        title: 'Could not build the form',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // Once only: closing the form should leave the log open, not reopen it.
  const openedOnLoad = useRef(false);
  useEffect(() => {
    if (!openFormOnLoad || loading || openedOnLoad.current) return;
    openedOnLoad.current = true;
    void view();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openFormOnLoad, loading]);

  const download = async () => {
    setBusy(true);
    try {
      const bytes = await buildPdf();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = caseLogFileName(caseManagerName, weekEndingText(week));
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: 'Could not build the form',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };



  const filled = entries.filter((e) => e.clientName.trim()).length;
  const pages = pagesNeeded(filled);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={week} onValueChange={setWeek}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((w) => (
                <SelectItem key={w} value={w}>{weekLabel(w)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Says where the rows came from, because a form that fills itself
              should say so rather than let somebody wonder who typed it. */}
          <Badge variant="outline" className="font-normal">
            {stored?.entries ? 'Edited by hand' : 'From logged touchpoints'}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && stored?.entries && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void persist(null)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Refill from touchpoints
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void view()}>
            <Eye className="mr-1.5 h-3.5 w-3.5" />
            View form
          </Button>
          <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void download()}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 px-3 py-2 text-center">#</th>
                  <th className="px-3 py-2">Client name</th>
                  <th className="w-24 px-3 py-2 text-center">Completed</th>
                  <th className="w-36 px-3 py-2">Date</th>
                  {editable && <th className="w-10 px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Opening the log…</td></tr>
                )}
                {!loading && entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No touchpoints logged {weekLabel(week)}. Rows appear here as
                      they are logged, or add one by hand.
                    </td>
                  </tr>
                )}
                {!loading && entries.map((e, i) => (
                  <tr key={i} className="border-b last:border-0 odd:bg-muted/20">
                    <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <Input className="h-8" value={e.clientName}
                          onFocus={(ev) => ev.target.select()}
                          onChange={(ev) => edit(i, { clientName: ev.target.value })} />
                      ) : e.clientName}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <Checkbox checked={e.completed} disabled={!editable}
                        onCheckedChange={(v) => edit(i, { completed: !!v })} />
                    </td>
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <Input type="date" className="h-8" value={e.date ?? ''}
                          onChange={(ev) => edit(i, { date: ev.target.value })} />
                      ) : (e.date || '—')}
                    </td>
                    {editable && (
                      <td className="px-3 py-1.5">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                          aria-label={`Remove row ${i + 1}`}
                          onClick={() => setEntries((rows) => rows.filter((_, n) => n !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {filled} {filled === 1 ? 'entry' : 'entries'}
          {pages > 1 && ` · prints on ${pages} pages, numbered straight through`}
          {filled > 0 && filled <= ROWS_PER_PAGE && ' · fits one page'}
        </p>
        {editable && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline"
              onClick={() => setEntries((rows) => [...rows, blank()])}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add row
            </Button>
            <Button size="sm" variant="secondary" disabled={busy}
              onClick={() => void persist(entries)}>
              Save draft
            </Button>
          </div>
        )}
      </div>

      {/* The same react-pdf viewer the other templates use, so the log is read
          on the site rather than only in whatever opens a download. */}
      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (o) return;
          setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
          setScale(1);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-8">
              <span>HMIS Case Log — {caseManagerName} — week ending {weekEndingText(week)}</span>
              <span className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Zoom out"
                  onClick={() => setScale((z) => Math.max(0.5, z - 0.25))}>
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="w-12 text-center text-xs font-normal text-muted-foreground">
                  {Math.round(scale * 100)}%
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Zoom in"
                  onClick={() => setScale((z) => Math.min(2, z + 0.25))}>
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className="ml-2" onClick={() => void download()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download
                </Button>
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[72vh] overflow-auto rounded-md border bg-muted/30 p-3">
            {preview && (
              <Document
                file={preview}
                onLoadSuccess={(doc) => setPreviewPages(doc.numPages)}
                loading={<div className="p-8 text-center text-sm text-muted-foreground">Building the form…</div>}
                error={<div className="p-8 text-center text-sm text-destructive">Could not display the form. Download it instead.</div>}
              >
                <div className="flex flex-col items-center gap-4">
                  {Array.from({ length: previewPages }, (_, i) => (
                    <div key={i} className="shadow-sm">
                      <Page
                        pageNumber={i + 1}
                        width={760 * scale}
                        renderTextLayer={false}
                        renderAnnotationLayer
                        renderForms
                      />
                    </div>
                  ))}
                </div>
              </Document>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
