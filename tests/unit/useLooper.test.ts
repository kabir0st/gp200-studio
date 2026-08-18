import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook, type RenderHookResult } from '@testing-library/react';
import { useLooper, type LooperApi } from '@/hooks/useLooper';
import { guardPreRollFrames, type LoopRecordSettings } from '@/core/loopCapture';
import {
  FakeAudioContext,
  fakeEngine,
  installWorkletNode,
  type FakeBufferSourceNode,
  type FakeWorkletNode,
} from '../support/fakeAudio';

const RATE = 48000;
/** Posted past the body every take, standing in for the worklet's ring-out. */
const TAIL = 4096;

interface Harness {
  ctx: FakeAudioContext;
  api: () => LooperApi;
  worklet: () => FakeWorkletNode;
  /** buffer sources the context has ever handed out, oldest first */
  sources: FakeBufferSourceNode[];
  settings: (patch: Partial<LoopRecordSettings>) => void;
  /** run a whole take through the worklet protocol; returns its capture edges */
  take: (frames: number) => Promise<{ armFrame: number; head: number }>;
  teardown: () => void;
}

const open: Harness[] = [];

afterEach(() => {
  while (open.length > 0) open.pop()?.teardown();
});

async function mountLooper(): Promise<Harness> {
  localStorage.clear();
  const ctx = new FakeAudioContext(RATE);
  const handle = installWorkletNode();
  const engine = fakeEngine(ctx);
  let view: RenderHookResult<LooperApi, unknown>;
  await act(async () => {
    view = renderHook(() => useLooper(engine));
  });
  // ensureGraph is kicked off by an effect and awaits addModule.
  await act(async () => {});

  const api = () => view.result.current;
  const worklet = () => handle.current as FakeWorkletNode;

  const harness: Harness = {
    ctx,
    api,
    worklet,
    sources: ctx.sources,
    settings: (patch) => {
      act(() => api().updateSettings(patch));
    },
    take: async (frames: number) => {
      const node = worklet();
      const from = node.posted.length;
      await act(async () => {
        api().toggleRecord();
      });
      const arm = node.posted.slice(from).find((message) => message.type === 'arm');
      if (!arm) throw new Error('the looper never armed the recorder');
      const armFrame = arm.startFrame as number;

      // A grid take is armed a guard pre-roll ahead of its loop point, so that
      // much of what the worklet posts sits BEFORE the loop's first sample.
      const base = api().baseDurationSec;
      let head = 0;
      if (base !== null && api().hasContent) {
        head = guardPreRollFrames(RATE, Math.round(base * RATE));
      }
      const bodyFrames = head + frames;

      // Each sample carries its own context frame number, so the value at the
      // head of the finished loop says exactly where the loop point landed.
      const posted = new Float32Array(bodyFrames + TAIL);
      for (let index = 0; index < posted.length; index++) posted[index] = armFrame + index;

      act(() => {
        node.emit({ type: 'started', startFrame: armFrame, prerollFrames: 0 });
        node.emit({ type: 'chunk', samples: posted });
      });
      ctx.advance(posted.length / RATE);
      await act(async () => {
        api().toggleRecord();
      });
      act(() => {
        node.emit({ type: 'ended', bodyFrames });
      });
      return { armFrame, head };
    },
    teardown: () => {
      handle.restore();
      view.unmount();
    },
  };
  open.push(harness);
  return harness;
}

/** The frame-numbered value sitting at the head of a finished track's loop. */
function loopHeadValue(harness: Harness, index: number): number {
  const source = harness.sources[index];
  const buffer = source.buffer;
  if (!buffer) throw new Error('track never got a buffer');
  return buffer.getChannelData(0)[0];
}

async function mountForTakes(patch: Partial<LoopRecordSettings> = {}): Promise<Harness> {
  const harness = await mountLooper();
  // autoStart off keeps the first take on the frame path (deterministic head);
  // no loop join keeps the head sample exactly what was captured there.
  harness.settings({ autoStart: false, tailBlendMs: 0, ...patch });
  return harness;
}

describe('undo of the first take', () => {
  it('gives the bar length back instead of leaving a loop that never wraps', async () => {
    const h = await mountForTakes();
    await h.take(RATE); // a 1 s take defines the bar
    expect(h.api().baseDurationSec).toBeCloseTo(1, 6);
    expect(h.api().tracks).toHaveLength(1);

    act(() => h.api().undo());

    expect(h.api().tracks).toHaveLength(0);
    expect(h.api().baseDurationSec).toBeNull();
    expect(h.api().cycleBars).toBe(1);
  });

  it('lets the next take define its own bar, from take one', async () => {
    const h = await mountForTakes();
    await h.take(RATE);
    act(() => h.api().undo());

    await h.take(RATE / 2);

    expect(h.api().baseDurationSec).toBeCloseTo(0.5, 6);
    expect(h.api().tracks[0].durationSec).toBeCloseTo(0.5, 6);
    expect(h.api().tracks[0].label).toBe('TAKE 1');
  });

  it('puts the bar back on redo', async () => {
    const h = await mountForTakes();
    await h.take(RATE);
    act(() => h.api().undo());

    act(() => h.api().redo());

    expect(h.api().tracks).toHaveLength(1);
    expect(h.api().baseDurationSec).toBeCloseTo(1, 6);
    expect(h.api().cycleBars).toBe(1);
  });

  it('keeps a bar that was locked to a tempo, which was never the take\'s to set', async () => {
    const h = await mountForTakes();
    await act(async () => {
      h.api().lockBaseSeconds(2);
    });
    await h.take(2 * RATE);

    act(() => h.api().undo());

    expect(h.api().tracks).toHaveLength(0);
    expect(h.api().baseDurationSec).toBeCloseTo(2, 6);
    expect(h.api().baseLocked).toBe(true);
  });

  it('does not spend a take number on a take that was thrown away', async () => {
    const h = await mountForTakes();
    await act(async () => {
      h.api().toggleRecord();
    });
    act(() => h.api().cancelRecord());

    await h.take(RATE);

    expect(h.api().tracks[0].label).toBe('TAKE 1');
  });
});

describe('growing the cycle', () => {
  it('leaves a loop that is already playing completely alone', async () => {
    const h = await mountForTakes();
    await h.take(RATE); // 1 bar
    expect(h.sources).toHaveLength(1);
    const first = h.sources[0];

    await h.take(2 * RATE); // 2 bars: the cycle has to widen under the first

    expect(h.api().cycleBars).toBe(2);
    // The whole bug: the 1-bar track used to be stopped and rebuilt here, so
    // the loop audibly restarted from the top at a moment that is not even a
    // downbeat. Its source must still be the same node, still running.
    expect(h.sources).toHaveLength(2);
    expect(first.stopped).toBeNull();
    expect(h.sources[1].buffer?.length).toBe(2 * RATE);
  });

  it('leaves the survivors alone through the undo as well', async () => {
    const h = await mountForTakes();
    await h.take(RATE);
    const first = h.sources[0];
    await h.take(2 * RATE);

    act(() => h.api().undo());

    expect(h.api().cycleBars).toBe(1);
    expect(h.api().tracks).toHaveLength(1);
    expect(h.sources).toHaveLength(2);
    expect(first.stopped).toBeNull();
  });

  it('does relaunch a track whose tiling really moves, spliced at one instant', async () => {
    const h = await mountForTakes();
    await h.take(RATE); // 1 bar
    await h.take(3 * RATE); // 3 bars: cycle 1 -> 3, both lengths still divide it
    expect(h.api().cycleBars).toBe(3);
    expect(h.sources).toHaveLength(2);

    await h.take(4 * RATE); // 4 bars: 3 no longer divides the cycle

    expect(h.api().cycleBars).toBe(4);
    // the 1-bar track still divides 3 and 4, so it is untouched...
    expect(h.sources[0].stopped).toBeNull();
    // ...while the 3-bar track played a truncated repeat and has to move.
    expect(h.sources).toHaveLength(4);
    expect(h.sources[1].stopped).not.toBeNull();
    // Stopped and restarted at the same instant: a splice, not a gap, and that
    // instant is still ahead of the renderer.
    expect(h.sources[2].started?.when).toBe(h.sources[1].stopped);
    expect(h.sources[2].started?.when).toBeGreaterThan(h.ctx.currentTime);
  });
});

describe('timing trim', () => {
  async function overdubWithTrim(latencyTrimMs: number) {
    const h = await mountForTakes({ latencyTrimMs });
    await h.take(RATE); // sets a 1 s bar
    const overdub = await h.take(RATE); // a 1-bar overdub, armed to the grid
    const result = {
      armFrame: overdub.armFrame,
      head: overdub.head,
      loopHead: loopHeadValue(h, 1),
      durationSec: h.api().tracks[1].durationSec,
      cycleBars: h.api().cycleBars,
    };
    h.teardown();
    open.pop();
    return result;
  }

  it('captures ahead of the loop point, so the trim never costs the take its head', async () => {
    const plain = await overdubWithTrim(0);
    // There is real audio between where capture opened and where the loop
    // starts , that gap is what a positive trim eats into instead of the take.
    expect(plain.head).toBeGreaterThan(0);
    expect(plain.loopHead).toBe(plain.armFrame + plain.head);
  });

  it('moves the loop point by exactly the trim, in both directions', async () => {
    const [plain, late, early] = [
      await overdubWithTrim(0),
      await overdubWithTrim(30),
      await overdubWithTrim(-100),
    ];

    expect(late.loopHead - plain.loopHead).toBe(Math.round(0.03 * RATE));
    // Negative used to be impossible: the offset clamped at zero, so the head
    // could never be pulled back in front of the arm point.
    expect(early.loopHead - plain.loopHead).toBe(-Math.round(0.1 * RATE));
  });

  it('never changes how long the take is, or how wide the loop gets', async () => {
    const [plain, late, early] = [
      await overdubWithTrim(0),
      await overdubWithTrim(30),
      await overdubWithTrim(-100),
    ];

    for (const run of [late, early]) {
      expect(run.durationSec).toBeCloseTo(plain.durationSec, 9);
      expect(run.cycleBars).toBe(plain.cycleBars);
    }
  });

  it('leaves a take with nothing playing to follow untouched', async () => {
    const h = await mountForTakes({ latencyTrimMs: 30 });
    const first = await h.take(RATE);
    // Only the input leg, no output leg and no trim: there is no round trip to
    // correct when there is nothing coming out of the speakers.
    expect(first.head).toBe(0);
    expect(first.armFrame).toBe(Math.round(0.01 * RATE));
    expect(h.api().baseDurationSec).toBeCloseTo(1, 6);
  });
});

describe('transport basics', () => {
  it('adds a playing track per take and stops them all together', async () => {
    const h = await mountForTakes();
    await h.take(RATE);
    await h.take(RATE);
    expect(h.api().tracks.map((row) => row.state)).toEqual(['playing', 'playing']);

    act(() => h.api().togglePlayAll());
    expect(h.api().anyPlaying).toBe(false);

    act(() => h.api().togglePlayAll());
    expect(h.api().anyPlaying).toBe(true);
  });

  it('narrows the loop again when the widest track is deleted', async () => {
    const h = await mountForTakes();
    await h.take(RATE);
    await h.take(2 * RATE);
    expect(h.api().cycleBars).toBe(2);

    act(() => h.api().clear(h.api().tracks[1].id));

    expect(h.api().tracks).toHaveLength(1);
    expect(h.api().cycleBars).toBe(1);
  });

  it('clears a bar left behind on an empty board', async () => {
    const h = await mountForTakes();
    await act(async () => {
      h.api().lockBaseSeconds(2);
    });
    act(() => h.api().unlockBase());
    expect(h.api().baseDurationSec).toBeNull();

    await h.take(RATE);
    act(() => h.api().clearAll());

    expect(h.api().tracks).toHaveLength(0);
    expect(h.api().baseDurationSec).toBeNull();
    expect(h.api().cycleBars).toBe(1);
  });

  it('takes an imported file as the bar when it lands first', async () => {
    const h = await mountForTakes();
    const file = new File([new Uint8Array(RATE * 4)], 'riff.wav');

    await act(async () => {
      await h.api().importAudioFile(file);
    });

    expect(h.api().tracks).toHaveLength(1);
    expect(h.api().baseDurationSec).toBeCloseTo(1, 6);
  });
});

describe('a bar locked to the drums', () => {
  it('remembers the tempo it was locked to, so the label cannot drift', async () => {
    // The lock copies a bar LENGTH once. Reading the drum machine's live tempo
    // for the label would describe a tempo the loop is not running at as soon
    // as the drum machine is retuned.
    const h = await mountForTakes();
    await act(async () => {
      h.api().lockBaseSeconds(2, '120 BPM · 4/4');
    });
    expect(h.api().baseLocked).toBe(true);
    expect(h.api().baseLockedLabel).toBe('120 BPM · 4/4');

    act(() => h.api().unlockBase());
    expect(h.api().baseLockedLabel).toBeNull();
  });

  it('survives a take and comes back through CLEAR ALL, not a page reload', async () => {
    // The route out of a locked bar with tracks on it: CLEAR ALL keeps the bar
    // (deliberately) but re-enables unlocking, which is what the UI now says.
    const h = await mountForTakes();
    await act(async () => {
      h.api().lockBaseSeconds(2, '120 BPM · 4/4');
    });
    await h.take(2 * RATE);
    expect(h.api().hasContent).toBe(true);

    // Locked with content: unlocking is refused, so the bar is still 2s.
    act(() => h.api().unlockBase());
    expect(h.api().baseLocked).toBe(true);
    expect(h.api().baseDurationSec).toBeCloseTo(2, 6);

    act(() => h.api().clearAll());
    expect(h.api().tracks).toHaveLength(0);
    expect(h.api().baseLocked).toBe(true);
    expect(h.api().baseLockedLabel).toBe('120 BPM · 4/4');

    act(() => h.api().unlockBase());
    expect(h.api().baseLocked).toBe(false);
    expect(h.api().baseDurationSec).toBeNull();
    expect(h.api().baseLockedLabel).toBeNull();
  });

  it('keeps the label through an undo, as it keeps the bar', async () => {
    const h = await mountForTakes();
    await act(async () => {
      h.api().lockBaseSeconds(1, '120 BPM · 4/4');
    });
    await h.take(RATE);
    act(() => h.api().undo());

    expect(h.api().baseLocked).toBe(true);
    expect(h.api().baseLockedLabel).toBe('120 BPM · 4/4');
  });
});

describe('track level', () => {
  it('lives on the row, so the slider still reads right after a remount', async () => {
    // It used to be component-local state: closing the drawer reset every
    // slider to 100% while the audio node stayed where the user put it.
    const h = await mountForTakes();
    await h.take(RATE);
    expect(h.api().tracks[0].gain).toBe(1);

    const id = h.api().tracks[0].id;
    act(() => h.api().updateTrackGain(id, 0.5));
    expect(h.api().tracks[0].gain).toBeCloseTo(0.5, 6);
  });

  it('is mixer state, not history: undo leaves a survivor at the level it was set to', async () => {
    const h = await mountForTakes();
    await h.take(RATE);
    const id = h.api().tracks[0].id;
    act(() => h.api().updateTrackGain(id, 0.5));

    await h.take(RATE);
    act(() => h.api().undo());

    expect(h.api().tracks).toHaveLength(1);
    expect(h.api().tracks[0].gain).toBeCloseTo(0.5, 6);
  });
});

describe('selection after an undo', () => {
  it('lands on a track that still exists, so the selected-track keys still work', async () => {
    // pushHistory runs mid-finalize, when the selection is already the in-flight
    // take's lane , a lane the snapshot deliberately skips. Restoring that id
    // left play/mute/EXP addressing a row that was gone, doing nothing at all.
    const h = await mountForTakes();
    await h.take(RATE);
    await h.take(RATE);
    expect(h.api().tracks).toHaveLength(2);

    act(() => h.api().undo());

    const rows = h.api().tracks;
    expect(rows).toHaveLength(1);
    expect(h.api().selectedTrack).toBe(rows[0].id);

    // and the selection is live, not just a number
    act(() => h.api().togglePlaySelected());
    expect(h.api().tracks[0].state).toBe('stopped');
  });
});
