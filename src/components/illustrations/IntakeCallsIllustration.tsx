/**
 * A missed intake call reaching the supervisor: the picture on the intake
 * calls announcement. Drawn inline so it needs no image file.
 */
export const IntakeCallsIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 360 200" className={className} role="img" aria-label="A missed call sent to a supervisor">
    {/* Dot grids in the corners */}
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

    {/* The phone, with a missed call */}
    <g>
      <rect x={58} y={30} width={92} height={150} rx={16} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <rect x={90} y={38} width={28} height={5} rx={2.5} fill="#d6e2ef" />
      {/* The call card */}
      <rect x={68} y={58} width={72} height={84} rx={10} fill="#eef3f9" />
      <circle cx={104} cy={86} r={18} fill="#fde8e7" />
      {/* Handset */}
      <path
        d="M96 79c0 9 7 16 16 16l3-4-5-3-2 2c-3-1-5-3-6-6l2-2-3-5z"
        fill="#d64541"
      />
      {/* Missed: a small arrow away */}
      <path d="M112 74 l6 -6 M113 68 h5 v5" fill="none" stroke="#d64541" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={82} y={114} width={44} height={5} rx={2.5} fill="#9fb3c8" />
      <rect x={88} y={124} width={32} height={4} rx={2} fill="#c9d6e4" />
      {/* The No answer button */}
      <rect x={72} y={150} width={64} height={18} rx={6} fill="#ffffff" stroke="#f0b93c" strokeWidth={2} />
      <rect x={86} y={157} width={36} height={4} rx={2} fill="#b7791f" />
    </g>

    {/* The report travelling to the supervisor */}
    <path
      d="M156 104 C 182 84, 206 84, 228 96"
      fill="none"
      stroke="#1b6fb3"
      strokeWidth={2.5}
      strokeDasharray="4 5"
      strokeLinecap="round"
    />
    <path d="M221 88 L230 97 L218 101" fill="none" stroke="#1b6fb3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

    {/* The supervisor, notified */}
    <g>
      <rect x={236} y={62} width={92} height={92} rx={14} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <circle cx={282} cy={96} r={16} fill="#0f4c81" />
      <circle cx={282} cy={91} r={6} fill="#ffffff" />
      <path d="M271 106c2-6 6-8 11-8s9 2 11 8" fill="#ffffff" />
      <rect x={258} y={122} width={48} height={5} rx={2.5} fill="#9fb3c8" />
      <rect x={266} y={132} width={32} height={4} rx={2} fill="#c9d6e4" />
      {/* Bell */}
      <g transform="translate(318 66)">
        <circle r={13} fill="#f08a3c" />
        <path d="M-5 3h10l-2-3v-4a3 3 0 0 0-6 0v4z" fill="#ffffff" />
        <circle cy={5.5} r={1.8} fill="#ffffff" />
      </g>
    </g>

    {/* Sparkles and dots */}
    <circle cx={34} cy={58} r={3.5} fill="#1b6fb3" />
    <circle cx={196} cy={150} r={3} fill="#ffffff" />
    <circle cx={204} cy={44} r={4} fill="#f08a3c" />
    <path d="M190 120 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5Z" fill="#ffffff" />
    <path d="M30 104 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#f08a3c" opacity={0.7} />
  </svg>
);
