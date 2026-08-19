/**
 * Pure data + timing core for the browser practice drum machine: lane/kit
 * definitions over the CC0 one-shots in public/drums/ (see its README for
 * provenance), time signatures, a library of step-grid practice grooves, the
 * step-timing math the scheduler in useDrumMachine.ts uses, and a
 * style-aware pattern randomizer.
 *
 * This is browser-audio only , completely separate from the GP-200's built-in
 * drum machine remote (ccControl.ts / drumRhythms.ts), which is MIDI CC and
 * makes no sound in the browser.
 */

export type DrumLaneId =
  | 'kick'
  | 'snare'
  | 'hatClosed'
  | 'hatOpen'
  | 'perc'
  | 'tomLo'
  | 'tomHi'
  | 'crash';

export interface DrumLane {
  id: DrumLaneId;
  label: string;
  /** basename of the one-shot inside every kit folder */
  file: string;
}

/** Row order = display order in the step grid (top = kick, like a mixer). */
export const DRUM_LANES: readonly DrumLane[] = [
  { id: 'kick', label: 'KICK', file: 'kick' },
  { id: 'snare', label: 'SNARE', file: 'snare' },
  { id: 'hatClosed', label: 'HAT', file: 'hat-closed' },
  { id: 'hatOpen', label: 'OPEN HAT', file: 'hat-open' },
  { id: 'perc', label: 'PERC', file: 'perc' },
  { id: 'tomLo', label: 'TOM LO', file: 'tom-lo' },
  { id: 'tomHi', label: 'TOM HI', file: 'tom-hi' },
  { id: 'crash', label: 'CRASH', file: 'crash' },
];

export interface DrumKit {
  id: string;
  name: string;
  description: string;
  /** file extension shared by every one-shot in the kit folder */
  ext: 'wav' | 'flac';
}

export const DRUM_KITS: readonly DrumKit[] = [
  { id: 'acoustic', name: 'ACOUSTIC', description: 'Real kit one-shots (Sonic Pi, CC0)', ext: 'flac' },
  { id: 'tr808', name: 'TR-808', description: 'Roland TR-808 (Fischer recordings, CC0)', ext: 'wav' },
  { id: 'lofi', name: 'LO-FI', description: 'Bit-crushed vintage 808 (CC0)', ext: 'wav' },
];

/** Path below the app base URL, e.g. `drums/tr808/kick.wav`. */
export function drumSamplePath(kit: DrumKit, lane: DrumLane): string {
  return `drums/${kit.id}/${lane.file}.${kit.ext}`;
}

export type SignatureId = '4/4' | '3/4' | '2/4' | '6/8';

/**
 * A bar is a grid of 16th-note steps; the signature sets how many and how
 * they group. Step duration is signature-independent (secondsPerStep), so
 * 3/4 and 6/8 share a bar length and differ in grouping/accents , which is
 * exactly how they differ on a drum kit.
 */
export interface DrumSignature {
  id: SignatureId;
  /** 16th steps per bar */
  steps: number;
  /** steps per visual group: grid separators + toggle-accent placement */
  group: number;
  /** beat-start steps: accented, and the randomizer's kick candidates */
  strong: readonly number[];
  /** backbeat steps: the randomizer's guaranteed snare hits */
  back: readonly number[];
}

export const SIGNATURES: Record<SignatureId, DrumSignature> = {
  '4/4': { id: '4/4', steps: 16, group: 4, strong: [0, 4, 8, 12], back: [4, 12] },
  '3/4': { id: '3/4', steps: 12, group: 4, strong: [0, 4, 8], back: [8] },
  '2/4': { id: '2/4', steps: 8, group: 4, strong: [0, 4], back: [4] },
  '6/8': { id: '6/8', steps: 12, group: 3, strong: [0, 6], back: [6] },
};

export const SIGNATURE_IDS: readonly SignatureId[] = ['4/4', '3/4', '2/4', '6/8'];

/** Longest bar any signature produces (grid/type sizing upper bound). */
export const MAX_STEPS = 16;

export interface DrumPattern {
  id: string;
  name: string;
  /** optgroup label in the pattern picker; also picks the randomizer style */
  group: string;
  /** suggested practice tempo */
  bpm: number;
  /** 0..~0.6: odd 16th steps are delayed by this fraction of a step */
  swing: number;
  signature: SignatureId;
  /** velocity 0..1 per step; every lane present, arrays signature.steps long */
  steps: Record<DrumLaneId, readonly number[]>;
}

const VELOCITY_BY_CHAR: Record<string, number> = {
  '-': 0,
  '.': 0.35,
  x: 0.7,
  X: 1,
};

/** The four levels a grid cell can hold, in the order clicking walks them. */
export const STEP_VELOCITIES = {
  rest: 0,
  ghost: VELOCITY_BY_CHAR['.'],
  normal: VELOCITY_BY_CHAR.x,
  accent: VELOCITY_BY_CHAR.X,
} as const;

/**
 * Next level for a grid cell that was clicked: rest → normal → accent → ghost
 * → rest.
 *
 * Presets and the randomizer have always written ghost hits, and the grid has
 * always drawn all three levels, but a two-state toggle could only ever produce
 * two of them: clicking a preset's ghost note destroyed it and there was no way
 * back. A single ring keeps one input for touch (the phone renders this same
 * grid) and reaches every level.
 *
 * Normal comes first because it is the ordinary case, and ghost comes last
 * because it is the refinement you add to a part that already plays. Bucketed
 * on the same thresholds the grid paints with, so any velocity from a preset or
 * a randomize lands on a defined successor.
 */
export function nextStepVelocity(current: number): number {
  if (current <= 0) return STEP_VELOCITIES.normal;
  if (current >= 1) return STEP_VELOCITIES.ghost;
  if (current >= 0.5) return STEP_VELOCITIES.accent;
  return STEP_VELOCITIES.rest;
}

/** What a cell at `velocity` is called, for tooltips and labels. */
export function stepVelocityName(velocity: number): string {
  if (velocity <= 0) return 'off';
  if (velocity >= 1) return 'accent';
  if (velocity >= 0.5) return 'hit';
  return 'ghost';
}

/** `'X-x.'`-notation → velocities (X accent, x normal, . ghost, - rest). */
export function parseLane(notation: string, expectedSteps: number): number[] {
  if (notation.length !== expectedSteps) {
    throw new Error(`lane notation must be ${expectedSteps} chars: "${notation}"`);
  }
  return [...notation].map((stepChar) => {
    const velocity = VELOCITY_BY_CHAR[stepChar];
    if (velocity === undefined) throw new Error(`bad step char "${stepChar}"`);
    return velocity;
  });
}

export function silentLane(steps: number): readonly number[] {
  return new Array<number>(steps).fill(0);
}

function pattern(
  id: string,
  name: string,
  group: string,
  bpm: number,
  swing: number,
  signature: SignatureId,
  lanes: Partial<Record<DrumLaneId, string>>,
): DrumPattern {
  const barSteps = SIGNATURES[signature].steps;
  const steps = {} as Record<DrumLaneId, readonly number[]>;
  for (const lane of DRUM_LANES) {
    const notation = lanes[lane.id];
    if (notation === undefined) {
      steps[lane.id] = silentLane(barSteps);
      continue;
    }
    steps[lane.id] = parseLane(notation, barSteps);
  }
  return { id, name, group, bpm, swing, signature, steps };
}

/*
 * One bar per pattern; beats fall on the signature's strong steps. Shuffled
 * grooves are written on the classic hardware 'x--x' grid (hit + dotted
 * pickup) instead of relying on the swing offset, so they read correctly in
 * the step grid too.
 */
export const DRUM_PATTERNS: readonly DrumPattern[] = [
  pattern('rock-basic', 'Basic Rock', 'Rock', 100, 0, '4/4', {
    kick: 'X-------X-x-----',
    snare: '----X-------X---',
    hatClosed: 'x-x-x-x-x-x-x-x-',
  }),
  pattern('rock-drive', 'Driving Eights', 'Rock', 132, 0, '4/4', {
    kick: 'X---x---X---x-x-',
    snare: '----X-------X---',
    hatClosed: 'X-x-X-x-X-x-X-x-',
  }),
  pattern('punk', 'Punk', 'Rock', 178, 0, '4/4', {
    kick: 'X---X---X---X-x-',
    snare: '--X---X---X---X-',
    hatClosed: 'X-x-X-x-X-x-X-x-',
  }),
  pattern('metal-gallop', 'Metal Gallop', 'Rock', 156, 0, '4/4', {
    kick: 'X-xxX-xxX-xxX-xx',
    snare: '----X-------X---',
    hatClosed: 'X---X---X---X---',
    crash: 'X---------------',
  }),
  pattern('pop-sixteens', 'Pop 16ths', 'Pop & Dance', 104, 0, '4/4', {
    kick: 'X-----x-X--x----',
    snare: '----X-------X---',
    hatClosed: 'X.x.X.x.X.x.X.x.',
  }),
  pattern('disco', 'Disco Four', 'Pop & Dance', 118, 0, '4/4', {
    kick: 'X---X---X---X---',
    snare: '----X-------X---',
    hatClosed: 'x---x---x---x---',
    hatOpen: '--x---x---x---x-',
  }),
  pattern('funk-ghost', 'Funk Ghosts', 'Groove', 96, 0.12, '4/4', {
    kick: 'X--x--x---x----x',
    snare: '----X..--.--X--.',
    hatClosed: 'x.x.x.x.x.x.x.x.',
    hatOpen: '----------x-----',
  }),
  pattern('boom-bap', 'Boom Bap', 'Groove', 90, 0.18, '4/4', {
    kick: 'X-----x---xx----',
    snare: '----X-------X---',
    hatClosed: 'x-x-x-x-x-x-x-x.',
  }),
  pattern('trap-half', 'Trap Halftime', 'Groove', 140, 0, '4/4', {
    kick: 'X------x--x-----',
    snare: '--------X-------',
    hatClosed: 'x.x.x.xxx.x.xx.x',
    perc: '--------X-------',
  }),
  pattern('blues-shuffle', 'Blues Shuffle', 'Roots', 84, 0, '4/4', {
    kick: 'X-------X-------',
    snare: '----X--.X---X--X',
    hatClosed: 'x--xx--xx--xx--x',
  }),
  pattern('train-beat', 'Train Beat', 'Roots', 112, 0, '4/4', {
    kick: 'X-------X-------',
    snare: '.x.xXx.x.x.xXx.x',
    hatClosed: 'x---x---x---x---',
  }),
  pattern('reggae-one-drop', 'One Drop', 'Roots', 76, 0.1, '4/4', {
    kick: '--------X-------',
    snare: '--------X-------',
    hatClosed: 'x-x-x-x-x-x-x-x-',
    perc: '----x-------x---',
  }),
  pattern('ballad', 'Slow Ballad', 'Roots', 68, 0, '4/4', {
    kick: 'X---------x-----',
    snare: '----X-------X---',
    hatClosed: 'x-x-x-x-x-x-x-x-',
  }),
  pattern('country-waltz', 'Country Waltz', 'Roots', 100, 0, '3/4', {
    kick: 'X-----------',
    snare: '----X---X---',
    hatClosed: 'x-x-x-x-x-x-',
  }),
  pattern('six-eight', '6/8 Ballad', 'Roots', 72, 0, '6/8', {
    kick: 'X----------x',
    snare: '------X-----',
    hatClosed: 'X-x-x-X-x-x-',
  }),
];

export function getPattern(patternId: string): DrumPattern {
  const found = DRUM_PATTERNS.find((candidate) => candidate.id === patternId);
  return found ?? DRUM_PATTERNS[0];
}

/** Duration of one 16th step in seconds. */
export function secondsPerStep(bpm: number): number {
  return 60 / bpm / 4;
}

/**
 * Start offset of a step from the top of the bar. Swing delays every odd
 * 16th by `swing` steps (0.33 ≈ triplet feel), the classic MPC-style model.
 */
export function stepStartSeconds(step: number, bpm: number, swing: number): number {
  const stepLength = secondsPerStep(bpm);
  const swingDelay = (step % 2) * swing * stepLength;
  return step * stepLength + swingDelay;
}

export type RandomStyle = 'Rock' | 'Pop & Dance' | 'Groove' | 'Roots';

export const RANDOM_STYLES: readonly RandomStyle[] = [
  'Rock',
  'Pop & Dance',
  'Groove',
  'Roots',
];

/*
 * The randomizer builds a bar from per-style probabilities anchored to the
 * signature's anatomy: kick on the downbeat and snare on the backbeats are
 * certainties, everything else is seasoning , so every roll is playable in
 * any signature rather than white noise.
 */
interface StyleParams {
  /** hat grid: 1 = 16ths, 2 = 8ths */
  hatStride: 1 | 2;
  /** chance of a hat at each grid position (1 = deterministic bed) */
  hatChance: number;
  /** chance of a soft hat on the 16ths BETWEEN the hat grid (16th feel) */
  hatFillChance: number;
  /** chance of a kick on strong steps beyond the downbeat */
  kickStrongChance: number;
  /** chance of a syncopated kick on any weak step */
  kickSyncChance: number;
  /** chance of a ghost snare on non-backbeat steps */
  snareGhostChance: number;
  /** chance of an open hat on each offbeat 8th (disco bark) */
  openOffbeatChance: number;
  /** chance the bar's last offbeat opens (turnaround lift) */
  openTailChance: number;
  /** chance of a clap/perc doubling each backbeat */
  percBackChance: number;
  /** chance of a crash on the downbeat */
  crashChance: number;
}

const STYLE_PARAMS: Record<RandomStyle, StyleParams> = {
  Rock: {
    hatStride: 2, hatChance: 1, hatFillChance: 0,
    kickStrongChance: 0.55, kickSyncChance: 0.14, snareGhostChance: 0.06,
    openOffbeatChance: 0, openTailChance: 0.35, percBackChance: 0, crashChance: 0.3,
  },
  'Pop & Dance': {
    hatStride: 2, hatChance: 0.95, hatFillChance: 0.1,
    kickStrongChance: 0.85, kickSyncChance: 0.08, snareGhostChance: 0.04,
    openOffbeatChance: 0.55, openTailChance: 0, percBackChance: 0.3, crashChance: 0.2,
  },
  Groove: {
    hatStride: 1, hatChance: 0.75, hatFillChance: 0,
    kickStrongChance: 0.35, kickSyncChance: 0.28, snareGhostChance: 0.2,
    openOffbeatChance: 0.08, openTailChance: 0.3, percBackChance: 0.25, crashChance: 0.1,
  },
  Roots: {
    hatStride: 2, hatChance: 0.9, hatFillChance: 0.12,
    kickStrongChance: 0.5, kickSyncChance: 0.1, snareGhostChance: 0.14,
    openOffbeatChance: 0, openTailChance: 0.2, percBackChance: 0.3, crashChance: 0.1,
  },
};

function stepRange(count: number): number[] {
  return [...Array(count).keys()];
}

function hitVelocity(step: number, strong: ReadonlySet<number>): number {
  if (strong.has(step)) return 1;
  return 0.7;
}

/**
 * Generate a playable one-bar groove in the given style and signature.
 * `random` is injectable (Math.random in the app, a seeded stub in tests).
 */
export function randomizePattern(
  style: RandomStyle,
  random: () => number,
  signatureId: SignatureId = '4/4',
): DrumPattern {
  const signature = SIGNATURES[signatureId];
  const params = STYLE_PARAMS[style];
  const strong = new Set(signature.strong);
  const back = new Set(signature.back);
  const roll = (chance: number) => chance > 0 && random() < chance;

  const kick = stepRange(signature.steps).map((step) => {
    if (step === 0) return 1;
    if (back.has(step)) return 0;
    if (strong.has(step) && roll(params.kickStrongChance)) return hitVelocity(step, strong);
    if (!strong.has(step) && roll(params.kickSyncChance)) return 0.7;
    return 0;
  });
  const snare = stepRange(signature.steps).map((step) => {
    if (back.has(step)) return 1;
    if (roll(params.snareGhostChance)) return 0.35;
    return 0;
  });
  const hatClosed = stepRange(signature.steps).map((step) => {
    if (step % params.hatStride === 0 && roll(params.hatChance)) {
      return hitVelocity(step, strong);
    }
    if (step % params.hatStride !== 0 && roll(params.hatFillChance)) return 0.35;
    return 0;
  });
  const lastOffbeat = signature.steps - 2;
  const hatOpen = stepRange(signature.steps).map((step) => {
    const isOffbeat = step % 4 === 2;
    if (isOffbeat && roll(params.openOffbeatChance)) return 0.7;
    if (step === lastOffbeat && roll(params.openTailChance)) return 0.7;
    return 0;
  });
  // An open hat replaces the closed hat on its step (playing both at once
  // just chokes the open one into mush).
  const hatClosedFinal = hatClosed.map((velocity, stepIndex) => {
    // index used deliberately: the two hat lanes align by grid position
    if (hatOpen[stepIndex] > 0) return 0;
    return velocity;
  });
  const perc = stepRange(signature.steps).map((step) => {
    if (back.has(step) && roll(params.percBackChance)) return 0.7;
    return 0;
  });
  const crash = stepRange(signature.steps).map((step) => {
    if (step === 0 && roll(params.crashChance)) return 1;
    return 0;
  });

  return {
    id: 'random',
    name: `Random ${style}`,
    group: style,
    bpm: getPattern('rock-basic').bpm,
    swing: 0,
    signature: signatureId,
    steps: {
      kick, snare, hatClosed: hatClosedFinal, hatOpen, perc, crash,
      tomLo: silentLane(signature.steps),
      tomHi: silentLane(signature.steps),
    },
  };
}
