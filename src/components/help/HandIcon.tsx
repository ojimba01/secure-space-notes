// The walkthrough's cartoon glove: white, dark outline, pointing up.
import React from 'react';

export const HandIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg viewBox="0 0 96 110" fill="none" aria-hidden className={className} style={style}>
    <path
      d="M30 8c5 0 9 4 9 9v34l4-3c4-3 10-1 12 3l2 4 4-2c5-2 10 0 12 5l1 3 3-1c5-1 10 2 11 7l2 14c2 14-6 27-20 30l-12 2c-12 2-24-4-30-15L13 70c-3-5 0-11 6-12 3-1 6 1 8 3l-6-1V17c0-5 4-9 9-9Z"
      fill="#ffffff"
      stroke="#1b3544"
      strokeWidth="4"
      strokeLinejoin="round"
    />
    <path d="M39 51v14M57 56v12M74 63v9" stroke="#1b3544" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M27 92c6 6 14 9 22 8" stroke="#1b3544" strokeWidth="3" strokeLinecap="round" opacity=".25" />
    <path d="M22 98l-6 8h44l-4-9" fill="#155780" stroke="#1b3544" strokeWidth="4" strokeLinejoin="round" />
  </svg>
);
