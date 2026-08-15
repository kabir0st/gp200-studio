import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

// The recorder worklet decides every capture edge, so it is worth driving
// directly instead of only through the hook. AudioWorkletGlobalScope is faked
// here: a base class with a MessagePort, a registerProcessor hook, and the
// `currentFrame` clock the processor schedules against.
//
// postMessage deliberately honours the TRANSFER LIST via structuredClone, which
// detaches the source buffer exactly as the real port does. That is not detail
// for its own sake: reading `chunk.length` after posting used to return 0
// because of it, which silently broke every self-stopping take while still
// producing perfectly good audio, so nothing else in the suite could see it.

interface PostedMessage {
  type: string;
  samples?: Float32Array;
  bodyFrames?: number;
  tailFrames?: number;
  reason?: string;
  startFrame?: number;
  prerollFrames?: number;
}

interface ProcessorLike {
  port: { onmessage: ((event: { data: unknown }) => void) | null };
  process: (inputs: Float32Array[][]) => boolean;
}

const QUANTUM = 128;
let posted: PostedMessage[] = [];
let ProcessorClass: new () => ProcessorLike;

beforeAll(async () => {
  class FakePort {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    postMessage(message: PostedMessage, transfer?: Transferable[]) {
      if (transfer) posted.push(structuredClone(message, { transfer }));
      else posted.push(structuredClone(message));
    }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.AudioWorkletProcessor = class {
    port = new FakePort();
  };
  globals.currentFrame = 0;
  globals.registerProcessor = (_name: string, processor: new () => ProcessorLike) => {
    ProcessorClass = processor;
  };
  await import('../../src/audio/looper-recorder.worklet.js');
});

beforeEach(() => {
  posted = [];
  (globalThis as unknown as Record<string, unknown>).currentFrame = 0;
});

/** One render quantum of constant-level input. */
function quantum(level: number): Float32Array[][] {
  return [[new Float32Array(QUANTUM).fill(level)]];
}

/** Run `count` quanta of `level` through the processor, advancing the clock. */
function run(processor: ProcessorLike, count: number, level: number): void {
  const globals = globalThis as unknown as Record<string, number>;
  for (let index = 0; index < count; index++) {
    processor.process(quantum(level));
    globals.currentFrame += QUANTUM;
  }
}

function send(processor: ProcessorLike, message: unknown): void {
  processor.port.onmessage?.({ data: message });
}

function capturedFrames(): number {
  return posted
    .filter((message) => message.type === 'chunk')
    .reduce((total, message) => total + (message.samples?.length ?? 0), 0);
}

function ended(): PostedMessage | undefined {
  return posted.find((message) => message.type === 'ended');
}

describe('frame-armed capture', () => {
  it('starts exactly on the target frame, mid-quantum', () => {
    const processor = new ProcessorClass();
    // Target sits 20 frames into the third quantum.
    send(processor, { type: 'arm', mode: 'frame', startFrame: 2 * QUANTUM + 20, tailFrames: 0 });
    run(processor, 5, 0.5);
    const started = posted.find((message) => message.type === 'started');
    expect(started?.startFrame).toBe(2 * QUANTUM + 20);
    // Two quanta before the start are skipped; the third contributes its tail.
    expect(capturedFrames()).toBe(3 * QUANTUM - 20);
  });

  it('stops itself after a fixed body length, to the sample', () => {
    const processor = new ProcessorClass();
    const bodyFrames = 3 * QUANTUM + 55; // deliberately not a whole quantum
    send(processor, { type: 'arm', mode: 'frame', startFrame: 0, bodyFrames, tailFrames: 0 });
    run(processor, 10, 0.5);
    expect(ended()).toMatchObject({ bodyFrames, reason: 'length' });
    expect(capturedFrames()).toBe(bodyFrames);
  });

  it('keeps a tail past the body and reports the split', () => {
    const processor = new ProcessorClass();
    const bodyFrames = 2 * QUANTUM;
    const tailFrames = QUANTUM + 30;
    send(processor, { type: 'arm', mode: 'frame', startFrame: 0, bodyFrames, tailFrames });
    run(processor, 10, 0.5);
    expect(ended()).toMatchObject({ bodyFrames, tailFrames });
    // Body and tail are one continuous stream: the hook splits it at bodyFrames.
    expect(capturedFrames()).toBe(bodyFrames + tailFrames);
  });

  it('ends the body at the scheduled stop frame, not when the message lands', () => {
    const processor = new ProcessorClass();
    send(processor, { type: 'arm', mode: 'frame', startFrame: 0, tailFrames: QUANTUM });
    run(processor, 2, 0.5);
    // Ask to stop 100 frames into the future: the latency offset the hook adds
    // to the stop edge so a take is as long as the gap between the presses.
    send(processor, { type: 'stop', stopFrame: 2 * QUANTUM + 100 });
    run(processor, 4, 0.5);
    expect(ended()).toMatchObject({ bodyFrames: 2 * QUANTUM + 100, reason: 'stop' });
  });

  it('cancels instead of ending when stopped before capture began', () => {
    const processor = new ProcessorClass();
    send(processor, { type: 'arm', mode: 'frame', startFrame: 10 * QUANTUM, tailFrames: 0 });
    run(processor, 2, 0.5);
    send(processor, { type: 'stop', stopFrame: 2 * QUANTUM });
    run(processor, 2, 0.5);
    expect(posted.some((message) => message.type === 'cancelled')).toBe(true);
    expect(ended()).toBeUndefined();
  });
});

describe('level-armed capture', () => {
  it('waits for the level, then delivers the pre-roll that preceded it', () => {
    const processor = new ProcessorClass();
    const prerollFrames = 4 * QUANTUM;
    send(processor, {
      type: 'arm',
      mode: 'level',
      threshold: 0.1,
      prerollFrames,
      holdQuanta: 2,
      tailFrames: 0,
    });
    run(processor, 6, 0.0); // silence: nothing captured, ring filling
    expect(capturedFrames()).toBe(0);
    run(processor, 3, 0.5); // a note: crosses, holds, fires
    const started = posted.find((message) => message.type === 'started');
    expect(started).toBeDefined();
    // The attack is INSIDE the recording, with air before it , the whole point
    // of the pre-roll, and what the hook's onset search then refines.
    expect(started?.prerollFrames).toBe(prerollFrames - 2 * QUANTUM);
    expect(capturedFrames()).toBeGreaterThanOrEqual(prerollFrames);
  });

  it('ignores a single-quantum pop that does not hold', () => {
    const processor = new ProcessorClass();
    send(processor, {
      type: 'arm',
      mode: 'level',
      threshold: 0.1,
      prerollFrames: 2 * QUANTUM,
      holdQuanta: 2,
      tailFrames: 0,
    });
    run(processor, 2, 0.0);
    run(processor, 1, 0.9); // the pop
    run(processor, 3, 0.0); // gone again
    expect(posted.some((message) => message.type === 'started')).toBe(false);
    expect(capturedFrames()).toBe(0);
  });

  it('still honours a fixed body length once triggered', () => {
    const processor = new ProcessorClass();
    const prerollFrames = QUANTUM;
    const bodyFrames = 5 * QUANTUM;
    send(processor, {
      type: 'arm',
      mode: 'level',
      threshold: 0.1,
      prerollFrames,
      holdQuanta: 1,
      bodyFrames,
      tailFrames: 0,
    });
    run(processor, 2, 0.0);
    run(processor, 12, 0.5);
    expect(ended()).toMatchObject({ bodyFrames, reason: 'length' });
  });
});
