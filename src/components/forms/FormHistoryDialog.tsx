// Who changed what in a form, and when. Every save of a form keeps a copy of
// its file (client_form_versions); this reads the boxes out of each copy and
// lists what each save changed from the one before. Admins only.
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { extractPdfFieldValues } from '@/lib/formAutofill';
import { fetchFormVersions, type FormVersion } from '@/lib/formVersions';

interface Change {
  field: string;
  before: string;
  after: string;
}

interface Entry {
  version: FormVersion & { created_by?: string | null };
  who: string;
  /** Null when the file could not be read. */
  changes: Change[] | null;
  /** Boxes filled in, for the first save. */
  filled: number;
  first: boolean;
}

/** A box's name as people read it: the PDF's name, tidied. */
const label = (field: string) => field.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

async function readFields(path: string): Promise<Record<string, string> | null> {
  const { data, error } = await supabase.storage.from('client-files').download(path);
  if (error || !data) return null;
  try {
    return await extractPdfFieldValues(await data.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Answers that were changed: ones that had an answer before and now have a
 * different one (or none). Filling in a box that was blank is not a change.
 */
function diff(before: Record<string, string>, after: Record<string, string>): Change[] {
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((f) => (before[f] ?? '').trim() !== '' && (before[f] ?? '').trim() !== (after[f] ?? '').trim())
    .map((f) => ({ field: f, before: before[f] ?? '', after: after[f] ?? '' }));
}

export const FormHistoryDialog: React.FC<{ formId: string; title: string; onClose: () => void }> = ({
  formId,
  title,
  onClose,
}) => {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const versions = (await fetchFormVersions(formId)).reverse() as Entry['version'][];
        const people = [...new Set(versions.map((v) => v.created_by).filter(Boolean))] as string[];
        const { data: profiles } = people.length
          ? await supabase.from('profiles').select('id, first_name, last_name').in('id', people)
          : { data: [] };
        const names = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]));

        const fields = await Promise.all(versions.map((v) => readFields(v.file_path)));
        const out: Entry[] = [];
        let previous: Record<string, string> = {};
        versions.forEach((v, i) => {
          const now = fields[i];
          out.push({
            version: v,
            who: (v.created_by && names.get(v.created_by)) || 'Unknown',
            changes: now ? diff(previous, now) : null,
            filled: now ? Object.values(now).filter((x) => x.trim()).length : 0,
            first: i === 0,
          });
          if (now) previous = now;
        });
        // Only saves that changed an answer, and the one that created the form.
        if (!cancelled) setEntries(out.filter((e) => e.first || e.changes === null || e.changes.length > 0).reverse());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formId]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Edit history: {title}</DialogTitle>
        </DialogHeader>
        <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : entries === null ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved versions of this form.</p>
          ) : (
            entries.map((e) => (
              <section key={e.version.id} className="rounded-lg border">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                  <span className="text-sm font-medium">{e.who}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(e.version.created_at), 'MMM d, yyyy h:mm a')}
                  </span>
                </header>
                <div className="p-3 text-sm">
                  {e.changes === null ? (
                    <p className="text-muted-foreground">This version's file could not be read.</p>
                  ) : e.first ? (
                    <p className="text-muted-foreground">Created the form.</p>
                  ) : (
                    <Changes changes={e.changes} />
                  )}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const Changes: React.FC<{ changes: Change[]; first?: boolean }> = ({ changes, first }) => (
  <table className="w-full table-fixed text-left text-sm">
    <thead className="text-xs text-muted-foreground">
      <tr>
        <th className="w-2/5 pb-1 pr-2 font-medium">Question</th>
        {!first && <th className="pb-1 pr-2 font-medium">Before</th>}
        <th className="pb-1 font-medium">{first ? 'Answer' : 'After'}</th>
      </tr>
    </thead>
    <tbody className="align-top">
      {changes.map((c) => (
        <tr key={c.field} className="border-t">
          <td className="py-1.5 pr-2 text-muted-foreground [overflow-wrap:anywhere]">{label(c.field)}</td>
          {!first && (
            <td className="py-1.5 pr-2 [overflow-wrap:anywhere]">
              {c.before ? <span className="text-red-700 line-through">{c.before}</span> : <span className="text-muted-foreground">Blank</span>}
            </td>
          )}
          <td className="py-1.5 [overflow-wrap:anywhere]">
            {c.after ? <span className={first ? '' : 'text-green-700'}>{c.after}</span> : <span className="text-muted-foreground">Blank</span>}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);
