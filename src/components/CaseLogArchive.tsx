// Case logs, looked up after the fact.
//
// A week at a time is how the log is filed; a range is how it gets asked
// about. Somebody wants one week, or all of September's, for one case
// manager or for everybody, and they want the forms — not a count. So the range
// and the people are both filters, the people optional, and every log that
// falls inside comes back as something you can open and print.
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, FileText, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CaseLog } from '@/components/CaseLog';
import {
  caseLogEntries,
  loadCaseLog,
  weekEndingText,
  weekLabel,
  weeksAvailable,
} from '@/lib/caseLog';
import {
  CASE_LOG_TEMPLATE,
  buildCaseLogPdf,
  mergeCaseLogPdfs,
  type CaseLogEntry,
} from '@/lib/caseLogForm';
import type { CaseManagerRow } from '@/hooks/useCaseManagers';

interface Props {
  managers: CaseManagerRow[];
}

interface Found {
  employeeId: string;
  name: string;
  week: string;
  entries: CaseLogEntry[];
}

export const CaseLogArchive: React.FC<Props> = ({ managers }) => {
  const weeks = useMemo(() => weeksAvailable(), []);
  // Four weeks back by default: a month's worth, which is what is usually
  // asked for, without making somebody scroll to find this week.
  const [from, setFrom] = useState(weeks[Math.min(3, weeks.length - 1)]);
  const [to, setTo] = useState(weeks[0]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Found | null>(null);
  const { toast } = useToast();

  // A range typed backwards is a slip, not a question. Read it either way.
  const span = useMemo(() => {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    return weeks.filter((w) => w >= lo && w <= hi);
  }, [from, to, weeks]);

  // No one ticked means everyone, which is why the boxes are not required.
  const chosen = useMemo(
    () => (picked.size ? managers.filter((m) => picked.has(m.id)) : managers),
    [picked, managers],
  );

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const search = async () => {
    setBusy(true);
    try {
      const found: Found[] = [];
      for (const m of chosen) {
        for (const week of span) {
          const stored = await loadCaseLog(m.id, week);
          const entries = await caseLogEntries(m.id, week, stored);
          // A week with no touchpoints has no log worth showing. Listing it
          // would pad the results with blank forms nobody filed.
          if (entries.length === 0) continue;
          found.push({ employeeId: m.id, name: m.name, week, entries });
        }
      }
      found.sort((a, b) => b.week.localeCompare(a.week) || a.name.localeCompare(b.name));
      setResults(found);
    } catch (e) {
      toast({
        title: 'Could not read the logs',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  /** Every log in the result, one after another, as a single document. */
  const downloadAll = async () => {
    if (!results?.length) return;
    setBusy(true);
    try {
      const res = await fetch(CASE_LOG_TEMPLATE);
      if (!res.ok) throw new Error(`Could not load the blank form (${res.status}).`);
      const blank = await res.arrayBuffer();
      const parts: Uint8Array[] = [];
      for (const r of results) {
        parts.push(
          await buildCaseLogPdf(
            blank.slice(0),
            { caseManager: r.name, weekEnding: weekEndingText(r.week) },
            r.entries,
          ),
        );
      }
      const merged = await mergeCaseLogPdfs(parts);
      const url = URL.createObjectURL(new Blob([merged as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      const range = span.length === 1
        ? `week ending ${weekEndingText(span[0])}`
        : `weeks ending ${weekEndingText(span[span.length - 1])} to ${weekEndingText(span[0])}`;
      a.href = url;
      a.download = `HMIS Case Logs — ${range}.pdf`.replace(/[/\\]/g, '-');
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: 'Could not build the forms',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  // A changed question makes the old answer stale rather than wrong to show.
  useEffect(() => { setResults(null); }, [from, to, picked]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Past case logs</CardTitle>
        <p className="text-sm text-muted-foreground">
          Pick a week, or a run of them. Tick case managers to narrow it — leave
          them all clear for everybody.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">From</p>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {weeks.map((w) => <SelectItem key={w} value={w}>{weekLabel(w)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">To</p>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger className="h-9 w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {weeks.map((w) => <SelectItem key={w} value={w}>{weekLabel(w)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void search()} disabled={busy}>
            {busy ? 'Reading…' : 'Find logs'}
          </Button>
        </div>

        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Users className="h-3 w-3" />
            Case managers {picked.size === 0 && <span className="font-normal normal-case tracking-normal">— all</span>}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {managers.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox checked={picked.has(m.id)} onCheckedChange={() => toggle(m.id)} />
                {m.name}
              </label>
            ))}
          </div>
        </div>

        {results && (
          <div className="space-y-2 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {results.length === 0
                  ? `No touchpoints logged ${span.length === 1 ? weekLabel(span[0]) : 'in that range'}.`
                  : `${results.length} ${results.length === 1 ? 'log' : 'logs'} across ${span.length} ${span.length === 1 ? 'week' : 'weeks'}.`}
              </p>
              {results.length > 0 && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void downloadAll()}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download all as one PDF
                </Button>
              )}
            </div>

            {results.map((r) => (
              <button
                key={`${r.employeeId}-${r.week}`}
                onClick={() => setOpen(r)}
                className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="text-sm text-muted-foreground">{weekLabel(r.week)}</span>
                </div>
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {r.entries.length} {r.entries.length === 1 ? 'entry' : 'entries'}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              HMIS Case Log — {open?.name} — {open && `week ending ${weekEndingText(open.week)}`}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <CaseLog
                employeeId={open.employeeId}
                caseManagerName={open.name}
                initialWeek={open.week}
                readOnly
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
