// Every 30-day cycle in a client's authorization, laid out end to end.
//
// A touchpoint quota falls due in each one, the initial 30 days included, and
// until now the only way to know when the next cycle opened was to count 30
// days on from a date shown somewhere else. The person carrying the client can
// now see the whole run at once, and which authorization pays for each part
// of it.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
  <li
    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${
      cycle.phase ? AUTH_PHASE_CLASS[cycle.phase] : UNCOVERED_CLASS
    } ${cycle.isPast ? 'opacity-55' : ''}`}
  >
    <span className="font-medium tabular-nums">
      {fmt(cycle.start)} – {fmt(cycle.end)}
    </span>
    {cycle.isCurrent ? (
      <span className="shrink-0 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
        Now
      </span>
    ) : !cycle.phase ? (
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide">
        Not authorized
      </span>
    ) : null}
  </li>
);

export const TouchpointCycles: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [spans, setSpans] = useState<AuthorizationSpans | null>(null);

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
      if (!cancelled) setSpans((data as AuthorizationSpans) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (!spans) return null;
  const cycles = authorizationCycles(spans, todayAgency());
  if (cycles.length === 0) return null;

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

      <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
        {cycles.map((c) => (
          <Row key={c.number} cycle={c} />
        ))}
      </ul>
    </div>
  );
};

export default TouchpointCycles;
