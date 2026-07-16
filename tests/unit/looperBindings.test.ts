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
    expect(resolveFootswitch(defaultLooperBindings, 1)).toEqual({ kind: 'recordOverdubCycle', track: 0 });
    expect(resolveFootswitch(defaultLooperBindings, 4)).toEqual({ kind: 'clearAll' });
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

function mockLooper(overrides: Partial<LooperControls> = {}): LooperControls {
  return {
    isRecording: false,
    tracks: [{ id: 0, muted: false }, { id: 1, muted: true }],
    startRecord: vi.fn(),
    stopRecord: vi.fn(),
    togglePlay: vi.fn(),
    setMute: vi.fn(),
    clear: vi.fn(),
    clearAll: vi.fn(),
    ...overrides,
  };
}

describe('dispatchLooperAction', () => {
  it('recordOverdubCycle starts recording when idle', () => {
    const looper = mockLooper({ isRecording: false });
    dispatchLooperAction(looper, { kind: 'recordOverdubCycle', track: 2 });
    expect(looper.startRecord).toHaveBeenCalledWith(2);
    expect(looper.stopRecord).not.toHaveBeenCalled();
  });

  it('recordOverdubCycle stops recording when armed', () => {
    const looper = mockLooper({ isRecording: true });
    dispatchLooperAction(looper, { kind: 'recordOverdubCycle', track: 2 });
    expect(looper.stopRecord).toHaveBeenCalledTimes(1);
    expect(looper.startRecord).not.toHaveBeenCalled();
  });

  it('muteToggle flips the current mute state of the target track', () => {
    const looper = mockLooper();
    dispatchLooperAction(looper, { kind: 'muteToggle', track: 1 }); // track 1 starts muted
    expect(looper.setMute).toHaveBeenCalledWith(1, false);
  });

  it('routes the remaining actions to their methods', () => {
    const looper = mockLooper();
    const cases: Array<[LooperAction, keyof LooperControls, unknown[]]> = [
      [{ kind: 'playToggle', track: 3 }, 'togglePlay', [3]],
      [{ kind: 'clear', track: 3 }, 'clear', [3]],
      [{ kind: 'clearAll' }, 'clearAll', []],
    ];
    for (const [action, method, args] of cases) {
      dispatchLooperAction(looper, action);
      expect(looper[method]).toHaveBeenCalledWith(...args);
    }
  });
});
