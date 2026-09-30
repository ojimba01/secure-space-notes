// Support tickets: every request sent from the Support button. Superadmins only.
//
// The list on the left, the selected ticket on the right: who sent it, from
// which page, what they attached, and the conversation. Replies appear under
// Support for the person who asked; the status tells them where it stands.
import { PageShell } from '@/components/PageShell';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsSuperadmin } from '@/hooks/useIsSuperadmin';
import { TicketThread } from '@/components/support/TicketThread';
import {
  loadAllTickets,
  setStatus,
  STATUS_CLASS,
  STATUS_LABEL,
  type Ticket,
  type TicketStatus,
} from '@/lib/support';

type Filter = 'active' | TicketStatus | 'all';

const FILTER_LABEL: Record<Filter, string> = {
  active: 'Open and in progress',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  all: 'All tickets',
};

export default function SupportTickets() {
  const { toast } = useToast();
  const { isSuperadmin, loading: roleLoading } = useIsSuperadmin();
  const [params, setParams] = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('active');
  const [problem, setProblem] = useState<string | null>(null);
  const selectedId = params.get('ticket');

  const load = useCallback(async () => {
    try {
      const all = await loadAllTickets();
      setTickets(all);
      const ids = [...new Set(all.map((t) => t.created_by))];
      if (ids.length) {
        const { data } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', ids);
        setNames(
          Object.fromEntries(
            (data ?? []).map((p) => [p.user_id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email]),
          ),
        );
      }
    } catch (e) {
      setTickets([]);
      setProblem(
        'Tickets could not be loaded. If this page is new, the database update for it may not have been applied yet.',
      );
    }
  }, []);

  useEffect(() => {
    if (isSuperadmin) void load();
  }, [isSuperadmin, load]);

  const shown = useMemo(
    () =>
      (tickets ?? []).filter((t) =>
        filter === 'all' ? true : filter === 'active' ? t.status === 'open' || t.status === 'in_progress' : t.status === filter,
      ),
    [tickets, filter],
  );

  if (roleLoading) return <div className="grid min-h-screen place-items-center">Loading…</div>;
  if (!isSuperadmin) return <Navigate to="/" replace />;

  const selected = tickets?.find((t) => t.id === selectedId) ?? null;
  const select = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('ticket', id);
    else next.delete('ticket');
    setParams(next, { replace: true });
  };

  const changeStatus = async (status: TicketStatus) => {
    if (!selected) return;
    try {
      await setStatus(selected.id, status);
      await load();
      toast({ title: `Marked as ${STATUS_LABEL[status].toLowerCase()}` });
    } catch (e) {
      toast({
        title: 'Could not update the status',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-[1300px] space-y-5 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold">Support tickets</h1>
              <p className="text-sm text-muted-foreground">
                Requests sent from the Support button. Reply, then set the status so the staff member
                knows where it stands.
              </p>
            </div>
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <SelectTrigger className="w-[220px] bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <SelectItem key={f} value={f}>
                  {FILTER_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {problem && <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{problem}</Card>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <Card className={`divide-y ${selected ? 'hidden lg:block' : ''}`}>
            {tickets === null ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
                <Inbox className="h-6 w-6" />
                No tickets in this view.
              </div>
            ) : (
              shown.map((t) => (
                <button
                  key={t.id}
                  onClick={() => select(t.id)}
                  className={`block w-full p-3 text-left hover:bg-muted/40 ${t.id === selectedId ? 'bg-muted/60' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{names[t.created_by] ?? 'Staff member'}</span>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.message}</p>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {format(new Date(t.created_at), "MMM d 'at' h:mm a")}
                    {t.attachments.length > 0 && ` · ${t.attachments.length} attachment${t.attachments.length === 1 ? '' : 's'}`}
                  </div>
                </button>
              ))
            )}
          </Card>

          {selected ? (
            <Card className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={() => select(null)}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    All tickets
                  </Button>
                  <div className="font-semibold">{names[selected.created_by] ?? 'Staff member'}</div>
                  <div className="text-xs text-muted-foreground">
                    Sent {format(new Date(selected.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </div>
                  {selected.page_url && (
                    <div className="mt-1 break-all text-xs text-muted-foreground">Page: {selected.page_url}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Select value={selected.status} onValueChange={(v) => void changeStatus(v as TicketStatus)}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <TicketThread
                ticket={selected}
                asSupport
                requesterName={names[selected.created_by] ?? 'Staff member'}
                onReplied={load}
              />
            </Card>
          ) : (
            <Card className="hidden place-items-center p-10 text-sm text-muted-foreground lg:grid">
              Select a ticket to read it and reply.
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
