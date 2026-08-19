import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  DRUM_KITS,
  DRUM_LANES,
  DRUM_PATTERNS,
  RANDOM_STYLES,
  SIGNATURES,
  SIGNATURE_IDS,
  MAX_STEPS,
  drumSamplePath,
  getPattern,
  nextStepVelocity,
  parseLane,
  randomizePattern,
  secondsPerStep,
  stepStartSeconds,
  stepVelocityName,
} from '../../src/core/drumMachine';

describe('parseLane', () => {
  it('maps notation chars to velocities', () => {
    const lane = parseLane('X-x.------------', 16);
    expect(lane).toHaveLength(16);
    expect(lane[0]).toBe(1);
    expect(lane[1]).toBe(0);
    expect(lane[2]).toBe(0.7);
    expect(lane[3]).toBe(0.35);
  });

  it('rejects wrong lengths and unknown chars', () => {
    expect(() => parseLane('X---', 16)).toThrow();
    expect(() => parseLane('Q---------------', 16)).toThrow();
  });
});

describe('SIGNATURES', () => {
  it('keeps every signature inside the grid bounds with valid anchors', () => {
    for (const signatureId of SIGNATURE_IDS) {
      const signature = SIGNATURES[signatureId];
      expect(signature.steps).toBeLessThanOrEqual(MAX_STEPS);
      for (const anchor of [...signature.strong, ...signature.back]) {
        expect(anchor).toBeGreaterThanOrEqual(0);
        expect(anchor).toBeLessThan(signature.steps);
      }
    }
  });
});

describe('DRUM_PATTERNS', () => {
  it('has unique ids', () => {
    const ids = DRUM_PATTERNS.map((drumPattern) => drumPattern.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sizes every lane to its signature with in-range velocities', () => {
    for (const drumPattern of DRUM_PATTERNS) {
      const barSteps = SIGNATURES[drumPattern.signature].steps;
      for (const lane of DRUM_LANES) {
        const laneSteps = drumPattern.steps[lane.id];
        expect(laneSteps, `${drumPattern.id}/${lane.id}`).toHaveLength(barSteps);
        for (const velocity of laneSteps) {
          expect(velocity).toBeGreaterThanOrEqual(0);
          expect(velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('keeps suggested tempos playable', () => {
    for (const drumPattern of DRUM_PATTERNS) {
      expect(drumPattern.bpm).toBeGreaterThanOrEqual(40);
      expect(drumPattern.bpm).toBeLessThanOrEqual(240);
    }
  });

  it('getPattern falls back to the first pattern for unknown ids', () => {
    expect(getPattern('nope').id).toBe(DRUM_PATTERNS[0].id);
    expect(getPattern('blues-shuffle').id).toBe('blues-shuffle');
  });
});

describe('DRUM_KITS', () => {
  it('ships every referenced sample file in public/drums/', () => {
    for (const kit of DRUM_KITS) {
      for (const lane of DRUM_LANES) {
        const filePath = join(process.cwd(), 'public', drumSamplePath(kit, lane));
        expect(existsSync(filePath), filePath).toBe(true);
      }
    }
  });
});

describe('step timing', () => {
  it('computes a 16th-note step length from bpm', () => {
    expect(secondsPerStep(120)).toBeCloseTo(0.125, 10);
    expect(secondsPerStep(60)).toBeCloseTo(0.25, 10);
  });

  it('applies swing to odd 16ths only', () => {
    expect(stepStartSeconds(0, 120, 0.33)).toBeCloseTo(0, 10);
    expect(stepStartSeconds(2, 120, 0.33)).toBeCloseTo(0.25, 10);
    expect(stepStartSeconds(1, 120, 0)).toBeCloseTo(0.125, 10);
    expect(stepStartSeconds(1, 120, 0.33)).toBeCloseTo(0.125 * 1.33, 10);
  });
});

describe('randomizePattern', () => {
  it('is deterministic for a fixed random source', () => {
    let seed = 1;
    const lcg = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    let seedB = 1;
    const lcgB = () => {
      seedB = (seedB * 48271) % 2147483647;
      return seedB / 2147483647;
    };
    const first = randomizePattern('Groove', lcg);
    const second = randomizePattern('Groove', lcgB);
    expect(second.steps).toEqual(first.steps);
  });

  it('always keeps the style-defining hits', () => {
    const neverHit = () => 0.9999;
    const rolled = randomizePattern('Rock', neverHit);
    expect(rolled.steps.kick[0]).toBe(1);
    expect(rolled.steps.snare[4]).toBe(1);
    expect(rolled.steps.snare[12]).toBe(1);
  });

  it('anchors kick and snare to every signature', () => {
    const neverHit = () => 0.9999;
    for (const signatureId of SIGNATURE_IDS) {
      const signature = SIGNATURES[signatureId];
      const rolled = randomizePattern('Roots', neverHit, signatureId);
      expect(rolled.signature).toBe(signatureId);
      expect(rolled.steps.kick).toHaveLength(signature.steps);
      expect(rolled.steps.kick[0]).toBe(1);
      for (const backbeat of signature.back) {
        expect(rolled.steps.snare[backbeat], `${signatureId} back ${backbeat}`).toBe(1);
      }
    }
  });

  it('produces valid lanes for every style and signature', () => {
    const alwaysHit = () => 0;
    for (const style of RANDOM_STYLES) {
      for (const signatureId of SIGNATURE_IDS) {
        const rolled = randomizePattern(style, alwaysHit, signatureId);
        for (const lane of DRUM_LANES) {
          const laneSteps = rolled.steps[lane.id];
          expect(laneSteps).toHaveLength(SIGNATURES[signatureId].steps);
          for (const velocity of laneSteps) {
            expect(velocity).toBeGreaterThanOrEqual(0);
            expect(velocity).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('never doubles a closed hat under an open hat', () => {
    const alwaysHit = () => 0;
    const rolled = randomizePattern('Pop & Dance', alwaysHit);
    rolled.steps.hatOpen.forEach((openVelocity, stepIndex) => {
      // index used deliberately: the two hat lanes align by grid position
      if (openVelocity > 0) expect(rolled.steps.hatClosed[stepIndex]).toBe(0);
    });
  });
});

describe('nextStepVelocity', () => {
  it('walks a cell through every level and back to silence in four clicks', () => {
    // The ring is the only way to author a ghost note, so it has to reach all
    // four levels from a standing start and then clear itself.
    const walk: number[] = [];
    let velocity = 0;
    for (let click = 0; click < 4; click += 1) {
      velocity = nextStepVelocity(velocity);
      walk.push(velocity);
    }
    expect(walk.map(stepVelocityName)).toEqual(['hit', 'accent', 'ghost', 'off']);
    expect(walk[3]).toBe(0);
  });

  it('gives every velocity a preset can hold a defined successor', () => {
    // parseLane's four notation levels are what presets and randomize emit; a
    // click on any of them must land on another level, never on a dead value.
    const fromPresets = parseLane('X-x.------------', 16).slice(0, 4);
    expect(fromPresets).toEqual([1, 0, 0.7, 0.35]);
    expect(fromPresets.map(nextStepVelocity)).toEqual([0.35, 0.7, 1, 0]);
  });

  it('promotes a ghost instead of dead-ending on it', () => {
    // The old two-state toggle turned a preset's ghost off and could never put
    // one back; clicking one now continues around the ring.
    expect(nextStepVelocity(0.35)).toBe(0);
    expect(nextStepVelocity(nextStepVelocity(0.35))).toBe(0.7);
  });
});
