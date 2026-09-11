// What has happened to this case, in one list.
//
// The tab was called History and showed reassignments only, so a case that
// had been closed in March and reopened in July looked like it had never
// changed hands and nothing else. Closing and reopening are the two events
// anybody actually goes looking for.
//
// Case events come from audit_logs, which records every write to a client row
// with the old and new values. That table is readable by administrators only,
// so staff see the assignments plus, when a case is closed right now, the
// closure itself read off the client record. A case manager who cannot see
// when it was closed can at least see that it is.
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { History, ArrowRight, Archive, RotateCcw, CheckCircle2 } from 'lucide-react';
import { contactMethodLabel, touchpointTypeLabel } from '@/lib/compliance';
import { format } from 'date-fns';

interface Person {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

const personName = (p: Person | null | undefined): string =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || 'Unknown' : 'Unassigned';

type EntryKind = 'assigned' | 'closed' | 'reopened' | 'touchpoint';

interface Entry {
  id: string;
  at: string;
  kind: EntryKind;
  /** The sentence itself, already built. */
  summary: React.ReactNode;
  detail?: string | null;
}

const ICON: Record<EntryKind, React.ReactNode> = {
  assigned: <ArrowRight className="h-4 w-4 text-muted-foreground" />,
  closed: <Archive className="h-4 w-4 text-amber-600" />,
  reopened: <RotateCcw className="h-4 w-4 text-green-600" />,
  touchpoint: <CheckCircle2 className="h-4 w-4 text-blue-600" />,
};

export const CaseHistory: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [assignments, audits, current, contacts] = await Promise.all([
        supabase
          .from('client_assignments_history')
          .select(
            `id, created_at, reason,
             from_employee:profiles!client_assignments_history_from_employee_id_fkey(first_name, last_name, email),
             to_employee:profiles!client_assignments_history_to_employee_id_fkey(first_name, last_name, email),
             reassigned_by_user:profiles!client_assignments_history_reassigned_by_fkey(first_name, last_name, email)`,
          )
          .eq('client_id', clientId)
          .order('created_at', { ascending: false }),
        // Admin-only; staff get an error or an empty list and lose nothing else.
        supabase
          .from('audit_logs')
          .select('id, created_at, old_data, new_data')
          .eq('table_name', 'clients')
          .eq('record_id', clientId)
          .order('created_at', { ascending: false }),
        supabase
          .from('clients')
          .select('status, closed_date, reason_closed')
          .eq('id', clientId)
          .maybeSingle(),
        // The work itself. A case history without the visits is a record of
        // paperwork about a client nobody appears to have contacted.
        supabase
          .from('client_contacts')
          .select(
            'id, contact_date, modality, touchpoint_type, notes, employee:profiles!client_contacts_employee_id_fkey(first_name, last_name, email)',
          )
          .eq('client_id', clientId)
          .order('contact_date', { ascending: false }),
      ]);
      if (cancelled) return;

      const out: Entry[] = [];

      for (const a of (assignments.data ?? []) as unknown as Record<string, unknown>[]) {
        out.push({
          id: `assign-${a.id}`,
          at: a.created_at as string,
          kind: 'assigned',
          summary: (
            <>
              Reassigned from <strong>{personName(a.from_employee as Person)}</strong> to{' '}
              <strong>{personName(a.to_employee as Person)}</strong>, by{' '}
              {personName(a.reassigned_by_user as Person)}
            </>
          ),
          detail: (a.reason as string) || null,
        });
      }

      // Only the writes that changed the case's status are events; the rest of
      // the audit trail is field edits nobody opened this tab for.
      for (const row of (audits.data ?? []) as unknown as {
        id: string;
        created_at: string;
        old_data: Record<string, unknown> | null;
        new_data: Record<string, unknown> | null;
      }[]) {
        const was = (row.old_data?.status as string) ?? null;
        const now = (row.new_data?.status as string) ?? null;
        if (!now || was === now) continue;
        if (now === 'closed') {
          out.push({
            id: `closed-${row.id}`,
            at: row.created_at,
            kind: 'closed',
            summary: <>Case closed</>,
            detail: (row.new_data?.reason_closed as string) || null,
          });
        } else if (was === 'closed') {
          out.push({
            id: `reopened-${row.id}`,
            at: row.created_at,
            kind: 'reopened',
            summary: <>Case reopened</>,
            detail: null,
          });
        }
      }

      // The fallback for anyone who cannot read the audit trail: a case that is
      // closed says so, even without the moment it happened.
      const client = current.data as { status?: string; closed_date?: string; reason_closed?: string } | null;
      const haveClosure = out.some((e) => e.kind === 'closed');
      if (client?.status === 'closed' && !haveClosure) {
        out.push({
          id: 'closed-current',
          at: client.closed_date ? `${client.closed_date}T12:00:00Z` : new Date().toISOString(),
          kind: 'closed',
          summary: <>Case closed</>,
          detail: client.reason_closed || null,
        });
      }

      for (const c of (contacts.data ?? []) as unknown as Record<string, unknown>[]) {
        const method = contactMethodLabel(c.modality as string);
        const kind = c.touchpoint_type ? touchpointTypeLabel(c.touchpoint_type as string) : null;
        out.push({
          id: `contact-${c.id}`,
          // A contact carries a date and no time; noon keeps it on its own day
          // whichever way the browser's timezone rounds.
          at: `${c.contact_date as string}T12:00:00Z`,
          kind: 'touchpoint',
          summary: (
            <>
              Touchpoint logged{method ? ` — ${method}` : ''}
              {kind ? `, ${kind}` : ''} by <strong>{personName(c.employee as Person)}</strong>
            </>
          ),
          detail: (c.notes as string) || null,
        });
      }

      out.sort((a, b) => b.at.localeCompare(a.at));
      setEntries(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          Case history
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries === null ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing has happened to this case yet.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 shrink-0">{ICON[e.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{e.summary}</p>
                  {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {format(new Date(e.at), 'MMM d, yyyy')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default CaseHistory;
