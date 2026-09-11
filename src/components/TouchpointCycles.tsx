// Every 30-day cycle in a client's authorization, laid out end to end.
//
// A touchpoint quota falls due in each one, the initial 30 days included, and
// until now the only way to know when the next cycle opened was to count 30
// days on from a date shown somewhere else. The person carrying the client can
// now see the whole run at once, and which authorization pays for each part
// of it.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AUTHORIZATION_TYPE_LABEL,
  fetchClientAuthorizations,
  recordAuthorization,
  resyncDerivedSchedules,
  syncAuthorizationsFromLegacyColumns,
  type AuthorizationType,
} from '@/lib/authorizations';
import {
  authorizationCycles,
  spansFromAuthorizations,
  type AuthSpan,
  todayAgency,
  AUTH_PHASE_LABEL,
  AUTH_PHASE_CLASS,
  AUTH_PHASE_DOT,
  type AuthPhase,
  type AuthorizationCycle,
  type AuthorizationSpans,
} from '@/lib/compliance';

/** A cycle no authorization covers. Not hidden — it is the gap somebody must fill. */
const UNCOVERED_CLASS = 'border-amber-300 bg-amber-50 text-amber-900';

const fmt = (d: string) => {
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
};

const Row: React.FC<{ cycle: AuthorizationCycle; onAdd?: (c: AuthorizationCycle) => void }> = ({
  cycle,
  onAdd,
}) => (
  <li className="flex items-center gap-2">
    {/* The block of colour ends with the dates. Stretched across the column it
        read as a progress bar measuring nothing. */}
    <span
      className={`inline-flex rounded-md border px-2.5 py-1 font-medium tabular-nums ${
        cycle.phase ? AUTH_PHASE_CLASS[cycle.phase] : UNCOVERED_CLASS
      } ${cycle.isPast ? 'opacity-55' : ''}`}
    >
      {fmt(cycle.start)} – {fmt(cycle.end)}
    </span>
    {cycle.isCurrent ? (
      <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
        Now
      </span>
    ) : !cycle.phase ? (
      // Naming the problem and leaving the reader to go and find the screen
      // that fixes it is half a message. This is the other half.
      <Button
        size="sm"
        // Red, not amber: thirty days of work nobody is paying for is not a
        // note, and the row beside it is already amber.
        className="h-6 bg-red-600 px-2 text-[11px] text-white hover:bg-red-700"
        onClick={() => onAdd?.(cycle)}
      >
        Add Auth Code
      </Button>
    ) : null}
  </li>
);

/** Six at a time. Twelve rows of dates is a wall nobody reads to the bottom of. */
const PAGE = 6;

export const TouchpointCycles: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [spans, setSpans] = useState<AuthorizationSpans | null>(null);
  /** The recorded authorizations. They outrank the legacy columns. */
  const [recorded, setRecorded] = useState<AuthSpan[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  /** The uncovered cycle somebody is recording an authorization for. */
  const [adding, setAdding] = useState<AuthorizationCycle | null>(null);
  const [addType, setAddType] = useState<AuthorizationType>('reauthorization_180');
  const [addNumber, setAddNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, auths] = await Promise.all([
        supabase
          .from('clients')
          .select(
            'iat_date, auth_30_start, auth_30_end, auth_150_start, auth_150_end, auth_180_start, auth_180_end, hsp_150_date',
          )
          .eq('id', clientId)
          .maybeSingle(),
        fetchClientAuthorizations(clientId).catch(() => []),
      ]);
      if (cancelled) return;

      const loaded = (data as AuthorizationSpans) ?? null;
      const fromRecord = spansFromAuthorizations(auths);
      setSpans(loaded);
      setRecorded(fromRecord);
      setLoading(false);

      // Open on the cycle being worked, not on a page of finished ones.
      if (loaded || fromRecord.length) {
        const all = authorizationCycles(loaded ?? {}, todayAgency(), fromRecord);
        const i = all.findIndex((c) => c.isCurrent);
        if (i >= 0) setPage(Math.floor(i / PAGE));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, reload]);

  const saveAuthorization = async () => {
    if (!adding) return;
    setSaving(true);
    try {
      await recordAuthorization({
        clientId,
        type: addType,
        // The cycle's own first day: it is the stretch that was uncovered, so
        // it is the day the authorization has to begin to cover it.
        startDate: adding.start,
        authorizationNumber: addNumber.trim() || null,
      });
      await syncAuthorizationsFromLegacyColumns(clientId).catch(() => {});
      await resyncDerivedSchedules(clientId).catch(() => {});
      setAdding(null);
      setAddNumber('');
      setReload((n) => n + 1);
      toast({
        title: 'Authorization recorded',
        description: 'The cycles it covers have been recoloured.',
      });
    } catch (e) {
      toast({
        title: 'Could not record it',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // The list used to return null on both of these, so a client with no
  // authorization dates produced an empty space where a section had been and
  // the feature looked broken. Nothing to show is a thing worth saying.
  const cycles = authorizationCycles(spans ?? {}, todayAgency(), recorded);

  if (loading || cycles.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-sm font-semibold">All 30-day touchpoint cycles</div>
        <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {loading
            ? 'Loading'
            : 'No cycles yet. They appear once this client has an authorization with a start date — record one under Authorizations.'}
        </p>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(cycles.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const shown = cycles.slice(safePage * PAGE, safePage * PAGE + PAGE);

  // Only the authorizations this client actually has, so a legend never
  // explains a colour that is not on screen.
  const phasesShown = Array.from(
    new Set(cycles.map((c) => c.phase).filter((p): p is AuthPhase => !!p)),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-sm font-semibold">All 30-day touchpoint cycles</div>
        <div className="text-xs text-muted-foreground">A touchpoint quota is due in each one.</div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {phasesShown.map((p) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${AUTH_PHASE_DOT[p]}`} />
            {AUTH_PHASE_LABEL[p]}
          </span>
        ))}
      </div>

      <ul className="space-y-1.5 text-xs">
        {shown.map((c) => (
          <Row key={c.number} cycle={c} onAdd={setAdding} />
        ))}
      </ul>

      <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add an authorization</DialogTitle>
            <DialogDescription>
              Nothing covers {adding && fmt(adding.start)} – {adding && fmt(adding.end)}. Recording
              a period that starts on that day colours this cycle and every other it reaches.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={addType} onValueChange={(v) => setAddType(v as AuthorizationType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['initial_30', 'continuation_150', 'reauthorization_180'] as const).map((t) => (
                    <SelectItem key={t} value={t}>
                      {AUTHORIZATION_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-number">Authorization number</Label>
              <Input
                id="auth-number"
                value={addNumber}
                onChange={(e) => setAddNumber(e.target.value)}
                placeholder="Optional"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Starts {adding && fmt(adding.start)}. The end date follows from the period.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={saveAuthorization} disabled={saving}>
              {saving ? 'Recording…' : 'Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pages > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label="Earlier cycles"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            aria-label="Later cycles"
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="tabular-nums">
            {safePage * PAGE + 1}–{Math.min((safePage + 1) * PAGE, cycles.length)} of{' '}
            {cycles.length}
          </span>
        </div>
      )}
    </div>
  );
};

export default TouchpointCycles;
