/**
 * A form flying up to a cloud with a check mark: the picture on the autosave
 * announcement. Drawn inline so it scales cleanly and needs no image file.
 */
export const AutosaveIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 360 200" className={className} role="img" aria-label="A form saving to the cloud">
    {/* Dot grids in the corners */}
    {Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (
        <circle key={`a${r}${c}`} cx={22 + c * 9} cy={150 + r * 9} r={1.6} fill="#f08a3c" opacity={0.45} />
      )),
    )}
    {Array.from({ length: 3 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => (
        <circle key={`b${r}${c}`} cx={300 + c * 9} cy={22 + r * 9} r={1.6} fill="#1b6fb3" opacity={0.35} />
      )),
    )}

    {/* Dashed path from the form up to the cloud */}
    <path
      d="M150 128 C 170 95, 185 120, 205 92 S 232 70, 238 66"
      fill="none"
      stroke="#1b6fb3"
      strokeWidth={2}
      strokeDasharray="4 5"
      strokeLinecap="round"
      opacity={0.7}
    />

    {/* The form */}
    <g transform="rotate(-8 115 125)">
      <rect x={72} y={70} width={86} height={110} rx={8} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <rect x={72} y={70} width={86} height={20} rx={8} fill="#0f4c81" />
      <rect x={72} y={82} width={86} height={8} fill="#0f4c81" />
      {[102, 116, 130, 144].map((y, i) => (
        <g key={y}>
          <rect x={84} y={y} width={10} height={8} rx={2} fill={i < 3 ? '#22a35a' : '#e3eaf2'} />
          <rect x={100} y={y + 1} width={i % 2 ? 36 : 46} height={6} rx={3} fill="#c9d6e4" />
        </g>
      ))}
      <rect x={84} y={160} width={40} height={8} rx={4} fill="#f08a3c" opacity={0.85} />
    </g>

    {/* The cloud with its check mark */}
    <g transform="translate(222 22)">
      <path
        d="M78 76H34a26 26 0 1 1 8.6-50.5A32 32 0 0 1 103 40a18 18 0 0 1-25 36Z"
        fill="#ffffff"
        stroke="#1b6fb3"
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <circle cx={62} cy={50} r={17} fill="#22a35a" />
      <path d="m54 50 6 6 11-11" fill="none" stroke="#fff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* A small timer badge: saved 10 seconds after typing stops */}
    <g transform="translate(176 140)">
      <circle r={20} fill="#ffffff" stroke="#f08a3c" strokeWidth={3} />
      <text textAnchor="middle" y={5} fontSize={13} fontWeight={700} fill="#f08a3c" fontFamily="inherit">
        10s
      </text>
    </g>

    {/* Sparkles and dots */}
    <circle cx={205} cy={40} r={3.5} fill="#1b6fb3" />
    <circle cx={190} cy={168} r={3} fill="#ffffff" />
    <circle cx={60} cy={52} r={4} fill="#ffffff" />
    <circle cx={330} cy={150} r={4} fill="#f08a3c" />
    <circle cx={250} cy={150} r={3} fill="#ffffff" />
    <path d="M300 112 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" fill="#ffffff" />
    <path d="M44 100 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#1b6fb3" opacity={0.6} />
  </svg>
);
