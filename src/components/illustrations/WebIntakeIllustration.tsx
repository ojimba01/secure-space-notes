/**
 * A web form, its answers flowing into the PDF beside it: the picture on the
 * web Client Intake announcement. Drawn inline so it needs no image file.
 */
export const WebIntakeIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 360 200" className={className} role="img" aria-label="A web form filling in a PDF">
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

    {/* The web form */}
    <g>
      <rect x={44} y={34} width={150} height={134} rx={12} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <rect x={44} y={34} width={150} height={20} rx={12} fill="#0f4c81" />
      <rect x={44} y={46} width={150} height={8} fill="#0f4c81" />
      <circle cx={56} cy={44} r={2.5} fill="#ffffff" opacity={0.7} />
      <circle cx={64} cy={44} r={2.5} fill="#ffffff" opacity={0.7} />
      {/* A question and its typed answer */}
      <rect x={56} y={64} width={52} height={5} rx={2.5} fill="#9fb3c8" />
      <rect x={56} y={73} width={126} height={14} rx={4} fill="#eef3f9" stroke="#c9d6e4" />
      <rect x={61} y={78} width={60} height={4} rx={2} fill="#0f4c81" />
      {/* A Yes / No question, Yes chosen */}
      <rect x={56} y={96} width={70} height={5} rx={2.5} fill="#9fb3c8" />
      <rect x={56} y={105} width={34} height={14} rx={4} fill="#0f4c81" />
      <rect x={64} y={110} width={18} height={4} rx={2} fill="#ffffff" />
      <rect x={95} y={105} width={34} height={14} rx={4} fill="#ffffff" stroke="#c9d6e4" />
      <rect x={103} y={110} width={18} height={4} rx={2} fill="#c9d6e4" />
      {/* Another question */}
      <rect x={56} y={128} width={44} height={5} rx={2.5} fill="#9fb3c8" />
      <rect x={56} y={137} width={126} height={14} rx={4} fill="#eef3f9" stroke="#c9d6e4" />
      <rect x={61} y={142} width={42} height={4} rx={2} fill="#0f4c81" />
    </g>

    {/* The answers travelling into the PDF */}
    <path
      d="M196 100 C 214 86, 228 86, 244 96"
      fill="none"
      stroke="#1b6fb3"
      strokeWidth={2.5}
      strokeDasharray="4 5"
      strokeLinecap="round"
    />
    <path d="M238 88 L246 97 L235 101" fill="none" stroke="#1b6fb3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

    {/* The PDF */}
    <g transform="rotate(6 286 110)">
      <path d="M252 52 H302 L320 70 V166 H252 Z" fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} strokeLinejoin="round" />
      <path d="M302 52 V70 H320" fill="#eef3f9" stroke="#d6e2ef" strokeWidth={2} strokeLinejoin="round" />
      <rect x={262} y={80} width={30} height={12} rx={3} fill="#d64541" />
      <text x={277} y={89.5} textAnchor="middle" fontSize={8} fontWeight={700} fill="#ffffff" fontFamily="inherit">
        PDF
      </text>
      {[102, 114, 126, 138, 150].map((y, i) => (
        <rect key={y} x={262} y={y} width={i % 2 ? 34 : 46} height={5} rx={2.5} fill={i < 3 ? '#9fb3c8' : '#d6e2ef'} />
      ))}
    </g>

    {/* A check: filled in */}
    <g transform="translate(316 152)">
      <circle r={13} fill="#22a35a" />
      <path d="m-6 0 4 4 8-8" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* Sparkles and dots */}
    <circle cx={30} cy={60} r={3.5} fill="#1b6fb3" />
    <circle cx={220} cy={150} r={3} fill="#ffffff" />
    <circle cx={226} cy={40} r={4} fill="#f08a3c" />
    <path d="M214 120 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5Z" fill="#ffffff" />
    <path d="M30 104 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2Z" fill="#f08a3c" opacity={0.7} />
  </svg>
);
