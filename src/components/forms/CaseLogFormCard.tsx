// The HMIS Case Log, as a card among the other forms.
//
// It is not a second copy of the log. Both buttons open the same CaseLog that
// Touchpoints shows, reading and saving the same case_logs row, so a change
// made here is on Touchpoints and the other way round. The log lives on
// Touchpoints because it is built from them; it is here too because this is
// where people look for a form.
import React, { useCallback, useEffect, useState } from 'react';
import { FormTile } from '@/components/forms/FormTile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClipboardList, Eye, Plus } from 'lucide-react';
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
      <FormTile
        title={CASE_LOG_LABEL}
        icon={ClipboardList}
        detail={saved !== null ? `Draft for ${weekLabel(week)} · ${saved} ${saved === 1 ? 'row' : 'rows'}` : undefined}
        disabled={!profileId}
        primary={{
          label: saved !== null ? 'Continue' : 'Open log',
          icon: Plus,
          title: saved !== null ? "Continue this week's draft" : "Open this week's case log",
          onClick: () => setOpen('log'),
        }}
        secondary={{
          label: 'View form',
          icon: Eye,
          title: "View this week's case log form",
          onClick: () => setOpen('form'),
        }}
      />

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
