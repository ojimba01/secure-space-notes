// One case manager's month, as the HMIS Case Log asks for it.
//
// The rows come from touchpoints already logged in the app, so the form opens
// filled in. A case manager checks it rather than writes it — which is the
// only reason a monthly paper form is worth having in software at all.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Download, Plus, RotateCcw, Trash2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  caseLogEntries,
  loadCaseLog,
  monthLabel,
  monthsAvailable,
  reopenCaseLog,
  saveCaseLog,
  submitCaseLog,
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
  /** Admins may reopen a filed log. Its author may not. */
  canReopen?: boolean;
  /** An admin reads someone else's log; only its author edits it. */
  readOnly?: boolean;
}

const blank = (): CaseLogEntry => ({ clientName: '', phone: '', date: '', completed: false });

export const CaseLog: React.FC<Props> = ({
  employeeId,
  caseManagerName,
  canReopen = false,
  readOnly = false,
}) => {
  const months = useMemo(() => monthsAvailable(), []);
  const [month, setMonth] = useState(months[0]);
  const [stored, setStored] = useState<CaseLogRow | null>(null);
  const [entries, setEntries] = useState<CaseLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const submitted = stored?.status === 'submitted';
  const editable = !readOnly && !submitted;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await loadCaseLog(employeeId, month);
      setStored(row);
      setEntries(await caseLogEntries(employeeId, month, row));
    } catch (e) {
      toast({
        title: 'Could not open the log',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [employeeId, month, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const edit = (i: number, patch: Partial<CaseLogEntry>) =>
    setEntries((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  const persist = async (rows: CaseLogEntry[]) => {
    setBusy(true);
    try {
      await saveCaseLog(employeeId, month, rows);
      await load();
      toast({ title: 'Log saved' });
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

  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(CASE_LOG_TEMPLATE);
      if (!res.ok) throw new Error(`Could not load the blank form (${res.status}).`);
      const bytes = await buildCaseLogPdf(
        await res.arrayBuffer(),
        { caseManager: caseManagerName, month: monthLabel(month) },
        entries.filter((e) => e.clientName.trim()),
      );
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = caseLogFileName(caseManagerName, monthLabel(month));
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

  const file = async () => {
    setBusy(true);
    try {
      await submitCaseLog(employeeId, month, entries.filter((e) => e.clientName.trim()));
      await load();
      toast({ title: 'Log submitted' });
    } catch (e) {
      toast({
        title: 'Could not submit the log',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      await reopenCaseLog(employeeId, month);
      await load();
      toast({ title: 'Log reopened' });
    } catch (e) {
      toast({
        title: 'Could not reopen the log',
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
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {submitted ? (
            <Badge variant="secondary" className="gap-1">
              <Check className="h-3 w-3" /> Submitted
            </Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
          {/* Says where the rows came from, because a form that fills itself
              should say so rather than let somebody wonder who typed it. */}
          <span className="text-xs text-muted-foreground">
            {stored?.entries
              ? 'Edited by hand'
              : 'From logged touchpoints'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && stored?.entries && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void persist([])}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Refill from touchpoints
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void download()}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download PDF
          </Button>
          {editable && (
            <Button size="sm" disabled={busy || loading || filled === 0} onClick={() => void file()}>
              Submit log
            </Button>
          )}
          {submitted && canReopen && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void reopen()}>
              Reopen
            </Button>
          )}
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
                  <th className="w-40 px-3 py-2">Phone</th>
                  <th className="w-24 px-3 py-2 text-center">Completed</th>
                  <th className="w-36 px-3 py-2">Date</th>
                  {editable && <th className="w-10 px-3 py-2" />}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Opening the log…</td></tr>
                )}
                {!loading && entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                      No touchpoints logged in {monthLabel(month)}. Rows appear here as
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
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <Input className="h-8" value={e.phone ?? ''}
                          onFocus={(ev) => ev.target.select()}
                          onChange={(ev) => edit(i, { phone: ev.target.value })} />
                      ) : (e.phone || '—')}
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
              Save changes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
