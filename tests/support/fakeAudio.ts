// Minimal Web Audio doubles for testing useLooper under jsdom.
//
// The seam is deliberately the recorder worklet's PORT: the test plays the part
// of the worklet, posting 'started'/'chunk'/'ended' back the way the real one
// does. The worklet itself is covered separately and directly by
// looperRecorderWorklet.test.ts, so nothing is simulated twice here.
//
// Every node records what was asked of it rather than making sound, which is
// what the transport assertions read: whether a source was replaced at all, and
// the exact (when, offset) pair it was scheduled with.

import type { AudioMeterApi } from '@/hooks/useAudioMeter';

export class FakeAudioParam {
  value: number;

  constructor(value = 1) {
    this.value = value;
  }

  setTargetAtTime(target: number): this {
    this.value = target;
    return this;
  }

  setValueAtTime(target: number): this {
    this.value = target;
    return this;
  }
}

export class FakeGainNode {
  gain = new FakeAudioParam(1);
  disconnected = false;

  connect<T>(node: T): T {
    return node;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = [];
    for (let ch = 0; ch < numberOfChannels; ch++) this.channels.push(new Float32Array(length));
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }

  copyToChannel(source: Float32Array, channel: number): void {
    this.channels[channel].set(source.subarray(0, this.length));
  }
}

export class FakeBufferSourceNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  /** what start() was called with, or null if it never was */
  started: { when: number; offset: number } | null = null;
  /** what stop() was called with, or null while it is still running */
  stopped: number | null = null;
  disconnected = false;

  connect<T>(node: T): T {
    return node;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  start(when = 0, offset = 0): void {
    this.started = { when, offset };
  }

  stop(when = 0): void {
    this.stopped = when;
  }
}

/** Stands in for the recorder AudioWorkletNode; the test drives its port. */
export class FakeWorkletNode {
  /** every message the hook posted, newest last */
  readonly posted: Record<string, unknown>[] = [];
  readonly port = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    postMessage: (message: Record<string, unknown>): void => {
      this.posted.push(message);
    },
  };

  connect<T>(node: T): T {
    return node;
  }

  disconnect(): void {}

  /** Send a message back as the real worklet's port would. */
  emit(message: Record<string, unknown>): void {
    this.port.onmessage?.({ data: message });
  }

  /** The most recent message of a given type, or undefined. */
  last(type: string): Record<string, unknown> | undefined {
    for (let index = this.posted.length - 1; index >= 0; index--) {
      if (this.posted[index].type === type) return this.posted[index];
    }
    return undefined;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  baseLatency = 0.005;
  outputLatency = 0.02;
  readonly sampleRate: number;
  readonly destination = { name: 'destination' };
  readonly audioWorklet = { addModule: async (): Promise<void> => {} };
  /** every buffer source ever created, in order */
  readonly sources: FakeBufferSourceNode[] = [];

  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
  }

  createGain(): FakeGainNode {
    return new FakeGainNode();
  }

  createBufferSource(): FakeBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.sources.push(source);
    return source;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createWaveShaper(): { curve: Float32Array | null; oversample: string; connect: <T>(n: T) => T } {
    return { curve: null, oversample: 'none', connect: (node) => node };
  }

  /** One frame per four bytes, so a test can ask for a file of a known length. */
  async decodeAudioData(data: ArrayBuffer): Promise<FakeAudioBuffer> {
    return new FakeAudioBuffer(1, Math.floor(data.byteLength / 4), this.sampleRate);
  }

  /** Move the context clock on, the way real rendering would. */
  advance(seconds: number): void {
    this.currentTime += seconds;
  }
}

/** The looper's view of useAudioMeter, with a stream reporting a known latency. */
export function fakeEngine(ctx: FakeAudioContext, inputLatencySec = 0.01): AudioMeterApi {
  const source = {
    connect: <T,>(node: T): T => node,
    disconnect: (): void => {},
    mediaStream: {
      getAudioTracks: () => [{ getSettings: () => ({ latency: inputLatencySec }) }],
    },
  };
  return {
    active: true,
    starting: false,
    deviceLabel: 'FAKE',
    error: null,
    monitoring: false,
    outputDevices: [],
    outputDeviceId: '',
    enable: async () => {},
    disable: () => {},
    setMonitoring: () => {},
    setOutputDevice: () => {},
    getLevels: () => ({ input: 0, output: 0 }),
    getContext: () => ctx as unknown as AudioContext,
    getSource: () => source as unknown as MediaStreamAudioSourceNode,
  };
}

/**
 * Install the worklet constructor the hook reaches for, and hand back the
 * instance it builds. Returns a restore function for afterEach.
 */
export function installWorkletNode(): { current: FakeWorkletNode | null; restore: () => void } {
  const previous = (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode;
  const handle: { current: FakeWorkletNode | null; restore: () => void } = {
    current: null,
    restore: () => {
      (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = previous;
    },
  };
  (globalThis as { AudioWorkletNode?: unknown }).AudioWorkletNode = class {
    constructor() {
      const node = new FakeWorkletNode();
      handle.current = node;
      return node as unknown as this;
    }
  };
  return handle;
}
