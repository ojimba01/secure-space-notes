/**
 * A form with its history beside it: three saves by three people, one showing
 * an answer struck out and its replacement. The picture on the Edit history
 * announcement. Drawn inline so it scales cleanly and needs no image file.
 */
export const EditHistoryIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 360 200" className={className} role="img" aria-label="A form and its edit history">
    {/* Dot grids in the corners */}
    {Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (
        <circle key={`a${r}${c}`} cx={20 + c * 9} cy={22 + r * 9} r={1.6} fill="#1b6fb3" opacity={0.35} />
      )),
    )}
    {Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (
        <circle key={`b${r}${c}`} cx={300 + c * 9} cy={160 + r * 9} r={1.6} fill="#f08a3c" opacity={0.45} />
      )),
    )}

    {/* The form, behind */}
    <g transform="rotate(-6 100 110)">
      <rect x={58} y={48} width={84} height={112} rx={8} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <rect x={58} y={48} width={84} height={18} rx={8} fill="#0f4c81" />
      <rect x={58} y={58} width={84} height={8} fill="#0f4c81" />
      {[78, 92, 106, 120, 134].map((y, i) => (
        <rect key={y} x={70} y={y} width={i % 2 ? 46 : 60} height={6} rx={3} fill="#c9d6e4" />
      ))}
    </g>

    {/* The history card, in front */}
    <g>
      <rect x={128} y={36} width={170} height={132} rx={12} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      {/* A line joining the saves */}
      <line x1={150} y1={62} x2={150} y2={142} stroke="#d6e2ef" strokeWidth={3} strokeLinecap="round" />
      {[
        { y: 62, color: '#0f4c81' },
        { y: 102, color: '#f08a3c' },
        { y: 142, color: '#22a35a' },
      ].map(({ y, color }) => (
        <g key={y}>
          <circle cx={150} cy={y} r={9} fill={color} />
          <circle cx={150} cy={y - 2.5} r={3} fill="#ffffff" />
          <path d={`M144.5 ${y + 5.5} a5.5 4 0 0 1 11 0`} fill="#ffffff" />
          <rect x={166} y={y - 7} width={58} height={6} rx={3} fill="#9fb3c8" />
          <rect x={232} y={y - 7} width={28} height={6} rx={3} fill="#d6e2ef" />
        </g>
      ))}
      {/* Before and after, under the middle save */}
      <rect x={166} y={104} width={44} height={8} rx={2} fill="#fde2e1" />
      <line x1={168} y1={108} x2={208} y2={108} stroke="#d64541" strokeWidth={2} strokeLinecap="round" />
      <rect x={216} y={104} width={52} height={8} rx={2} fill="#dcf3e4" />
      <rect x={220} y={106.5} width={40} height={3} rx={1.5} fill="#22a35a" />
    </g>

    {/* The history badge: a clock with an arrow running back round it */}
    <g transform="translate(292 44)">
      <circle r={22} fill="#ffffff" stroke="#1b6fb3" strokeWidth={3} />
      <path d="M-11 -6 A13 13 0 1 1 -12 5" fill="none" stroke="#1b6fb3" strokeWidth={3} strokeLinecap="round" />
      <path d="M-17 -9 L-11 -6 L-9 -13" fill="none" stroke="#1b6fb3" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M0 -7 V1 L6 5" fill="none" stroke="#0f4c81" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* Sparkles and dots */}
    <circle cx={52} cy={176} r={3.5} fill="#1b6fb3" />
    <circle cx={110} cy={28} r={3} fill="#ffffff" />
    <circle cx={326} cy={112} r={4} fill="#ffffff" />
    <circle cx={40} cy={110} r={3} fill="#f08a3c" />
    <path d="M318 84 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5Z" fill="#ffffff" />
    <path d="M100 178 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#f08a3c" opacity={0.7} />
  </svg>
);
