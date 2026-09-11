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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  authorizationCycles,
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

const Row: React.FC<{ cycle: AuthorizationCycle }> = ({ cycle }) => (
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
      <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">
        Not authorized
      </span>
    ) : null}
  </li>
);

/** Six at a time. Twelve rows of dates is a wall nobody reads to the bottom of. */
const PAGE = 6;

export const TouchpointCycles: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [spans, setSpans] = useState<AuthorizationSpans | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('clients')
        .select(
          'auth_30_start, auth_30_end, auth_150_start, auth_150_end, auth_180_start, auth_180_end, hsp_150_date',
        )
        .eq('id', clientId)
        .maybeSingle();
      if (cancelled) return;
      const loaded = (data as AuthorizationSpans) ?? null;
      setSpans(loaded);
      // Open on the cycle being worked, not on a page of finished ones.
      if (loaded) {
        const all = authorizationCycles(loaded, todayAgency());
        const i = all.findIndex((c) => c.isCurrent);
        if (i >= 0) setPage(Math.floor(i / PAGE));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!spans) return null;
  const cycles = authorizationCycles(spans, todayAgency());
  if (cycles.length === 0) return null;

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
        <div className="text-sm font-semibold">30-day cycles</div>
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
          <Row key={c.number} cycle={c} />
        ))}
      </ul>

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
