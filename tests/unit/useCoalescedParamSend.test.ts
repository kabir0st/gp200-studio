import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCoalescedParamSend } from '@/hooks/useCoalescedParamSend';

/** Drive requestAnimationFrame by hand so a "frame" is something we can call. */
let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function paint() {
  const due = frames;
  frames = [];
  act(() => {
    for (const cb of due) cb(0);
  });
}

describe('useCoalescedParamSend', () => {
  it('sends nothing until a frame paints', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useCoalescedParamSend(send));

    act(() => result.current(3, 0, 0x01, 40));
    expect(send).not.toHaveBeenCalled();

    paint();
    expect(send).toHaveBeenCalledExactlyOnceWith(3, 0, 0x01, 40);
  });

  it('collapses a burst on one param down to its final value', () => {
    // what a knob drag looks like: many intermediate values nobody ever saw
    const send = vi.fn();
    const { result } = renderHook(() => useCoalescedParamSend(send));

    act(() => {
      for (let v = 40; v <= 62; v++) result.current(3, 0, 0x01, v);
    });
    paint();

    expect(send).toHaveBeenCalledExactlyOnceWith(3, 0, 0x01, 62);
  });

  it('keeps separate params separate', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useCoalescedParamSend(send));

    act(() => {
      result.current(3, 0, 0x01, 10);
      result.current(3, 1, 0x01, 20);
      result.current(4, 0, 0x02, 30);
      result.current(3, 0, 0x01, 11);
    });
    paint();

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls).toContainEqual([3, 0, 0x01, 11]);
    expect(send.mock.calls).toContainEqual([3, 1, 0x01, 20]);
    expect(send.mock.calls).toContainEqual([4, 0, 0x02, 30]);
  });

  it('schedules a fresh frame for the next burst', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useCoalescedParamSend(send));

    act(() => result.current(3, 0, 0x01, 40));
    paint();
    act(() => result.current(3, 0, 0x01, 41));
    paint();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(3, 0, 0x01, 41);
  });

  it('flushes on unmount rather than dropping the edit', () => {
    const send = vi.fn();
    const { result, unmount } = renderHook(() => useCoalescedParamSend(send));

    act(() => result.current(3, 0, 0x01, 77));
    unmount();

    expect(send).toHaveBeenCalledExactlyOnceWith(3, 0, 0x01, 77);
  });

  it('flushes when the tab is hidden, where frames stop arriving', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useCoalescedParamSend(send));

    act(() => result.current(3, 0, 0x01, 55));
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(send).toHaveBeenCalledExactlyOnceWith(3, 0, 0x01, 55);
  });
});
