import { ActionIcon } from './ActionIcon';

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
 * Space/Enter; everything else here is skin. The paddle is a single plane
 * tilted in 3D (`.ps-rocker`) with a face on each half, so the pressed side
 * genuinely sinks under the bezel lip while the raised side catches the light —
 * the tilt alone reads as a colour change at this size, the shading is what
 * sells the moulding. The lamp flicker and the stage surge are CSS animations
 * (board.css), which the global `prefers-reduced-motion` block in src/index.css
 * already collapses — no GSAP, so no extra motion gate is needed.
 *
 * The clack it makes lives in src/lib/uiSound.ts, fired by the parent alongside
 * the flicker (both trees toggle through App's wrapped `onToggleTheme`).
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
          <span className="ps-face ps-face-i">I</span>
          <span className="ps-face ps-face-o">O</span>
        </span>
      </span>
    </button>
  );
}

interface SoundToggleProps {
  on: boolean;
  onToggle: () => void;
}

/**
 * Mute for the chassis noises. It sits with the rocker because the rocker is
 * the only thing that makes any — a chrome sound with no visible way to
 * silence it is the kind of thing you end up editing code to escape.
 */
export function SoundToggle({ on, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Switch sound"
      title={on ? 'Switch sound on — click to mute' : 'Switch sound muted — click to unmute'}
      className={on ? 'ps-mute on' : 'ps-mute'}
      onClick={onToggle}
    >
      <ActionIcon name={on ? 'sound' : 'sound-off'} />
    </button>
  );
}
