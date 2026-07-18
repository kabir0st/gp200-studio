import { describe, it, expect, vi } from 'vitest';
import {
  defaultLooperBindings,
  resolveFootswitch,
  applyExp,
  dispatchLooperAction,
  type LooperControls,
  type LooperAction,
} from '@/core/looperBindings';

describe('resolveFootswitch', () => {
  it('returns the bound action for a mapped footswitch', () => {
    expect(resolveFootswitch(defaultLooperBindings, 1)).toEqual({ kind: 'recordToggle' });
    expect(resolveFootswitch(defaultLooperBindings, 2)).toEqual({ kind: 'playToggle' });
    expect(resolveFootswitch(defaultLooperBindings, 3)).toEqual({ kind: 'trackNext' });
    expect(resolveFootswitch(defaultLooperBindings, 4)).toEqual({ kind: 'trackPrev' });
  });

  it('returns null for an unbound footswitch', () => {
    expect(resolveFootswitch(defaultLooperBindings, 8)).toBeNull();
  });
});

describe('applyExp', () => {
  it('maps 0..127 onto 0..1 and clamps out-of-range input', () => {
    expect(applyExp(0)).toBe(0);
    expect(applyExp(127)).toBe(1);
    expect(applyExp(64)).toBeCloseTo(0.5039, 3);
    expect(applyExp(-10)).toBe(0);
    expect(applyExp(200)).toBe(1);
  });
});

function mockLooper(): LooperControls {
  return {
    toggleRecord: vi.fn(),
    togglePlayAll: vi.fn(),
    selectNextTrack: vi.fn(),
    selectPrevTrack: vi.fn(),
  };
}

describe('dispatchLooperAction', () => {
  it('routes each transport action to its method', () => {
    const cases: Array<[LooperAction, keyof LooperControls]> = [
      [{ kind: 'recordToggle' }, 'toggleRecord'],
      [{ kind: 'playToggle' }, 'togglePlayAll'],
      [{ kind: 'trackNext' }, 'selectNextTrack'],
      [{ kind: 'trackPrev' }, 'selectPrevTrack'],
    ];
    for (const [action, method] of cases) {
      const looper = mockLooper();
      dispatchLooperAction(looper, action);
      expect(looper[method]).toHaveBeenCalledTimes(1);
    }
  });
});
