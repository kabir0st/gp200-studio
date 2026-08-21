/**
 * A par can hung over the stage, aimed at the CONNECT button.
 *
 * One is rigged at each top corner and both point inward and down, so their
 * beams cross on the primary action. That is the whole job: the brightest
 * thing on the page and the thing you are meant to click are the same thing,
 * and the lights are what say so.
 *
 * The gradients here are the light itself — the lens, and the beam falling
 * away with distance — in the same way the cables have a rubber sheath and the
 * cones catch a highlight. Nothing on this page is tinted for decoration.
 *
 * The beam takes its colour from `--accent`, so it tracks the palette rather
 * than pinning a second copy of the hue (the mistake `--knob-fill` made).
 *
 * Decorative and non-interactive: aria-hidden, `pointer-events: none` in the
 * stylesheet, and no words in the prerendered page. `data-lp-beam` is the
 * handle useLandingMotion uses to breathe it on the beat.
 */
export function LandingLight({ side }: { side: 'left' | 'right' }) {
  // Two instances on one page, so every referenced id has to be unique or the
  // second light inherits the first's gradients.
  const uid = `lp-light-${side}`;

  return (
    <svg
      className={`lp-light ${side}`}
      viewBox="0 0 200 1180"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* the beam: brightest at the lens, gone before it reaches the floor */}
        <linearGradient id={`${uid}-beam`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.40" />
          <stop offset="40%" stopColor="var(--accent)" stopOpacity="0.24" />
          <stop offset="72%" stopColor="var(--accent)" stopOpacity="0.13" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        {/* the hot spot right at the lens, where the beam has not spread yet */}
        <radialGradient id={`${uid}-lens`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="var(--accent)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        {/* the can, lit from the side the beam leaves by */}
        <linearGradient id={`${uid}-can`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a3733" />
          <stop offset="45%" stopColor="#232220" />
          <stop offset="100%" stopColor="#141312" />
        </linearGradient>
      </defs>

      {/* ── the beam, behind the fixture that casts it ─────────────────── */}
      <g data-lp-beam>
        {/* The viewBox is tall enough to hold the whole beam. It has to be:
            an <svg> clips to its viewBox, and a beam drawn past the bottom
            edge gets cut off by a straight line that — once the fixture is
            rotated to aim — reads as the light stopping in mid-air. */}
        <polygon points="72,120 128,120 250,1178 -50,1178" fill={`url(#${uid}-beam)`} />
        {/* the lit lens itself, and its bloom */}
        <ellipse cx="100" cy="118" rx="58" ry="30" fill={`url(#${uid}-lens)`} />
      </g>

      {/* ── the fixture ───────────────────────────────────────────────────
          Hung off the top edge of the hero, so the clamp and the top of the
          yoke are cropped rather than drawn floating in mid-air. */}
      <g>
        {/* yoke: two arms down to the trunnion bolts */}
        <path
          d="M76 -40 V64 M124 -40 V64"
          stroke="#6d675e"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
        {/* can body: a par can flares toward the lens */}
        <path d="M74 26 H126 L140 112 H60 Z" fill={`url(#${uid}-can)`} />
        <path d="M74 26 H126 L140 112 H60 Z" fill="none" stroke="#4a463f" strokeWidth="2" />
        {/* cooling ribs */}
        <path d="M69 58 H131 M65 84 H135" stroke="#4a463f" strokeWidth="2" opacity="0.8" />
        {/* trunnion bolts, where the can pivots in the yoke */}
        <circle cx="76" cy="64" r="6" fill="#8a857c" stroke="#3a3733" strokeWidth="1.5" />
        <circle cx="124" cy="64" r="6" fill="#8a857c" stroke="#3a3733" strokeWidth="1.5" />
        {/* lens ring */}
        <ellipse cx="100" cy="114" rx="42" ry="10" fill="#17161a" stroke="#5d574d" strokeWidth="2.5" />
        <ellipse cx="100" cy="113" rx="33" ry="7" fill={`url(#${uid}-lens)`} />
        {/* barn doors: the detail that makes it unmistakably a stage light */}
        <path
          d="M58 108 L36 92 M142 108 L164 92"
          stroke="#3a3733"
          strokeWidth="9"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
