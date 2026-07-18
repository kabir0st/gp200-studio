/**
 * Colour-coded line-art marks for the board's chrome actions (top bar + deck),
 * the Tier-1 counterpart to ModuleGlyph for buttons rather than effect blocks.
 *
 * Each action owns one hue so the button row is scannable at a glance — this
 * matters most on phones, where the row wraps and labels shrink. Colours are
 * darkened variants chosen to clear WCAG AA on the white `.deck-btn` face; on
 * an inverted `.deck-btn.primary` the icon drops back to `currentColor` (see
 * board.css), so contrast holds in both states.
 */

interface ActionSpec {
  /** inner SVG markup for a 16×16 viewBox, stroked in currentColor */
  d: string;
  /** the action's hue, applied as the svg's own `color` */
  color: string;
}

const ACTIONS: Record<string, ActionSpec> = {
  // loop station: the classic cycle arrow
  loop: {
    d: '<path d="M13.2 8a5.2 5.2 0 1 1-1.9-4" /><path d="M13.3 2.4V5.6H10.1" />',
    color: '#7a4fb5',
  },
  // drum machine: kit drum with sticks
  drums: {
    d: '<ellipse cx="8" cy="5.6" rx="5" ry="2.2" /><path d="M3 5.6v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-4" /><path d="m4.2 2.2 2.6 1.8M11.8 2.2 9.2 4" />',
    color: '#b4423a',
  },
  // tuner: a tuning fork
  tuner: {
    d: '<path d="M5.6 2.2v3.6a2.4 2.4 0 0 0 4.8 0V2.2" /><path d="M8 8.2v5.6" /><path d="M6.4 13.8h3.2" />',
    color: '#2f7e4f',
  },
  // patch library: stacked device slots
  patches: {
    d: '<rect x="2.4" y="2.8" width="11.2" height="4.2" rx="1.2" /><rect x="2.4" y="9" width="11.2" height="4.2" rx="1.2" /><path d="M4.8 4.9h1.4M4.8 11.1h1.4" />',
    color: '#8a6320',
  },
  // load from device: arrow down into the tray
  load: {
    d: '<path d="M8 2.4v6.8" /><path d="m5.2 6.6 2.8 2.8 2.8-2.8" /><path d="M3 12.6h10" />',
    color: '#2f6fa8',
  },
  // save to device: arrow up out of the tray
  save: {
    d: '<path d="M8 10.2V3.4" /><path d="m5.2 6.2 2.8-2.8 2.8 2.8" /><path d="M3 12.6h10" />',
    color: '#1f7a6d',
  },
  // connect: a plug
  connect: {
    d: '<path d="M6 2v3.4M10 2v3.4" /><path d="M4.4 5.4h7.2v2.4a3.6 3.6 0 0 1-7.2 0z" /><path d="M8 11.4v2.6" />',
    color: '#2f7e4f',
  },
  // disconnect
  disconnect: {
    d: '<path d="m4.2 4.2 7.6 7.6M11.8 4.2l-7.6 7.6" />',
    color: '#b4423a',
  },
  // guide
  guide: {
    d: '<circle cx="8" cy="8" r="5.8" /><path d="M6.3 6.2a1.8 1.8 0 1 1 2.3 2.2c-.4.2-.6.5-.6.9v.3" /><path d="M8 12.1h.01" />',
    color: '#5f5c55',
  },
  // close the preset: step out through a door
  close: {
    d: '<path d="M9.4 2.6H4.2a1.4 1.4 0 0 0-1.4 1.4v8a1.4 1.4 0 0 0 1.4 1.4h5.2" /><path d="m10.8 5.4 2.6 2.6-2.6 2.6" /><path d="M13.4 8H6.6" />',
    color: '#5f5c55',
  },
  // fx loop: send out, return in
  fxloop: {
    d: '<path d="M2.6 5.2h8.4" /><path d="m9 3.2 2 2-2 2" /><path d="M13.4 10.8H5" />',
    color: '#c06020',
  },
  // expression pedal: a tilted treadle
  exp: {
    d: '<path d="M2.6 12.4 13.4 4v5.2l-10.8 4z" /><path d="M2.6 12.4v1.2" />',
    color: '#2f6fa8',
  },
  // ctrl footswitches: a bank of stomps
  ctrl: {
    d: '<circle cx="5.2" cy="5.2" r="2.2" /><circle cx="10.8" cy="5.2" r="2.2" /><circle cx="5.2" cy="10.8" r="2.2" /><circle cx="10.8" cy="10.8" r="2.2" />',
    color: '#7a4fb5',
  },
};

export type ActionIconName = keyof typeof ACTIONS;

export function ActionIcon({ name, className }: { name: ActionIconName; className?: string }) {
  const spec = ACTIONS[name];
  if (!spec) return null;
  let cls = 'act-icon';
  if (className) cls = `act-icon ${className}`;
  return (
    <svg
      className={cls}
      style={{ color: spec.color }}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: spec.d }}
    />
  );
}
