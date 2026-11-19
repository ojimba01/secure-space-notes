// A client's status as a soft coloured pill: green for active, amber for a
// case waiting on approval or a restart, grey for closed.
import React from 'react';
import { cn } from '@/lib/utils';

const TONES = {
  active: 'bg-success-soft text-success',
  waiting: 'bg-attention-soft text-attention ring-1 ring-inset ring-attention-border',
  closed: 'bg-muted text-muted-foreground',
} as const;

export const StatusPill: React.FC<{
  tone: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}> = ({ tone, children, className }) => (
  <span
    className={cn(
      'inline-flex animate-pop items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
      TONES[tone],
      className,
    )}
  >
    {tone === 'active' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-success" />}
    {children}
  </span>
);

/** Active, Closed, or another status word, as the pill shows it. */
export const statusWord = (status: string) =>
  status === 'active' ? 'Active' : status === 'closed' ? 'Closed' : status.charAt(0).toUpperCase() + status.slice(1);
