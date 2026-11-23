// A check mark that draws itself in, for something just completed.
import React from 'react';
import { cn } from '@/lib/utils';

export const DrawnCheck: React.FC<{ className?: string; delay?: number }> = ({ className, delay = 0 }) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden className={cn('shrink-0', className)}>
    <path
      d="M3 8.5l3.2 3.2L13 4.8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray="16"
      className="animate-draw"
      style={{ ['--draw-length' as string]: '16', animationDelay: `${delay}ms` }}
    />
  </svg>
);
