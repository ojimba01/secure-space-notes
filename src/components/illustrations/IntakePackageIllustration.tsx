/**
 * A new member's package moving from the call to a reviewed set of forms:
 * the picture on the Intake calls page announcement. Drawn inline.
 */
export const IntakePackageIllustration = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 360 200" className={className} role="img" aria-label="A call leading to a reviewed set of forms">
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

    {/* The call */}
    <g transform="translate(78 100)">
      <circle r={30} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
      <circle r={20} fill="#e3eefa" />
      <path d="M-8 -7c0 10 6 16 16 16l3-4-5-3-2 2c-3-1-5-3-6-6l2-2-3-5z" fill="#0f4c81" />
    </g>

    <path d="M114 100 C 132 86, 146 86, 160 96" fill="none" stroke="#1b6fb3" strokeWidth={2.5} strokeDasharray="4 5" strokeLinecap="round" />
    <path d="M153 88 L162 97 L150 101" fill="none" stroke="#1b6fb3" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

    {/* The package: four forms, each checked */}
    <rect x={170} y={34} width={140} height={136} rx={12} fill="#ffffff" stroke="#d6e2ef" strokeWidth={2} />
    {[52, 82, 112, 142].map((y, i) => (
      <g key={y}>
        <rect x={184} y={y} width={112} height={22} rx={6} fill={i < 3 ? '#e9f7ef' : '#eef3f9'} stroke={i < 3 ? '#9fd8b4' : '#c9d6e4'} />
        <rect x={194} y={y + 9} width={i % 2 ? 38 : 52} height={5} rx={2.5} fill={i < 3 ? '#2f855a' : '#9fb3c8'} />
        {i < 3 ? (
          <g transform={`translate(${282} ${y + 11})`}>
            <circle r={7} fill="#22a35a" />
            <path d="m-3.5 0 2.5 2.5 4.5-4.5" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : (
          <circle cx={282} cy={y + 11} r={6} fill="none" stroke="#9fb3c8" strokeWidth={2} strokeDasharray="3 3" />
        )}
      </g>
    ))}

    <circle cx={40} cy={60} r={3.5} fill="#1b6fb3" />
    <circle cx={140} cy={160} r={3} fill="#ffffff" />
    <circle cx={150} cy={44} r={4} fill="#f08a3c" />
    <path d="M330 130 l2.5 6.5 6.5 2.5 -6.5 2.5 -2.5 6.5 -2.5 -6.5 -6.5 -2.5 6.5 -2.5Z" fill="#ffffff" />
  </svg>
);
