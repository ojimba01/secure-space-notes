/**
 * A supervisor's comment on a form reaching the case manager: the picture on
 * the form comments announcement. Drawn inline so it needs no image file.
 */
export const FormCommentsIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 360 200" className={className} role="img" aria-label="A comment on a form, with a notification">
    {Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (
        <circle key={`a${r}${c}`} cx={20 + c * 9} cy={150 + r * 9} r={1.6} fill="#f08a3c" opacity={0.45} />
      )),
    )}
    {Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (
        <circle key={`b${r}${c}`} cx={300 + c * 9} cy={22 + r * 9} r={1.6} fill="#1b6fb3" opacity={0.35} />
      )),
    )}

    {/* The form */}
    <rect x={70} y={30} width={150} height={150} rx={12} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
    <rect x={70} y={30} width={150} height={20} rx={12} fill="#0f4c81" />
    <rect x={70} y={42} width={150} height={8} fill="#0f4c81" />
    {[64, 100, 136].map((y, i) => (
      <g key={y}>
        <rect x={84} y={y} width={i === 1 ? 64 : 48} height={5} rx={2.5} fill="#9fb3c8" />
        <rect
          x={84}
          y={y + 9}
          width={122}
          height={14}
          rx={4}
          fill={i === 1 ? '#fff4e5' : '#eef3f9'}
          stroke={i === 1 ? '#f0b93c' : '#c9d6e4'}
          strokeWidth={i === 1 ? 2 : 1}
        />
        <rect x={89} y={y + 14} width={i === 1 ? 40 : 56} height={4} rx={2} fill="#0f4c81" />
      </g>
    ))}

    {/* The comment on the highlighted answer */}
    <g>
      <path d="M210 92 h84 a10 10 0 0 1 10 10 v26 a10 10 0 0 1 -10 10 h-58 l-12 12 v-12 h-14 a10 10 0 0 1 -10 -10 v-26 a10 10 0 0 1 10 -10z" fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <circle cx={218} cy={106} r={6} fill="#0f4c81" />
      <rect x={230} y={102} width={56} height={5} rx={2.5} fill="#9fb3c8" />
      <rect x={210} y={118} width={78} height={4} rx={2} fill="#c9d6e4" />
      <rect x={210} y={126} width={52} height={4} rx={2} fill="#c9d6e4" />
    </g>

    {/* The notification bell */}
    <g transform="translate(286 62)">
      <circle r={16} fill="#f08a3c" />
      <path d="M-7 4h14l-3-4v-5a4 4 0 0 0-8 0v5z" fill="#ffffff" />
      <circle cy={7.5} r={2.2} fill="#ffffff" />
      <circle cx={11} cy={-11} r={6} fill="#d64541" stroke="#ffffff" strokeWidth={2} />
    </g>

    <circle cx={40} cy={60} r={3.5} fill="#1b6fb3" />
    <circle cx={248} cy={170} r={3} fill="#ffffff" />
    <circle cx={250} cy={40} r={4} fill="#f08a3c" />
    <path d="M330 120 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5Z" fill="#ffffff" />
    <path d="M40 104 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#f08a3c" opacity={0.7} />
  </svg>
);
