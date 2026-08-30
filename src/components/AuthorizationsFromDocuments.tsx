import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import {
  applyAuthorizationProposals,
  loadAuthorizationProposals,
  type AuthorizationProposal,
  type ProposalSet,
} from '@/lib/authorizationProposals';

interface Props {
  clientId: string;
  onApplied: () => void;
}

const shortDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString() : '—';

/**
 * What this client's approval letters say about their authorization dates.
 *
 * Shown only when a letter disagrees with the record or fills a blank in it.
 * A client whose dates already match their letters has nothing to decide, and
 * a panel that appears on every client saying "everything agrees" is a panel
 * people stop reading.
 */
export const AuthorizationsFromDocuments: React.FC<Props> = ({ clientId, onApplied }) => {
  const { toast } = useToast();
  const [set, setSet] = useState<ProposalSet | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadAuthorizationProposals(clientId);
      setSet(result);
      // A blank on the record is ticked. A date somebody entered is not:
      // a letter is evidence, and replacing a person's date shifts every
      // billing cycle after it.
      setChosen(
        new Set(
          result.proposals
            .filter((p) => !p.agrees && p.currentStart === null)
            .map((p) => p.prefix),
        ),
      );
    } catch (err: any) {
      toast({ title: 'Could not read the letters', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const apply = async () => {
    if (!set) return;
    setSaving(true);
    try {
      const accepted = set.proposals.filter((p) => chosen.has(p.prefix));
      await applyAuthorizationProposals(clientId, accepted);
      toast({
        title: `${accepted.length} authorization${accepted.length === 1 ? '' : 's'} updated`,
        description: 'Billing cycles and touchpoints were rebuilt from the new dates.',
      });
      onApplied();
      load();
    } catch (err: any) {
      toast({ title: 'Could not save', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  const actionable = (set?.proposals ?? []).filter((p) => !p.agrees);
  if (actionable.length === 0 && (set?.unrecognised.length ?? 0) === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">What the approval letters say</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Read from this client's own letters. Accepting a date rebuilds their billing cycles and
          touchpoints from it.
        </p>

        {actionable.map((p) => (
          <div key={p.prefix} className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id={`auth-${p.prefix}`}
              checked={chosen.has(p.prefix)}
              onCheckedChange={(v) =>
                setChosen((c) => {
                  const next = new Set(c);
                  if (v === true) next.add(p.prefix);
                  else next.delete(p.prefix);
                  return next;
                })
              }
              className="mt-0.5"
            />
            <label htmlFor={`auth-${p.prefix}`} className="flex-1 cursor-pointer space-y-1">
              <div className="text-sm font-medium">{p.label}</div>
              <div className="text-sm">
                {shortDate(p.start)} to {shortDate(p.end)}
                {p.number && <span className="text-muted-foreground"> · number {p.number}</span>}
              </div>
              <p className="text-xs text-muted-foreground">
                Read from {p.documentName}.{' '}
                {p.currentStart === null ? (
                  <span>The record has no dates for this period.</span>
                ) : (
                  <span className="text-amber-700">
                    The record says {shortDate(p.currentStart)} to {shortDate(p.currentEnd)}.
                    Accepting this replaces those and every cycle counted from them.
                  </span>
                )}
              </p>
            </label>
          </div>
        ))}

        {(set?.unrecognised.length ?? 0) > 0 && (
          <div className="rounded-md border p-3 text-xs text-muted-foreground">
            {set?.unrecognised.map((u) => (
              <p key={`${u.documentName}-${u.start}`}>
                {u.documentName} covers {u.days} days, which is not a 30, 150 or 180-day period.
                Nothing is proposed from it.
              </p>
            ))}
          </div>
        )}

        {actionable.length > 0 && (
          <Button onClick={apply} disabled={saving || chosen.size === 0}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving
              </>
            ) : (
              `Accept ${chosen.size} of ${actionable.length}`
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
