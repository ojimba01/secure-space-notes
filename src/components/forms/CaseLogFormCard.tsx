// The HMIS Case Log, as a card among the other forms.
//
// It is not a second copy of the log. Both buttons open the same CaseLog that
// Touchpoints shows, reading and saving the same case_logs row, so a change
// made here is on Touchpoints and the other way round. The log lives on
// Touchpoints because it is built from them; it is here too because this is
// where people look for a form.
import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Eye, FileText, Plus } from 'lucide-react';
import { CaseLog } from '@/components/CaseLog';
import { loadCaseLog, today, weekKey, weekLabel, type CaseLogRow } from '@/lib/caseLog';

export const CASE_LOG_LABEL = 'HMIS Weekly Case Log';
export const CASE_LOG_DESCRIPTION =
  'Your touchpoints for the week, Monday to Sunday.';

interface Props {
  profileId: string | null;
  caseManagerName: string;
}

export const CaseLogFormCard: React.FC<Props> = ({ profileId, caseManagerName }) => {
  // 'log' opens on the rows; 'form' opens straight onto the filled form.
  const [open, setOpen] = useState<'log' | 'form' | null>(null);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<CaseLogRow | null>(null);
  const week = weekKey(today());

  // This week's saved draft, if there is one, so the card can say so.
  const refresh = useCallback(async () => {
    if (!profileId) return;
    try {
      setDraft(await loadCaseLog(profileId, week));
    } catch {
      setDraft(null);
    }
  }, [profileId, week]);
  useEffect(() => { void refresh(); }, [refresh]);

  const close = () => {
    if (dirty && !window.confirm('You have rows that are not saved. Close without saving the draft?')) return;
    setDirty(false);
    setOpen(null);
    void refresh();
  };

  const saved = draft?.entries ? draft.entries.length : null;
  const savedAt = draft?.updated_at
    ? new Date(draft.updated_at).toLocaleString(undefined, {
        weekday: 'short', hour: 'numeric', minute: '2-digit',
      })
    : null;

  return (
    <>
      <Card className="p-4 flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div>
            <div className="text-sm font-medium leading-tight">{CASE_LOG_LABEL}</div>
            <p className="text-xs text-muted-foreground mt-1">{CASE_LOG_DESCRIPTION}</p>
            <p className="text-xs mt-1.5">
              {saved !== null ? (
                <span className="text-foreground">
                  Draft for {weekLabel(week)} · {saved} {saved === 1 ? 'row' : 'rows'}
                  {savedAt && ` · saved ${savedAt}`}
                </span>
              ) : (
                <span className="text-muted-foreground">{weekLabel(week)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2">
          <Button
            size="icon"
            className="h-8 w-8 bg-green-600 text-white hover:bg-green-700"
            onClick={() => setOpen('log')}
            disabled={!profileId}
            title={saved !== null ? "Continue this week's draft" : "Open this week's case log"}
            aria-label={saved !== null ? "Continue this week's draft" : "Open this week's case log"}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setOpen('form')}
            disabled={!profileId}
            title="View this week's case log form"
            aria-label="View this week's case log form"
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      {/* The view button: the form on its own, and closing it is closing it. */}
      {open === 'form' && profileId && (
        <CaseLog
          employeeId={profileId}
          caseManagerName={caseManagerName}
          formOnly
          onClose={() => setOpen(null)}
        />
      )}

      <Dialog open={open === 'log'} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>HMIS Case Log — {caseManagerName}</DialogTitle>
            <DialogDescription>
              Filled from what you have logged. Save a draft and come back to it here or on
              Touchpoints — it is the same log in both places.
            </DialogDescription>
          </DialogHeader>
          {open === 'log' && profileId && (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <CaseLog
                employeeId={profileId}
                caseManagerName={caseManagerName}
                onDirtyChange={setDirty}
                onSaved={() => void refresh()}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
