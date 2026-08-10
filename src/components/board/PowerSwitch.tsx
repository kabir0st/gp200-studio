interface PowerSwitchProps {
  /** true = stage lights on = light theme */
  on: boolean;
  /** run the electric flicker (the parent drives it so the stage surges too) */
  flickering: boolean;
  onToggle: () => void;
}

/**
 * The illuminated red rocker in the top bar: ON (lit) = light stage, OFF
 * (dark) = dark stage.
 *
 * It's a real `role="switch"` button, so it announces its state and takes
 * Space/Enter; everything else here is skin. The lamp flicker and the stage
 * surge are CSS animations (board.css), which the global
 * `prefers-reduced-motion` block in src/index.css already collapses — no
 * GSAP, so no extra motion gate is needed.
 */
export function PowerSwitch({ on, flickering, onToggle }: PowerSwitchProps) {
  const classes = ['power-switch'];
  if (on) classes.push('on');
  if (flickering) classes.push('flickering');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Stage lights (light theme)"
      title={on ? 'Lights on — switch to dark stage' : 'Lights off — switch to light stage'}
      className={classes.join(' ')}
      onClick={onToggle}
    >
      <span className="ps-bezel" aria-hidden="true">
        <span className="ps-rocker">
          <span className="ps-lamp" />
          <span className="ps-mark ps-mark-i">I</span>
          <span className="ps-mark ps-mark-o">O</span>
        </span>
      </span>
    </button>
  );
}
