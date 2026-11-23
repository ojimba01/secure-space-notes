// One client in the Clients table: name and status, member ID, insurance,
// case manager (admins), the authorization that is due next, and a menu for
// closing, reopening or restarting the case.
import React from 'react';
import { ArrowRight, MoreHorizontal, RotateCcw, Archive, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDay } from '@/lib/dates';
import { isCaseClosed, isSetupComplete, missingSetupShort } from '@/lib/workflow';
import { cn } from '@/lib/utils';
import { clientListFacts, type Client } from '@/components/ClientCard';

const TONE: Record<string, string> = {
  danger: 'text-danger',
  attention: 'text-attention',
  muted: 'text-muted-foreground',
  done: 'text-success',
};

/** The grid every row and the header share, so the columns line up. */
export const clientGrid = (showManager: boolean, selectionMode: boolean) =>
  cn(
    'md:grid md:items-center md:gap-4',
    selectionMode ? 'md:pl-1' : '',
    showManager
      ? 'md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)_72px]'
      : 'md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_72px]',
  );

export const ClientTableHeader: React.FC<{ showManager: boolean; selectionMode: boolean }> = ({ showManager, selectionMode }) => (
  <div className={cn('hidden border-b border-border px-6 py-3 text-xs font-medium text-muted-foreground', clientGrid(showManager, selectionMode))}>
    <span>Client</span>
    <span>Member ID</span>
    <span>Insurance</span>
    {showManager && <span>Case manager</span>}
    <span>Authorization</span>
    <span className="sr-only">Actions</span>
  </div>
);

interface ClientRowProps {
  client: Client;
  onSelect: (client: Client) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  showManager?: boolean;
  assignedManagerName?: string | null;
  onCloseCase?: (client: Client) => void;
  onReopenCase?: (client: Client) => void;
  onRestart?: (client: Client) => void;
  acknowledgedEnds?: Set<string>;
  onAcknowledgeEnd?: (client: Client, endDate: string) => void;
}

export const ClientRow: React.FC<ClientRowProps> = ({
  client,
  onSelect,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  showManager = false,
  assignedManagerName = null,
  onCloseCase,
  onReopenCase,
  onRestart,
  acknowledgedEnds,
  onAcknowledgeEnd,
}) => {
  const { restartPending, pendingNext, milestones, pendingApproval, latestEnd, authEnded } =
    clientListFacts(client, acknowledgedEnds);
  const name = `${client.first_name} ${client.last_name}`;
  const closed = isCaseClosed(client);

  // The authorization that matters now: the first one not finished, or the
  // last one when all are.
  const current = milestones.find((m) => !m.finished) ?? milestones[milestones.length - 1];

  const statusLine = (() => {
    if (closed) return { text: 'Closed', tone: 'text-muted-foreground' };
    if (restartPending) return { text: 'Restart pending', tone: 'text-attention' };
    if (pendingApproval) return { text: 'Pending approval', tone: 'text-attention' };
    return { text: client.status === 'active' ? 'Active' : client.status, tone: 'text-muted-foreground' };
  })();
  const missing = !isSetupComplete(client) && !restartPending ? missingSetupShort(client) : [];

  const open = () => (selectionMode && onToggleSelect ? onToggleSelect(client.id) : onSelect(client));
  const hasMenu = !selectionMode && (onCloseCase || onReopenCase || onRestart);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      }}
      aria-label={`Open ${name}`}
      className={cn(
        'group relative cursor-pointer px-6 py-4 transition-colors',
        'hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
        selected && 'bg-accent/70 hover:bg-accent',
        clientGrid(showManager, selectionMode),
      )}
    >
      {/* An ended authorization marks the row's edge until it is acknowledged. */}
      {authEnded && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-danger" />}

      <div className="flex min-w-0 items-start gap-3">
        {selectionMode && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect?.(client.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${name}`}
            className="mt-0.5"
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-foreground" title={name}>{name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px]">
            <span className={statusLine.tone}>{statusLine.text}</span>
            {(client.billing_round ?? 1) > 1 && <span className="text-muted-foreground">· Round {client.billing_round}</span>}
            {missing.map((part) => (
              <span key={part} className="text-attention">· {part.charAt(0).toUpperCase() + part.slice(1)}</span>
            ))}
            {pendingNext && (
              <span className="inline-flex items-center gap-1 text-danger">
                · <AlertTriangle className="h-3 w-3" /> Next action overdue
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2 text-sm text-foreground/80 md:mt-0">
        <span className="text-muted-foreground md:hidden">Member ID </span>{client.member_id || '—'}
      </div>
      <div className="text-sm text-foreground/80">
        <span className="text-muted-foreground md:hidden">Insurance </span>{client.insurance || '—'}
      </div>
      {showManager && (
        <div className={cn('truncate text-sm', assignedManagerName ? 'text-foreground/80' : 'font-medium text-danger')}>
          {assignedManagerName ?? 'Unassigned'}
        </div>
      )}

      <div className="mt-1 min-w-0 md:mt-0">
        {authEnded && latestEnd ? (
          <div className="text-sm">
            <span className="font-medium text-danger">Ended {formatDay(latestEnd)}</span>
            {onAcknowledgeEnd && !selectionMode && (
              <button
                type="button"
                className="block text-[13px] font-medium text-primary underline-offset-2 hover:underline"
                onClick={(e) => { e.stopPropagation(); onAcknowledgeEnd(client, latestEnd); }}
              >
                Acknowledge
              </button>
            )}
          </div>
        ) : current ? (
          <>
            <div className={cn('text-sm font-medium', TONE[current.status.tone ?? 'muted'])}>{current.status.label}</div>
            <div className="text-xs text-muted-foreground">{current.label} · {current.due.toLocaleDateString()}</div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">No authorization dates yet</div>
        )}
      </div>

      <div className="absolute right-4 top-4 flex items-center justify-end gap-1 md:static">
        {hasMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground opacity-70 transition hover:bg-card hover:text-foreground hover:opacity-100 group-hover:opacity-100"
                aria-label={`More for ${name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              {onRestart && !closed && (
                <DropdownMenuItem onSelect={() => onRestart(client)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {restartPending ? 'Add start date' : 'Restart authorization'}
                </DropdownMenuItem>
              )}
              {onReopenCase && closed && (
                <DropdownMenuItem onSelect={() => onReopenCase(client)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reopen case
                </DropdownMenuItem>
              )}
              {onCloseCase && !closed && (
                <DropdownMenuItem onSelect={() => onCloseCase(client)} className="text-destructive focus:text-destructive">
                  <Archive className="mr-2 h-4 w-4" />
                  Close case
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {!selectionMode && <ArrowRight className="nudge hidden h-4 w-4 text-primary md:block" />}
      </div>
    </div>
  );
};
