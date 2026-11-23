// Support tickets: every request sent from the Support button. Superadmins only.
//
// The list on the left, the selected ticket on the right: who sent it, from
// which page, what they attached, and the conversation. Replies appear under
// Support for the person who asked; the status tells them where it stands.
import { PageShell } from '@/components/PageShell';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ticketTitle,
} from '@/lib/support';

type Filter = 'active' | TicketStatus | 'all';

const FILTER_LABEL: Record<Filter, string> = {
  active: 'Open and in progress',
  open: 'Open',
  in_progress: 'In progress',
  action_required: 'Action required',
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

  if (roleLoading) return <PageShell>{null}</PageShell>;
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
      <div className="mx-auto max-w-[1280px] space-y-6 p-4 md:px-9 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="animate-rise text-2xl md:text-[32px] font-semibold tracking-tight text-foreground">Support tickets</h1>
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
          <div className={`stagger space-y-2 ${selected ? 'hidden lg:block' : ''}`}>
            {tickets === null ? (
              <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Loading…</p>
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
                <Inbox className="h-7 w-7 animate-float" strokeWidth={1.5} />
                No tickets in this view.
              </div>
            ) : (
              shown.map((t) => (
                <button
                  key={t.id}
                  onClick={() => select(t.id)}
                  className={`block w-full rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                    t.id === selectedId
                      ? 'border-primary bg-accent shadow-[inset_0_0_0_0.5px_hsl(var(--primary))]'
                      : 'border-border bg-card hover:border-primary/30 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[15px] font-semibold ${t.id === selectedId ? 'text-primary' : 'text-foreground'}`}>{ticketTitle(t)}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] text-muted-foreground">
                    {names[t.created_by] ?? 'Staff member'} · {format(new Date(t.created_at), "MMM d 'at' h:mm a")}
                    {t.attachments.length > 0 && ` · ${t.attachments.length} attachment${t.attachments.length === 1 ? '' : 's'}`}
                  </div>
                </button>
              ))
            )}
          </div>

          {selected ? (
            <Card key={selected.id} className="animate-rise space-y-5 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-5">
                <div>
                  <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={() => select(null)}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    All tickets
                  </Button>
                  <div className="text-xl font-semibold text-foreground">{ticketTitle(selected)}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">
                    {names[selected.created_by] ?? 'Staff member'} · Sent {format(new Date(selected.created_at), "MMM d, yyyy 'at' h:mm a")}
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
            <Card className="hidden place-items-center border-dashed p-10 text-sm text-muted-foreground lg:grid">
              Select a ticket to read it and reply.
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
