import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  DRUM_KITS,
  DRUM_LANES,
  DRUM_PATTERNS,
  RANDOM_STYLES,
  STEP_COUNT,
  drumSamplePath,
  getPattern,
  parseLane,
  randomizePattern,
  secondsPerStep,
  stepStartSeconds,
} from '../../src/core/drumMachine';

describe('parseLane', () => {
  it('maps notation chars to velocities', () => {
    const lane = parseLane('X-x.------------');
    expect(lane).toHaveLength(STEP_COUNT);
    expect(lane[0]).toBe(1);
    expect(lane[1]).toBe(0);
    expect(lane[2]).toBe(0.7);
    expect(lane[3]).toBe(0.35);
  });

  it('rejects wrong lengths and unknown chars', () => {
    expect(() => parseLane('X---')).toThrow();
    expect(() => parseLane('Q---------------')).toThrow();
  });
});

describe('DRUM_PATTERNS', () => {
  it('has unique ids', () => {
    const ids = DRUM_PATTERNS.map((drumPattern) => drumPattern.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every lane exactly 16 in-range velocities', () => {
    for (const drumPattern of DRUM_PATTERNS) {
      for (const lane of DRUM_LANES) {
        const laneSteps = drumPattern.steps[lane.id];
        expect(laneSteps, `${drumPattern.id}/${lane.id}`).toHaveLength(STEP_COUNT);
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

  it('produces valid lanes for every style', () => {
    const alwaysHit = () => 0;
    for (const style of RANDOM_STYLES) {
      const rolled = randomizePattern(style, alwaysHit);
      for (const lane of DRUM_LANES) {
        const laneSteps = rolled.steps[lane.id];
        expect(laneSteps).toHaveLength(STEP_COUNT);
        for (const velocity of laneSteps) {
          expect(velocity).toBeGreaterThanOrEqual(0);
          expect(velocity).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
