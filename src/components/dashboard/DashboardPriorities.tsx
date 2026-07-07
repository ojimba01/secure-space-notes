import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, CalendarClock, AlertTriangle, FileWarning, Clock } from 'lucide-react';
import {
  useDashboardPriorities,
  PriorityItem,
  PriorityKind,
} from '@/hooks/useDashboardPriorities';

interface CardDef {
  kind: PriorityKind;
  title: string;
  icon: React.ReactNode;
  items: PriorityItem[];
  tone: string;
}

interface Props {
  onOpenClient?: (clientId: string) => void;
}

export const DashboardPriorities: React.FC<Props> = ({ onOpenClient }) => {
  const { loading, billingDue48, billingOverdue, hspToSubmit, touchpointsDue48 } =
    useDashboardPriorities();
  const [active, setActive] = useState<CardDef | null>(null);
  const [index, setIndex] = useState(0);

  const cards: CardDef[] = [
    {
      kind: 'billing_due_48',
      title: 'Billing claims due within 48 hours',
      icon: <CalendarClock className="h-4 w-4" />,
      items: billingDue48,
      tone: 'text-amber-600',
    },
    {
      kind: 'billing_overdue',
      title: 'Overdue billing claims',
      icon: <AlertTriangle className="h-4 w-4" />,
      items: billingOverdue,
      tone: 'text-red-600',
    },
    {
      kind: 'hsp_to_submit',
      title: 'HSPs need to be submitted',
      icon: <FileWarning className="h-4 w-4" />,
      items: hspToSubmit,
      tone: 'text-blue-600',
    },
    {
      kind: 'touchpoints_due_48',
      title: 'Touchpoints due within 48 hours',
      icon: <Clock className="h-4 w-4" />,
      items: touchpointsDue48,
      tone: 'text-purple-600',
    },
  ];

  const openCard = (card: CardDef) => {
    if (card.items.length === 0) return;
    setActive(card);
    setIndex(0);
  };

  const current = active?.items[index] ?? null;
  const total = active?.items.length ?? 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <button
            key={card.kind}
            type="button"
            onClick={() => openCard(card)}
            disabled={card.items.length === 0}
            className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg disabled:cursor-default"
          >
            <Card className={card.items.length > 0 ? 'hover:border-primary transition-colors h-full' : 'opacity-70 h-full'}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium leading-snug pr-2">{card.title}</CardTitle>
                <span className={card.tone}>{card.icon}</span>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{loading ? '—' : card.items.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {loading
                    ? 'Loading…'
                    : card.items.length === 0
                    ? 'Nothing needs attention'
                    : 'Click to review'}
                </p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{active?.title}</DialogTitle>
            <DialogDescription>
              {total > 0 ? `Item ${index + 1} of ${total}` : 'No items'}
            </DialogDescription>
          </DialogHeader>

          {current && (
            <div className="space-y-3 py-2">
              <div>
                <p className="text-lg font-semibold">{current.clientName}</p>
                <p className="text-sm text-muted-foreground">
                  Case manager: {current.staffName ?? 'Unassigned'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {current.levelOfNeed ?? 'Missing level of need'}
                </Badge>
              </div>
              <p className="text-sm">{current.detail}</p>
              {onOpenClient && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onOpenClient(current.clientId);
                    setActive(null);
                  }}
                >
                  Open client
                </Button>
              )}
            </div>
          )}

          <DialogFooter className="flex-row items-center justify-between sm:justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setActive(null)}>
              Back
            </Button>
            {total > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                  disabled={index === total - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
