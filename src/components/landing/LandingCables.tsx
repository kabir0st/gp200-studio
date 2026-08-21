/**
 * Two patch cables drooping out of the hero copy and into the editor
 * screenshot below it — the page literally patches itself into the app.
 *
 * The rendering is lifted from the board's own CableLayer.tsx rather than
 * invented: the same three-pass stroke (black casing, rubber sheath, sheen),
 * the same chrome plug, the same drop shadow. On the board those cables are
 * measured between real jack positions; here the curve is fixed, because the
 * only job is to carry the board's vocabulary into the marketing page.
 *
 * Decorative, so the whole thing is aria-hidden and adds no words to the
 * prerendered page.
 */
export function LandingCables() {
  return (
    <svg
      className="lp-cables"
      viewBox="0 0 720 110"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="lp-cable-shadow" x="-20%" y="-20%" width="140%" height="180%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.55" />
        </filter>
        {/* Rubber sheath, lit for a dark stage. The board's own cable is very
            nearly black, which works because it lies on the light case; here
            the hero is always the dark case, and a black cable on it reads as
            a stray hairline. Same three-pass construction, moved up the value
            scale so the sheath itself carries the form. */}
        <linearGradient id="lp-cable-sheath" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6f7176" />
          <stop offset="45%" stopColor="#3a3c41" />
          <stop offset="100%" stopColor="#1b1c1f" />
        </linearGradient>
        <radialGradient id="lp-plug-metal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f0f0f0" />
          <stop offset="55%" stopColor="#a8a8a8" />
          <stop offset="100%" stopColor="#4a4a4a" />
        </radialGradient>
      </defs>

      {/* Both plugs sit at the top, in the hero; the droop between them falls
          past the bottom of the box and onto the screenshot frame, which the
          band's negative bottom margin pulls it over. */}
      {[
        { d: 'M 150 8 C 214 128 506 128 570 8', plugs: [[150, 8], [570, 8]] },
        { d: 'M 252 5 C 300 100 420 100 468 5', plugs: [[252, 5], [468, 5]] },
      ].map((cable) => (
        <g key={cable.d} filter="url(#lp-cable-shadow)">
          <path d={cable.d} fill="none" stroke="#08090a" strokeWidth={8} strokeLinecap="round" />
          <path d={cable.d} fill="none" stroke="url(#lp-cable-sheath)" strokeWidth={6.2} strokeLinecap="round" />
          <path
            d={cable.d}
            fill="none"
            stroke="#c8cace"
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.55}
          />
          {cable.plugs.map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <circle cx={x} cy={y} r={5} fill="url(#lp-plug-metal)" stroke="#2c2c2c" strokeWidth={0.75} />
              <circle cx={x} cy={y} r={2} fill="#1e1e1e" />
              <circle cx={x - 1.3} cy={y - 1.3} r={0.9} fill="#fff" opacity={0.7} />
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
