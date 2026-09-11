// Everything the uploaded documents say that the record does not.
//
// One place, on purpose. The authorization proposals used to sit inside the
// Authorizations tab, so a person checking what a letter had changed looked in
// one tab for dates and had nowhere at all to look for anything else. A
// document does not know which tab its contents belong to; the person reading
// it wants the whole list, once.
//
// Every row is written the same way — what the record says now, then what the
// document says — because the question being asked is always "is this change
// right?" and that question needs both halves side by side.
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  applyAuthorizationProposals,
  loadAuthorizationProposals,
  type AuthorizationProposal,
  type ProposalSet,
} from '@/lib/authorizationProposals';
import {
  applyFieldProposals,
  loadFieldProposals,
  type FieldProposal,
} from '@/lib/documentProposals';

interface Props {
  clientId: string;
  onApplied?: () => void;
}

const shortDate = (iso: string | null) => {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : iso;
};

/**
 * Previous on the left, updated on the right, an arrow between them.
 *
 * Nothing is coloured red for the old value: the record is not wrong, it is
 * just older than the letter. Amber is kept for the case that actually costs
 * something — replacing dates that cycles are already counted from.
 */
const Change: React.FC<{ previous: React.ReactNode; updated: React.ReactNode }> = ({
  previous,
  updated,
}) => (
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
    <span className="text-muted-foreground">
      {previous ?? <span className="italic">nothing on the record</span>}
    </span>
    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <span className="font-medium">{updated}</span>
  </div>
);

export const FromDocuments: React.FC<Props> = ({ clientId, onApplied }) => {
  const [authSet, setAuthSet] = useState<ProposalSet | null>(null);
  const [fields, setFields] = useState<FieldProposal[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, f] = await Promise.all([
        loadAuthorizationProposals(clientId),
        loadFieldProposals(clientId),
      ]);
      setAuthSet(a);
      setFields(f);
      setChosen(new Set());
    } catch (e) {
      toast({
        title: 'Could not read the documents',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  useEffect(() => { void load(); }, [load]);

  // A proposal the record already agrees with is not a change, so it is not
  // offered. Showing it would make somebody read past it to find what is.
  const authChanges: AuthorizationProposal[] = (authSet?.proposals ?? []).filter((p) => !p.agrees);
  const total = authChanges.length + fields.length;

  const toggle = (key: string) =>
    setChosen((c) => {
      const next = new Set(c);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const accept = async () => {
    setSaving(true);
    try {
      const acceptedAuth = authChanges.filter((p) => chosen.has(`auth:${p.prefix}`));
      const acceptedFields = fields.filter((f) => chosen.has(`field:${f.key}`));
      // Authorizations first: they move the dates every cycle is counted from,
      // and both calls end by rebuilding those cycles. Fields after, so the
      // rebuild that matters runs last.
      if (acceptedAuth.length) await applyAuthorizationProposals(clientId, acceptedAuth);
      if (acceptedFields.length) await applyFieldProposals(clientId, acceptedFields);
      await load();
      onApplied?.();
      toast({ title: 'Changes accepted' });
    } catch (e) {
      toast({
        title: 'Could not accept the changes',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const Row: React.FC<{
    id: string;
    label: string;
    source: string;
    children: React.ReactNode;
    note?: React.ReactNode;
  }> = ({ id, label, source, children, note }) => (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox
        id={id}
        checked={chosen.has(id)}
        onCheckedChange={() => toggle(id)}
        className="mt-1"
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {children}
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          Read from {source}
        </p>
        {note}
      </label>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Reading the documents…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">From documents</CardTitle>
        <p className="text-sm text-muted-foreground">
          What the uploaded files say that this record does not. Tick what is right,
          then accept — nothing is written until you do.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing to change. Every value the documents carry already matches this
            record, or no document has been read yet — uploads are read under Forms.
          </p>
        )}

        {authChanges.map((p) => {
          const id = `auth:${p.prefix}`;
          return (
            <Row
              key={id}
              id={id}
              label={p.label}
              source={p.documentName}
              note={
                p.currentStart !== null ? (
                  <p className="text-xs text-amber-700">
                    Accepting this replaces those dates and every cycle counted from them.
                  </p>
                ) : undefined
              }
            >
              <Change
                previous={
                  p.currentStart
                    ? `${shortDate(p.currentStart)} to ${shortDate(p.currentEnd)}`
                    : null
                }
                updated={`${shortDate(p.start)} to ${shortDate(p.end)}`}
              />
              {p.number && !p.currentNumber && (
                <Change previous={null} updated={`Auth # ${p.number}`} />
              )}
              {p.number && p.currentNumber && p.number !== p.currentNumber && (
                <Change previous={`Auth # ${p.currentNumber}`} updated={`Auth # ${p.number}`} />
              )}
            </Row>
          );
        })}

        {fields.map((f) => {
          const id = `field:${f.key}`;
          return (
            <Row key={id} id={id} label={f.label} source={f.documentName}>
              <Change
                previous={f.kind === 'date' ? shortDate(f.previous) : f.previous}
                updated={f.kind === 'date' ? shortDate(f.updated) : f.updated}
              />
            </Row>
          );
        })}

        {(authSet?.unrecognised.length ?? 0) > 0 && (
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            {authSet?.unrecognised.map((u) => (
              <p key={`${u.documentName}-${u.start}`}>
                {u.documentName} covers {u.days} days, which is not a 30, 150 or
                180-day period. Nothing is proposed from it.
              </p>
            ))}
          </div>
        )}

        {total > 0 && (
          <Button onClick={() => void accept()} disabled={saving || chosen.size === 0}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              'Accept changes'
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
