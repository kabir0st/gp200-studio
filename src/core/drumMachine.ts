/**
 * Pure data + timing core for the browser practice drum machine: lane/kit
 * definitions over the CC0 one-shots in public/drums/ (see its README for
 * provenance), a library of 16-step practice grooves, the step-timing math the
 * scheduler in useDrumMachine.ts uses, and a style-aware pattern randomizer.
 *
 * This is browser-audio only — completely separate from the GP-200's built-in
 * drum machine remote (ccControl.ts / drumRhythms.ts), which is MIDI CC and
 * makes no sound in the browser.
 */

export const STEP_COUNT = 16;

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

export interface DrumPattern {
  id: string;
  name: string;
  /** optgroup label in the pattern picker; also picks the randomizer style */
  group: string;
  /** suggested practice tempo */
  bpm: number;
  /** 0..~0.6: odd 16th steps are delayed by this fraction of a step */
  swing: number;
  /** velocity 0..1 per step, every lane present, every array 16 long */
  steps: Record<DrumLaneId, readonly number[]>;
}

const VELOCITY_BY_CHAR: Record<string, number> = {
  '-': 0,
  '.': 0.35,
  x: 0.7,
  X: 1,
};

/** `'X-x.'`-notation → velocities (X accent, x normal, . ghost, - rest). */
export function parseLane(notation: string): number[] {
  if (notation.length !== STEP_COUNT) {
    throw new Error(`lane notation must be ${STEP_COUNT} chars: "${notation}"`);
  }
  return [...notation].map((stepChar) => {
    const velocity = VELOCITY_BY_CHAR[stepChar];
    if (velocity === undefined) throw new Error(`bad step char "${stepChar}"`);
    return velocity;
  });
}

const SILENT_LANE: readonly number[] = new Array<number>(STEP_COUNT).fill(0);

function pattern(
  id: string,
  name: string,
  group: string,
  bpm: number,
  swing: number,
  lanes: Partial<Record<DrumLaneId, string>>,
): DrumPattern {
  const steps = {} as Record<DrumLaneId, readonly number[]>;
  for (const lane of DRUM_LANES) {
    const notation = lanes[lane.id];
    if (notation === undefined) {
      steps[lane.id] = SILENT_LANE;
      continue;
    }
    steps[lane.id] = parseLane(notation);
  }
  return { id, name, group, bpm, swing, steps };
}

/*
 * One bar of 4/4 in 16ths; beats fall on steps 0/4/8/12. Shuffled grooves are
 * written on the classic hardware 'x--x' grid (hit + dotted pickup) instead of
 * relying on the swing offset, so they read correctly in the step grid too.
 */
export const DRUM_PATTERNS: readonly DrumPattern[] = [
  pattern('rock-basic', 'Basic Rock', 'Rock', 100, 0, {
    kick: 'X-------X-x-----',
    snare: '----X-------X---',
    hatClosed: 'x-x-x-x-x-x-x-x-',
  }),
  pattern('rock-drive', 'Driving Eights', 'Rock', 132, 0, {
    kick: 'X---x---X---x-x-',
    snare: '----X-------X---',
    hatClosed: 'X-x-X-x-X-x-X-x-',
  }),
  pattern('punk', 'Punk', 'Rock', 178, 0, {
    kick: 'X---X---X---X-x-',
    snare: '--X---X---X---X-',
    hatClosed: 'X-x-X-x-X-x-X-x-',
  }),
  pattern('metal-gallop', 'Metal Gallop', 'Rock', 156, 0, {
    kick: 'X-xxX-xxX-xxX-xx',
    snare: '----X-------X---',
    hatClosed: 'X---X---X---X---',
    crash: 'X---------------',
  }),
  pattern('pop-sixteens', 'Pop 16ths', 'Pop & Dance', 104, 0, {
    kick: 'X-----x-X--x----',
    snare: '----X-------X---',
    hatClosed: 'X.x.X.x.X.x.X.x.',
  }),
  pattern('disco', 'Disco Four', 'Pop & Dance', 118, 0, {
    kick: 'X---X---X---X---',
    snare: '----X-------X---',
    hatClosed: 'x---x---x---x---',
    hatOpen: '--x---x---x---x-',
  }),
  pattern('funk-ghost', 'Funk Ghosts', 'Groove', 96, 0.12, {
    kick: 'X--x--x---x----x',
    snare: '----X..--.--X--.',
    hatClosed: 'x.x.x.x.x.x.x.x.',
    hatOpen: '----------x-----',
  }),
  pattern('boom-bap', 'Boom Bap', 'Groove', 90, 0.18, {
    kick: 'X-----x---xx----',
    snare: '----X-------X---',
    hatClosed: 'x-x-x-x-x-x-x-x.',
  }),
  pattern('trap-half', 'Trap Halftime', 'Groove', 140, 0, {
    kick: 'X------x--x-----',
    snare: '--------X-------',
    hatClosed: 'x.x.x.xxx.x.xx.x',
    perc: '--------X-------',
  }),
  pattern('blues-shuffle', 'Blues Shuffle', 'Roots', 84, 0, {
    kick: 'X-------X-------',
    snare: '----X--.X---X--X',
    hatClosed: 'x--xx--xx--xx--x',
  }),
  pattern('train-beat', 'Train Beat', 'Roots', 112, 0, {
    kick: 'X-------X-------',
    snare: '.x.xXx.x.x.xXx.x',
    hatClosed: 'x---x---x---x---',
  }),
  pattern('reggae-one-drop', 'One Drop', 'Roots', 76, 0.1, {
    kick: '--------X-------',
    snare: '--------X-------',
    hatClosed: 'x-x-x-x-x-x-x-x-',
    perc: '----x-------x---',
  }),
  pattern('ballad', 'Slow Ballad', 'Roots', 68, 0, {
    kick: 'X---------x-----',
    snare: '----X-------X---',
    hatClosed: 'x-x-x-x-x-x-x-x-',
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

interface StyleTemplate {
  /** probability 0..1 of a hit per step; forced steps use probability 1 */
  chance: Partial<Record<DrumLaneId, readonly number[]>>;
}

/*
 * Backbeat anatomy per style: the beat-defining hits are certainties, the
 * rest are seasoned probabilities, so every roll is playable rather than
 * white noise. Snare backbeat (4/12) and a downbeat kick are always forced.
 */
const STYLE_TEMPLATES: Record<RandomStyle, StyleTemplate> = {
  Rock: {
    chance: {
      kick: [1, 0, 0.1, 0.25, 0, 0, 0.3, 0.1, 1, 0, 0.35, 0.3, 0, 0, 0.25, 0.15],
      snare: [0, 0, 0, 0, 1, 0, 0, 0.1, 0, 0, 0.05, 0, 1, 0, 0.1, 0.2],
      hatClosed: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
      hatOpen: [0, 0, 0, 0, 0, 0, 0.15, 0, 0, 0, 0, 0, 0, 0, 0.3, 0],
      crash: [0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  },
  'Pop & Dance': {
    chance: {
      kick: [1, 0, 0, 0.15, 1, 0, 0, 0.1, 1, 0, 0, 0.15, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.15],
      hatClosed: [0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0, 0.9, 0],
      hatOpen: [0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0],
      perc: [0, 0, 0, 0, 0.25, 0, 0, 0, 0, 0, 0, 0, 0.25, 0, 0, 0],
    },
  },
  Groove: {
    chance: {
      kick: [1, 0, 0.2, 0.4, 0, 0.1, 0.4, 0.2, 0.3, 0, 0.45, 0.2, 0, 0.15, 0.1, 0.3],
      snare: [0, 0.15, 0, 0.2, 1, 0.1, 0.15, 0.25, 0, 0.2, 0.1, 0.15, 1, 0, 0.2, 0.3],
      hatClosed: [1, 0.4, 1, 0.4, 1, 0.4, 1, 0.4, 1, 0.4, 1, 0.4, 1, 0.4, 1, 0.4],
      hatOpen: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.35, 0, 0, 0, 0.2, 0],
      perc: [0, 0, 0, 0, 0.2, 0, 0, 0, 0, 0, 0, 0, 0.2, 0, 0, 0],
    },
  },
  Roots: {
    chance: {
      kick: [1, 0, 0, 0.2, 0, 0, 0.15, 0, 1, 0, 0.25, 0, 0, 0, 0.1, 0],
      snare: [0, 0, 0.15, 0.1, 1, 0, 0, 0.25, 0, 0.15, 0, 0.1, 1, 0, 0, 0.3],
      hatClosed: [1, 0, 0, 0.8, 1, 0, 0, 0.8, 1, 0, 0, 0.8, 1, 0, 0, 0.8],
      perc: [0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0],
    },
  },
};

const ACCENT_STEPS = new Set([0, 4, 8, 12]);

function rollLane(chances: readonly number[], random: () => number): number[] {
  return chances.map((chance, stepIndex) => {
    // index used deliberately: velocity depends on grid position (downbeats
    // are accented, in-between hits play softer)
    if (chance <= 0) return 0;
    if (chance < 1 && random() >= chance) return 0;
    if (ACCENT_STEPS.has(stepIndex)) return 1;
    if (chance <= 0.25) return 0.35;
    return 0.7;
  });
}

/**
 * Generate a playable one-bar groove in the given style. `random` is
 * injectable (pass Math.random in the app, a seeded stub in tests).
 */
export function randomizePattern(style: RandomStyle, random: () => number): DrumPattern {
  const template = STYLE_TEMPLATES[style];
  const steps = {} as Record<DrumLaneId, readonly number[]>;
  for (const lane of DRUM_LANES) {
    const chances = template.chance[lane.id];
    if (chances === undefined) {
      steps[lane.id] = SILENT_LANE;
      continue;
    }
    steps[lane.id] = rollLane(chances, random);
  }
  const base = getPattern('rock-basic');
  return {
    id: 'random',
    name: `Random ${style}`,
    group: style,
    bpm: base.bpm,
    swing: 0,
    steps,
  };
}

export const RANDOM_STYLES: readonly RandomStyle[] = [
  'Rock',
  'Pop & Dance',
  'Groove',
  'Roots',
];
