import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Home, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDay } from '@/lib/dates';
import {
  MOVE_IN_SECTIONS,
  emptyMoveIn,
  loadMoveIn,
  saveMoveIn,
  type MoveInDetails,
} from '@/lib/moveIn';

interface Props {
  clientId: string;
  /** Bumped when a submitted form has written to the record. */
  refreshKey?: number;
  readOnly?: boolean;
}

/**
 * Where this member is moving to, and who holds the keys.
 *
 * None of it is required, and most clients have none of it: somebody with no
 * move planned is a complete record, not an unfinished one. So an empty card
 * says so in a line rather than showing ten empty boxes, and the boxes appear
 * when there is something to put in them.
 *
 * It fills itself in from a submitted Move-in Supports Request, and can be
 * written in by hand for a move nobody has filed a form for yet.
 */
export const MoveInDetailsCard: React.FC<Props> = ({ clientId, refreshKey = 0, readOnly }) => {
  const { toast } = useToast();
  const [details, setDetails] = useState<MoveInDetails>(emptyMoveIn());
  const [draft, setDraft] = useState<MoveInDetails>(emptyMoveIn());
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDetails(await loadMoveIn(clientId));
    } catch (err) {
      toast({
        title: 'Could not load the move-in details',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const anything = Object.values(details).some((v) => (v ?? '').toString().trim());

  const start = () => {
    setDraft({ ...details });
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveMoveIn(clientId, draft);
      setDetails(draft);
      setEditing(false);
      toast({ title: 'Move-in details saved' });
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const shown = (key: keyof MoveInDetails) => {
    const value = (details[key] ?? '').toString().trim();
    if (!value) return null;
    return key === 'move_in_date' ? formatDay(value) : value;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Home className="h-5 w-5 text-muted-foreground" />
          Move-in details
        </CardTitle>
        {!readOnly && !editing && (
          <Button variant="outline" size="sm" onClick={start}>
            <Pencil className="h-4 w-4 mr-2" />
            {anything ? 'Edit' : 'Add'}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : editing ? (
          <>
            {MOVE_IN_SECTIONS.map((section) => (
              <div key={section.title} className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {section.title}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {section.fields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label htmlFor={`movein-${f.key}`}>{f.label}</Label>
                      <Input
                        id={`movein-${f.key}`}
                        type={f.type}
                        value={(draft[f.key] ?? '') as string}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                        }
                      />
                      {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </>
        ) : !anything ? (
          <p className="text-sm text-muted-foreground">
            Nothing recorded. A submitted Move-in Supports Request fills this in, or it can be
            written in by hand.
          </p>
        ) : (
          MOVE_IN_SECTIONS.map((section) => {
            const filled = section.fields.filter((f) => shown(f.key));
            if (!filled.length) return null;
            return (
              <div key={section.title}>
                <p className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                  {section.title}
                </p>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {filled.map((f) => (
                    <div key={f.key} className="text-sm">
                      <span className="text-muted-foreground">{f.label}: </span>
                      {shown(f.key)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
