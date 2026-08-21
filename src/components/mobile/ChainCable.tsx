/**
 * The patch cable between two pedal cards, and the gradients it paints with.
 *
 * Deliberately a fixed-size drawing in the flow between cards rather than an
 * overlay measured against them. useDragReorder freezes DOM order for the whole
 * gesture and moves cards with GSAP transforms, so anything that measures where
 * a card *is* goes stale the moment a drag starts. A cable belongs to the gap —
 * a position in the chain — not to either block, exactly like the FX SEND and
 * FX RETURN markers, and for the same reason it holds still and stays correct
 * while blocks slide past it.
 *
 * Stroke recipe is the board's (see CableLayer): black casing, rubber sheath,
 * then a thin sheen, with a chrome plug at each end.
 */

/** Both ends and the S-bend between them; drawn three times, thinnest last. */
const RUN = 'M12 2 C 5 9, 19 19, 12 26';

/**
 * The gradients every cable references, mounted once at the shell root.
 *
 * Ten cables each carrying their own <defs> would put ten copies of the same id
 * in one document. Ids are mobile-prefixed so they could never collide with the
 * board's, which are identical in everything but direction.
 */
export function CableDefs() {
  return (
    <svg className="m-defs" aria-hidden="true" focusable="false">
      <defs>
        {/* across the cable, not along it: these runs are vertical */}
        <linearGradient id="m-cable-sheath" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3a3a3d" />
          <stop offset="45%" stopColor="#1a1a1c" />
          <stop offset="100%" stopColor="#0a0a0b" />
        </linearGradient>
        <radialGradient id="m-plug-metal" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#f0f0f0" />
          <stop offset="55%" stopColor="#a8a8a8" />
          <stop offset="100%" stopColor="#4a4a4a" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export function ChainCable() {
  return (
    <span className="m-cable" aria-hidden="true">
      <svg viewBox="0 0 24 28" focusable="false">
        <path d={RUN} fill="none" stroke="#050505" strokeWidth={6.5} strokeLinecap="round" />
        <path d={RUN} fill="none" stroke="url(#m-cable-sheath)" strokeWidth={5} strokeLinecap="round" />
        <path
          d={RUN}
          fill="none"
          stroke="#8f9094"
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.5}
        />
        {[2, 26].map((cy) => (
          <g key={cy}>
            <circle cx={12} cy={cy} r={3.6} fill="url(#m-plug-metal)" stroke="#2c2c2c" strokeWidth={0.7} />
            <circle cx={12} cy={cy} r={1.4} fill="#1e1e1e" />
          </g>
        ))}
      </svg>
    </span>
  );
}
