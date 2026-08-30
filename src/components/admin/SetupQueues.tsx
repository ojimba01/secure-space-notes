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
import { ChevronRight, UserX, Gauge, CalendarX, FileX, CircleDollarSign } from 'lucide-react';
import { useAdminSetupQueues, type QueueKey, type QueueClient } from '@/hooks/useAdminSetupQueues';
import { ClientRecordDialog } from '@/components/ClientRecordDialog';

interface Props {
  /** Open a client's record. The only thing any of these rows can usefully do. */
  onOpenClient: (clientId: string) => void;
}

interface QueueMeta {
  key: QueueKey;
  label: string;
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
    label: 'claims to file this week',
    action:
      'These claims must be filed within seven days. After the six-month window closes the money cannot be claimed. Billing, step one, is where they are filed.',
    icon: <CircleDollarSign className="h-5 w-5" />,
    empty: 'No filing deadline falls within the next seven days.',
  },
  {
    key: 'unassigned',
    label: 'clients missing a case manager',
    action:
      'A client with no case manager appears in nobody’s work queue and is scheduled no touchpoints. Assign one on the client record.',
    icon: <UserX className="h-5 w-5" />,
    empty: 'Every active client has a case manager.',
  },
  {
    key: 'noLevelOfNeed',
    label: 'clients missing a LoN',
    action:
      'Without a level of need there is no rate, so cycles are created on hold, and no touchpoint requirement can be worked out. Record the score on the client record.',
    icon: <Gauge className="h-5 w-5" />,
    empty: 'Every active client has a level of need.',
  },
  {
    key: 'noStartDate',
    label: 'clients missing a 30-day start date',
    action:
      'Billing cycles and touchpoint windows are both counted from the HSP approval or authorization start date. Without one, neither can be created.',
    icon: <CalendarX className="h-5 w-5" />,
    empty: 'Every active client has a start date.',
  },
  {
    key: 'noHsp',
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
  onClick: () => void;
}> = ({ meta, count, active, onClick }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`text-left rounded-lg border p-4 transition-colors hover:bg-muted/60 ${
      active ? 'ring-2 ring-primary' : ''
    } ${count > 0 && meta.key === 'billingDueThisWeek' ? 'border-amber-300 bg-amber-50' : ''}`}
  >
    <div className="flex items-center gap-2 text-muted-foreground">{meta.icon}</div>
    <div className="text-sm mt-1">
      <span className="text-2xl font-semibold">{count}</span>{' '}
      <span>{meta.label}</span>
    </div>
  </button>
);

const Row: React.FC<{ c: QueueClient; showDeadline: boolean; onOpen: () => void }> = ({
  c,
  showDeadline,
  onOpen,
}) => (
  <button
    onClick={onOpen}
    className="w-full text-left rounded-md border p-3 hover:bg-muted/50 flex items-center justify-between gap-3"
  >
    <div className="min-w-0">
      <div className="font-medium truncate">{c.name}</div>
      <div className="text-xs text-muted-foreground truncate">
        {c.staffName ?? 'No case manager'}
        {c.insurance ? ` · ${c.insurance}` : ''}
        {showDeadline && c.cycleLabel ? ` · ${c.cycleLabel}` : ''}
      </div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {showDeadline && c.daysLeft !== undefined && (
        <Badge variant={c.daysLeft <= 2 ? 'destructive' : 'secondary'}>
          {c.daysLeft <= 0
            ? 'Last day'
            : `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left`}
        </Badge>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  </button>
);

/** How many rows to show before asking whether the rest are wanted. */
const PREVIEW = 12;

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
      <div>
        <h2 className="text-lg font-semibold">Priorities</h2>
        <p className="text-sm text-muted-foreground">
          {loading
            ? 'Loading.'
            : `${blockedClients} of ${activeClients} clients are missing something. A client missing two things is counted twice below.`}
        </p>
      </div>

      <div data-tutorial="priority-tiles" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {QUEUES.map((q) => (
          <Tile
            key={q.key}
            meta={q}
            count={queues[q.key].length}
            active={open === q.key}
            onClick={() => select(q.key)}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {list.length} {meta.label}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{meta.action}</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading.</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">{meta.empty}</p>
          ) : (
            <>
              {shown.map((c) => (
                <Row
                  key={c.id}
                  c={c}
                  showDeadline={open === 'billingDueThisWeek'}
                  onOpen={() => setOpenClientId(c.id)}
                />
              ))}
              {list.length > PREVIEW && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show fewer' : `Show the remaining ${list.length - PREVIEW}`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <ClientRecordDialog
        clientId={openClientId}
        onClose={() => setOpenClientId(null)}
        onChanged={reload}
      />
    </div>
  );
};
