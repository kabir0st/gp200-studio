import { AMP_STACKS } from './copy';

/**
 * A half-stack — head on top of a 4x12 — in the livery of one of the amps the
 * GP-200 actually models. The left one is dressed as a Marshall® JCM800 (gold
 * plexi panel, white piping, salt-and-pepper cloth), the right as a Soldano®
 * SLO100 (brushed steel faceplate, black cloth, chrome corners). Every colour
 * comes from AMP_STACKS in ./copy.ts.
 *
 * What is written on the badge is the pedal's own name for the model — "UK
 * 800", "SOLO100" — because that is what a GP-200 owner sees on the unit. The
 * real amp each one stands for is named in the amp section further down the
 * page, from the same table the app's effect picker reads.
 *
 * The cones are drawn in front of the grille cloth rather than behind it. A
 * real cab hides them; showing them is what lets the speaker move, and the
 * whole point of the object is that useLandingMotion pushes air with it —
 * `data-lp-cone`, `data-lp-cab` and `data-lp-jewel` are the handles it grabs.
 *
 * Decorative: aria-hidden, and it contributes no words to the prerendered
 * page. With no JavaScript, or under reduced motion, it is a cabinet standing
 * still.
 */
export function LandingStack({ side }: { side: 'left' | 'right' }) {
  const amp = AMP_STACKS[side];
  // Two instances on one page, so every referenced id has to be unique or the
  // second stack inherits the first's patterns.
  const uid = `lp-stack-${side}`;
  const cones: [number, number][] = [
    [58, 150],
    [142, 150],
    [58, 246],
    [142, 246],
  ];

  return (
    <svg
      className={`lp-stack ${side}`}
      viewBox="0 0 200 320"
      aria-hidden="true"
      focusable="false"
      data-lp-cab
    >
      <defs>
        {/* grille cloth, woven from this amp's two threads: the salt-and-pepper
            look is one light warp crossing one dark weft, and a black cloth is
            the same weave with the light thread taken most of the way out */}
        <pattern id={`${uid}-cloth`} width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill={amp.clothWarp} />
          <path d="M0 0 L4 4 M4 0 L0 4" stroke={amp.clothWeft} strokeWidth="0.7" />
        </pattern>
        {/* the cone: lit from above left, like everything else on the stage */}
        <radialGradient id={`${uid}-cone`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#3b3733" />
          <stop offset="60%" stopColor="#221f1c" />
          <stop offset="100%" stopColor="#0e0d0c" />
        </radialGradient>
        <radialGradient id={`${uid}-cap`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#6d675e" />
          <stop offset="100%" stopColor="#2b2724" />
        </radialGradient>
        {/* brushed metal for the SLO's faceplate; the JCM's gold uses it too,
            which is what stops the panel reading as a flat swatch */}
        <linearGradient id={`${uid}-panel`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={amp.panel} stopOpacity="1" />
          <stop offset="50%" stopColor={amp.panel} stopOpacity="0.82" />
          <stop offset="100%" stopColor={amp.panel} stopOpacity="0.62" />
        </linearGradient>
      </defs>

      {/* ── head ─────────────────────────────────────────────────────────── */}
      <g>
        <rect x="2" y="2" width="196" height="58" rx="7" fill={amp.tolex} />
        <rect x="2" y="2" width="196" height="58" rx="7" fill="none" stroke={amp.edge} strokeWidth="1.5" />
        {/* control panel */}
        <rect x="12" y="12" width="176" height="26" rx="3" fill={`url(#${uid}-panel)`} />
        <rect x="12" y="12" width="176" height="26" rx="3" fill="none" stroke={amp.edge} strokeWidth="0.8" />
        {[30, 54, 78, 102, 126, 150, 172].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="25" r="5.4" fill={amp.panelInk} />
            <circle cx={cx} cy="25" r="5.4" fill="none" stroke={amp.corner} strokeWidth="0.9" />
            <rect x={cx - 0.6} y="20.4" width="1.2" height="4.6" rx="0.6" fill={amp.corner} />
          </g>
        ))}
        {/* Badge and jewel sit inboard rather than out at the corners where a
            real head carries them: each stack is cropped by the viewport edge
            it stands against, and the model name is the one part of the object
            that has to survive the crop. */}
        <rect x="58" y="43" width="84" height="12" rx="2" fill={amp.panelInk} stroke={amp.edge} strokeWidth="0.8" />
        <text
          x="100"
          y="51.6"
          textAnchor="middle"
          fill={amp.piping}
          fontSize="6.8"
          fontFamily="var(--font-jetbrains-mono), monospace"
          fontWeight="700"
          letterSpacing="1.3"
        >
          {amp.badge}
        </text>
        {/* jewel lamp: the one thing on the stack that is lit */}
        <circle cx="36" cy="49" r="4.6" fill="#d9a13c" data-lp-jewel />
        <circle cx="36" cy="49" r="4.6" fill="none" stroke={amp.corner} strokeWidth="1.4" />
      </g>

      {/* ── 4x12 ─────────────────────────────────────────────────────────── */}
      <g>
        <rect x="2" y="68" width="196" height="250" rx="7" fill={amp.tolex} />
        <rect x="2" y="68" width="196" height="250" rx="7" fill="none" stroke={amp.edge} strokeWidth="1.5" />
        {/* grille, and the piping that frames it */}
        <rect x="14" y="80" width="172" height="200" rx="3" fill={`url(#${uid}-cloth)`} />
        <rect x="14" y="80" width="172" height="200" rx="3" fill="none" stroke={amp.piping} strokeWidth="2.2" />

        {cones.map(([cx, cy]) => (
          <g key={`${cx}-${cy}`} data-lp-cone style={{ transformOrigin: `${cx}px ${cy}px` }}>
            {/* surround → cone → dust cap, the three parts that read at size */}
            <circle cx={cx} cy={cy} r="38" fill="#191715" />
            <circle cx={cx} cy={cy} r="34" fill={`url(#${uid}-cone)`} />
            <circle cx={cx} cy={cy} r="34" fill="none" stroke="#0b0a0a" strokeWidth="1" />
            <circle cx={cx} cy={cy} r="13" fill={`url(#${uid}-cap)`} />
          </g>
        ))}

        {/* corner protectors */}
        {[
          [2, 68, 1, 1],
          [198, 68, -1, 1],
          [2, 318, 1, -1],
          [198, 318, -1, -1],
        ].map(([x, y, sx, sy]) => (
          <path
            key={`${x}-${y}`}
            d={`M ${x} ${y + 20 * sy} L ${x} ${y + 6 * sy} Q ${x} ${y} ${x + 6 * sx} ${y} L ${x + 20 * sx} ${y}`}
            fill="none"
            stroke={amp.corner}
            strokeWidth="4"
            strokeLinecap="round"
          />
        ))}
      </g>
    </svg>
  );
}
