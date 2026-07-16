/**
 * Board-view pedal palette (docs/board-design-system.md).
 *
 * This is the sanctioned view-layer color source for the skeuomorphic board:
 * each module gets a full *body spec* (enclosure gradient, ink, knob style,
 * LED color), applied via inline CSS custom properties. It is deliberately
 * separate from `MODULE_COLORS` in src/core/effectNames.ts (device-data
 * domain), which stays untouched.
 *
 * Keys are the real module names from EFFECT_MAP. The design doc's original
 * `BST` row had no matching module in the data — it was replaced by the DST
 * spec below (red distortion-family body).
 */

export interface BodySpec {
  /** enclosure gradient start */
  body: string;
  /** enclosure gradient end */
  bodyDeep: string;
  /** the only text color allowed on this body */
  ink: string;
  /** knob cap style */
  knob: 'dark' | 'cream' | 'gold';
  /** LED color */
  led: string;
}

export const BOARD_BODY: Record<string, BodySpec> = {
  PRE: { body: '#ece4d4', bodyDeep: '#d8ccb4', ink: '#2b2620', knob: 'dark', led: '#ff4d4d' },
  WAH: { body: '#8a4dd8', bodyDeep: '#6e3ab5', ink: '#f4eefc', knob: 'cream', led: '#ff4d4d' },
  DST: { body: '#b8402e', bodyDeep: '#93301f', ink: '#fceeea', knob: 'cream', led: '#ff4d4d' },
  AMP: { body: '#211d18', bodyDeep: '#171310', ink: '#e8c890', knob: 'gold', led: '#ffa23f' },
  NR: { body: '#c9cfd2', bodyDeep: '#a9b0b4', ink: '#23282b', knob: 'dark', led: '#4dff88' },
  CAB: { body: '#3a3d3f', bodyDeep: '#2c2e30', ink: '#dfe4e6', knob: 'cream', led: '#ffa23f' },
  EQ: { body: '#f1f1ec', bodyDeep: '#dedeed', ink: '#26282a', knob: 'dark', led: '#ff4d4d' },
  MOD: { body: '#2f6fd8', bodyDeep: '#2455ab', ink: '#eef4ff', knob: 'cream', led: '#4da6ff' },
  DLY: { body: '#5a5fd8', bodyDeep: '#4547ab', ink: '#eeeeff', knob: 'cream', led: '#4da6ff' },
  RVB: { body: '#2fb9c9', bodyDeep: '#1f8b98', ink: '#07272b', knob: 'dark', led: '#4dffe0' },
  VOL: { body: '#2e2e33', bodyDeep: '#232327', ink: '#e8e8ea', knob: 'cream', led: '#ffffff' },
};

export const KNOB_STYLES: Record<BodySpec['knob'], { cap0: string; cap1: string; pointer: string }> = {
  dark: { cap0: '#3f3f42', cap1: '#101012', pointer: '#f5f5f2' },
  cream: { cap0: '#f6efdd', cap1: '#c9bd9d', pointer: '#221a0e' },
  gold: { cap0: '#e8c878', cap1: '#9a7830', pointer: '#1c1207' },
};

/** Body spec for a module, falling back to the neutral VOL spec for unknowns. */
export function getBodySpec(module: string): BodySpec {
  return BOARD_BODY[module] ?? BOARD_BODY.VOL;
}
