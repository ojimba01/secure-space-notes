// The admin landing screen: what is stopping work, and who can unstop it.
//
// The page used to open on three counts — total clients, total calendar
// events, active staff. None of them was a number anyone had a decision to
// make about, and "total events" counted every calendar row in the database.
//
// These five are decisions. Four are a client who cannot be worked until
// somebody fills something in; the fifth is money that stops being claimable
// on a date. Every row opens the client, because that is where the fixing
// happens.
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, ArrowRight, UserX, Gauge, CalendarX, FileX, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/motion/CountUp';
import { DrawnCheck } from '@/components/motion/DrawnCheck';
import { useAdminSetupQueues, type QueueKey, type QueueClient } from '@/hooks/useAdminSetupQueues';
import { ClientRecordDialog } from '@/components/ClientRecordDialog';


interface QueueMeta {
  key: QueueKey;
  label: string;
  /** The tile's label, as a sentence. */
  title: string;
  /** What the tile leads to, under its label. */
  link: string;
  /** What the number means, said once here rather than on every row. */
  /** What to do about it, shown above the list. */
  action: string;
  icon: React.ReactNode;
  /** Nothing in this list is good news, so an empty one gets its own sentence. */
  empty: string;
}

const QUEUES: QueueMeta[] = [
  {
    key: 'billingDueThisWeek',
    title: 'Urgent claims this week',
    link: 'File before the deadline',
    label: 'urgent claims this week',
    action:
      'These claims must be filed within seven days. After the six-month window closes the money cannot be claimed. Billing, step one, is where they are filed.',
    icon: <Clock className="h-5 w-5" />,
    empty: 'No filing deadline falls within the next seven days.',
  },
  {
    key: 'unassigned',
    title: 'Clients missing a case manager',
    link: 'Assign a case manager',
    label: 'clients missing a case manager',
    action:
      'A client with no case manager appears in nobody’s work queue and is scheduled no touchpoints. Assign one on the client record.',
    icon: <UserX className="h-5 w-5" />,
    empty: 'Every active client has a case manager.',
  },
  {
    key: 'noLevelOfNeed',
    title: 'Clients missing LON',
    link: 'Record a level of need',
    label: 'clients missing LON',
    action:
      'Without a level of need there is no rate, so cycles are created on hold, and no touchpoint requirement can be worked out. Record the score on the client record.',
    icon: <Gauge className="h-5 w-5" />,
    empty: 'Every active client has a level of need.',
  },
  {
    key: 'noStartDate',
    title: 'Clients missing a 30-day start date',
    link: 'Record a start date',
    label: 'clients missing a 30-day start date',
    action:
      'Billing cycles and touchpoint windows are both counted from the HSP approval or authorization start date. Without one, neither can be created.',
    icon: <CalendarX className="h-5 w-5" />,
    empty: 'Every active client has a start date.',
  },
  {
    key: 'restartPending',
    title: 'Restarts waiting for a start date',
    link: 'Add a start date',
    label: 'restarts waiting for a start date',
    action: 'Billing and touchpoints wait until the start date is added. Open the client and choose Complete restart on the Authorizations tab.',
    icon: <RotateCcw className="h-5 w-5" />,
    empty: 'No restart is waiting for a start date.',
  },
  {
    key: 'noHsp',
    title: 'HSPs not submitted',
    link: 'Review outstanding plans',
    label: 'HSPs not submitted',
    action:
      'A client is not shown to their case manager until the plan is submitted. Many of these are still inside their first thirty days, which is why they were left alone.',
    icon: <FileX className="h-5 w-5" />,
    empty: 'Every active client has a submitted plan.',
  },
];

const Tile: React.FC<{
  meta: QueueMeta;
  count: number;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}> = ({ meta, count, active, loading, onClick }) => {
  const urgent = count > 0 && meta.key === 'billingDueThisWeek';
  const empty = !loading && count === 0;
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'lift group flex flex-col rounded-xl border bg-card p-5 text-left',
        urgent ? 'border-attention-border bg-attention-soft' : 'border-border',
        active && (urgent ? 'ring-2 ring-attention/40' : 'ring-2 ring-primary/30 border-primary/40'),
      )}
    >
      <div className={cn('flex items-center gap-3', urgent ? 'text-attention' : empty ? 'text-muted-foreground' : 'text-foreground/70')}>
        <span className="wiggle-on-hover [&_svg]:h-5 [&_svg]:w-5">{meta.icon}</span>
        <CountUp
          value={loading ? 0 : count}
          className={cn('text-[32px] font-semibold leading-none tabular-nums', urgent ? 'text-attention' : empty ? 'text-muted-foreground' : 'text-foreground')}
        />
      </div>
      <div className="mt-4 text-[15px] text-foreground">{meta.title}</div>
      <div className="mt-3 flex items-center justify-between text-[13px]">
        {empty ? (
          <span className="text-muted-foreground">No outstanding items</span>
        ) : (
          <>
            <span className={cn('font-medium', urgent ? 'text-attention' : 'text-primary')}>{meta.link}</span>
            <ArrowRight className={cn('nudge h-4 w-4', urgent ? 'text-attention' : 'text-primary')} />
          </>
        )}
      </div>
    </button>
  );
};

const gridFor = (key: QueueKey) =>
  key === 'billingDueThisWeek'
    ? 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_64px_120px_24px]'
    : key === 'restartPending'
    ? 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_24px]'
    : 'md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_24px]';

const Row: React.FC<{ c: QueueClient; queue: QueueKey; onOpen: () => void }> = ({
  c,
  queue,
  onOpen,
}) => {
  const showDeadline = queue === 'billingDueThisWeek';
  const showSince = queue === 'restartPending';
  return (
  <button
    onClick={onOpen}
    className={cn(
      'group w-full px-6 py-4 text-left transition-colors hover:bg-muted/50 md:grid md:items-center md:gap-4',
      gridFor(queue),
    )}
  >
    <div className="truncate text-[15px] font-semibold text-foreground">{c.name}</div>
    <div className={cn('truncate text-sm', c.staffName ? 'text-foreground/75' : 'font-medium text-danger')}>
      {c.staffName ?? 'No case manager'}
    </div>
    <div className="truncate text-sm text-foreground/75">{c.insurance ?? '—'}</div>
    {showDeadline ? (
      <>
        <div className="text-sm text-foreground/75">{c.cycleLabel ?? '—'}</div>
        <div>
          {c.daysLeft !== undefined && (
            <span
              className={cn(
                'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                c.daysLeft <= 2 ? 'bg-danger/10 text-danger' : 'bg-accent text-primary',
              )}
            >
              {c.daysLeft <= 0 ? 'Last day' : `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left`}
            </span>
          )}
        </div>
      </>
    ) : showSince ? (
      <div className="text-sm text-muted-foreground">
        {c.pendingSince ? new Date(c.pendingSince).toLocaleDateString() : '—'}
      </div>
    ) : null}
    <ChevronRight className="nudge hidden h-4 w-4 text-muted-foreground md:block" />
  </button>
  );
};

/** How many rows to show before asking whether the rest are wanted. */
const PREVIEW = 6;

export const SetupQueues: React.FC = () => {
  /**
   * The client opens here rather than on the clients page.
   *
   * A queue is worked through one client after another. Leaving the page for
   * each one and finding your way back is most of the work, and the reason
   * these queues go unworked.
   */
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const { loading, error, activeClients, blockedClients, queues, reload } = useAdminSetupQueues();
  const [open, setOpen] = useState<QueueKey>('billingDueThisWeek');
  const [showAll, setShowAll] = useState(false);

  const meta = QUEUES.find((q) => q.key === open)!;
  const list = queues[open];
  const shown = showAll ? list : list.slice(0, PREVIEW);

  const select = (key: QueueKey) => {
    setOpen(key);
    setShowAll(false);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 space-y-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={reload}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold text-foreground">Priorities</h2>
        {!loading && (
          <span className="text-sm text-muted-foreground">
            {blockedClients} of {activeClients} clients need attention
          </span>
        )}
      </div>

      <div data-tutorial="priority-tiles" className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUEUES.map((q) => (
          <Tile
            key={q.key}
            meta={q}
            count={queues[q.key].length}
            active={open === q.key}
            loading={loading}
            onClick={() => select(q.key)}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">A client missing more than one item is counted in each category.</p>

      <Card key={open} className="animate-rise overflow-hidden">
        <div className="px-6 pb-4 pt-6">
          <h3 className="text-xl font-semibold text-foreground">
            {loading ? meta.title : `${list.length} ${meta.label}`}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{meta.action}</p>
        </div>
        {loading ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Loading.</p>
        ) : list.length === 0 ? (
          <div className="flex items-center gap-3 px-6 pb-6 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success">
              <DrawnCheck className="h-4 w-4" delay={150} />
            </span>
            {meta.empty}
          </div>
        ) : (
          <>
            <div
              className={cn(
                'hidden border-y border-border bg-muted/50 px-6 py-2.5 text-xs font-medium text-muted-foreground md:grid md:gap-4',
                gridFor(open),
              )}
            >
              <span>Client</span>
              <span>Case manager</span>
              <span>Insurance</span>
              {open === 'billingDueThisWeek' ? <><span>Cycle</span><span>Time left</span></> : open === 'restartPending' ? <span>Waiting since</span> : null}
              <span />
            </div>
            <div className="stagger divide-y divide-border/70">
              {shown.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  queue={open}
                  onOpen={() => setOpenClientId(c.id)}
                />
              ))}
            </div>
            {list.length > PREVIEW && (
              <div className="flex items-center justify-between border-t border-border px-6 py-3 text-[13px]">
                <span className="text-muted-foreground">
                  Showing {shown.length} of {list.length}
                </span>
                <button type="button" className="group inline-flex items-center gap-2 font-medium text-primary" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `View all ${list.length}`}
                  <ArrowRight className="nudge h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </Card>
      <ClientRecordDialog
        clientId={openClientId}
        onClose={() => setOpenClientId(null)}
        onChanged={reload}
      />
    </div>
  );
};
