import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMeterApi } from '@/hooks/useAudioMeter';
import {
  quantizeToMaster,
  samplesToSeconds,
  nextBoundary,
  playhead,
} from '@/core/looperTransport';

// `new URL(..., import.meta.url)` (not a `?url` import): Vite always emits this
// as a real, separately-fetchable asset file. A `?url` import to a small file
// gets inlined as a data: URL under the 4 KB limit, and Chromium's
// audioWorklet.addModule() rejects data: URLs — this pattern avoids that.
const recorderWorkletUrl = new URL('../audio/looper-recorder.worklet.js', import.meta.url).href;

// Multi-track loop station built on the shared audio engine (useAudioMeter via
// AudioEngineProvider). It taps the same GP-200 input source node, records raw
// PCM through an AudioWorklet, and plays each track back as a looping
// AudioBufferSourceNode. The first recorded track sets the master loop length;
// later tracks are quantized to whole multiples of it and launched on the next
// loop boundary so everything stays phase-locked. All timing math lives in the
// pure `looperTransport` core; this hook is the Web Audio glue + React state.

export const TRACK_COUNT = 4;

export type TrackState = 'empty' | 'recording' | 'playing' | 'stopped';

export interface LooperTrack {
  id: number;
  state: TrackState;
  muted: boolean;
  hasAudio: boolean;
  /** whole master-loop multiples this track spans (0 when empty) */
  lengthLoops: number;
}

export interface LooperApi {
  /** audio engine is active — the looper can record/play */
  ready: boolean;
  tracks: LooperTrack[];
  isRecording: boolean;
  recordArmedTrack: number | null;
  masterLoopLengthSec: number | null;
  /** 0..1 within the master loop — read inside rAF, not React state */
  getPlayhead: () => number;
  startRecord: (trackId: number) => void;
  stopRecord: () => void;
  togglePlay: (trackId: number) => void;
  setMute: (trackId: number, muted: boolean) => void;
  clear: (trackId: number) => void;
  clearAll: () => void;
  setTrackGain: (trackId: number, gain: number) => void;
  setMasterGain: (gain: number) => void;
}

// Per-track live Web Audio nodes + captured buffer (kept in a ref, never state).
interface TrackNodes {
  gain: GainNode;
  gainValue: number;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  lengthLoops: number;
}

function emptyTrack(id: number): LooperTrack {
  return { id, state: 'empty', muted: false, hasAudio: false, lengthLoops: 0 };
}

export function useLooper(engine: AudioMeterApi): LooperApi {
  const [tracks, setTracks] = useState<LooperTrack[]>(() =>
    Array.from({ length: TRACK_COUNT }, (_, i) => emptyTrack(i)),
  );
  const [isRecording, setIsRecording] = useState(false);
  const [recordArmedTrack, setRecordArmedTrack] = useState<number | null>(null);
  const [masterLoopLengthSec, setMasterLoopLengthSec] = useState<number | null>(null);

  // Web Audio graph (rebuilt whenever the engine opens a fresh context).
  const graphCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<AudioWorkletNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const trackNodesRef = useRef<TrackNodes[]>([]);
  const workletLoadRef = useRef<Promise<void> | null>(null);

  // Recording accumulation + transport anchor.
  const recordChunksRef = useRef<Float32Array[]>([]);
  const recordingTrackRef = useRef<number | null>(null);
  const masterSamplesRef = useRef<number | null>(null);
  const transportStartRef = useRef<number>(0);
  const loopDurationRef = useRef<number>(0);
  const recordHistoryRef = useRef<number[]>([]);

  const patchTrack = useCallback((id: number, next: Partial<LooperTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...next } : t)));
  }, []);

  // Build (or rebuild) the node graph for the engine's current context. Loads
  // the recorder worklet once per context and wires source → recorder (a silent
  // sink kept in the render graph) plus a master gain → destination.
  const ensureGraph = useCallback(async (): Promise<boolean> => {
    const ctx = engine.getContext();
    const source = engine.getSource();
    if (!ctx || !source) return false;
    if (graphCtxRef.current === ctx && recorderRef.current && masterGainRef.current) return true;

    if (!workletLoadRef.current || graphCtxRef.current !== ctx) {
      workletLoadRef.current = ctx.audioWorklet.addModule(recorderWorkletUrl);
    }
    await workletLoadRef.current;
    // Bail if the context was torn down while the module loaded.
    if (engine.getContext() !== ctx) return false;

    const recorder = new AudioWorkletNode(ctx, 'looper-recorder');
    recorder.port.onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg?.type === 'chunk' && recordingTrackRef.current !== null) {
        recordChunksRef.current.push(msg.samples as Float32Array);
      }
    };
    source.connect(recorder);
    // Keep the recorder in the render graph without making sound.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    recorder.connect(silent);
    silent.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    const trackNodes: TrackNodes[] = Array.from({ length: TRACK_COUNT }, () => {
      const gain = ctx.createGain();
      gain.gain.value = 1;
      gain.connect(master);
      return { gain, gainValue: 1, buffer: null, source: null, lengthLoops: 0 };
    });

    graphCtxRef.current = ctx;
    recorderRef.current = recorder;
    masterGainRef.current = master;
    trackNodesRef.current = trackNodes;
    return true;
  }, [engine]);

  // Launch a track's buffer looping. First track anchors the transport at
  // ctx.currentTime; later tracks begin on the next master-loop boundary.
  const startTrackPlayback = useCallback((id: number) => {
    const ctx = graphCtxRef.current;
    const nodes = trackNodesRef.current[id];
    if (!ctx || !nodes?.buffer) return;
    nodes.source?.stop();
    nodes.source?.disconnect();

    const src = ctx.createBufferSource();
    src.buffer = nodes.buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = nodes.buffer.duration;
    src.connect(nodes.gain);

    const startAt =
      masterSamplesRef.current === null || loopDurationRef.current <= 0
        ? ctx.currentTime
        : nextBoundary(ctx.currentTime, transportStartRef.current, loopDurationRef.current);
    src.start(startAt);
    nodes.source = src;
    patchTrack(id, { state: 'playing' });
  }, [patchTrack]);

  const startRecord = useCallback((trackId: number) => {
    void (async () => {
      const ok = await ensureGraph();
      const recorder = recorderRef.current;
      if (!ok || !recorder || recordingTrackRef.current !== null) return;
      recordChunksRef.current = [];
      recordingTrackRef.current = trackId;
      setIsRecording(true);
      setRecordArmedTrack(trackId);
      patchTrack(trackId, { state: 'recording' });
      recorder.port.postMessage({ type: 'start' });
    })();
  }, [ensureGraph, patchTrack]);

  const stopRecord = useCallback(() => {
    const ctx = graphCtxRef.current;
    const recorder = recorderRef.current;
    const trackId = recordingTrackRef.current;
    if (!ctx || !recorder || trackId === null) return;
    recorder.port.postMessage({ type: 'stop' });
    recordingTrackRef.current = null;
    setIsRecording(false);
    setRecordArmedTrack(null);

    const chunks = recordChunksRef.current;
    recordChunksRef.current = [];
    const captured = chunks.reduce((n, c) => n + c.length, 0);

    // Trim the input-latency head so tracks share a constant offset.
    const calibration = Math.round(ctx.baseLatency * ctx.sampleRate);
    const flat = new Float32Array(captured);
    let offset = 0;
    for (const c of chunks) { flat.set(c, offset); offset += c.length; }
    const trimmed = flat.subarray(Math.min(calibration, Math.max(0, captured - 1)));

    if (trimmed.length === 0) {
      patchTrack(trackId, { state: 'empty' });
      return;
    }

    let lengthSamples: number;
    let lengthLoops: number;
    if (masterSamplesRef.current === null) {
      // First track defines the master loop length + transport anchor.
      lengthSamples = trimmed.length;
      lengthLoops = 1;
      masterSamplesRef.current = lengthSamples;
      loopDurationRef.current = samplesToSeconds(lengthSamples, ctx.sampleRate);
      transportStartRef.current = ctx.currentTime;
      setMasterLoopLengthSec(loopDurationRef.current);
    } else {
      const q = quantizeToMaster(trimmed.length, masterSamplesRef.current);
      lengthSamples = q.samples;
      lengthLoops = q.loops;
    }

    const buffer = ctx.createBuffer(1, lengthSamples, ctx.sampleRate);
    buffer.copyToChannel(trimmed.subarray(0, Math.min(trimmed.length, lengthSamples)), 0);
    const nodes = trackNodesRef.current[trackId];
    nodes.buffer = buffer;
    nodes.lengthLoops = lengthLoops;
    recordHistoryRef.current.push(trackId);
    patchTrack(trackId, { hasAudio: true, lengthLoops });
    startTrackPlayback(trackId);
  }, [patchTrack, startTrackPlayback]);

  const stopTrack = useCallback((id: number) => {
    const nodes = trackNodesRef.current[id];
    if (nodes?.source) {
      nodes.source.stop();
      nodes.source.disconnect();
      nodes.source = null;
    }
  }, []);

  const togglePlay = useCallback((id: number) => {
    const nodes = trackNodesRef.current[id];
    if (!nodes?.buffer) return;
    if (nodes.source) {
      stopTrack(id);
      patchTrack(id, { state: 'stopped' });
    } else {
      startTrackPlayback(id);
    }
  }, [patchTrack, startTrackPlayback, stopTrack]);

  const setMute = useCallback((id: number, muted: boolean) => {
    const nodes = trackNodesRef.current[id];
    const ctx = graphCtxRef.current;
    if (nodes && ctx) nodes.gain.gain.setTargetAtTime(muted ? 0 : nodes.gainValue, ctx.currentTime, 0.01);
    patchTrack(id, { muted });
  }, [patchTrack]);

  const resetTransportIfEmpty = useCallback(() => {
    const anyAudio = trackNodesRef.current.some((n) => n?.buffer);
    if (!anyAudio) {
      masterSamplesRef.current = null;
      loopDurationRef.current = 0;
      transportStartRef.current = 0;
      setMasterLoopLengthSec(null);
    }
  }, []);

  const clear = useCallback((id: number) => {
    stopTrack(id);
    const nodes = trackNodesRef.current[id];
    if (nodes) { nodes.buffer = null; nodes.lengthLoops = 0; }
    recordHistoryRef.current = recordHistoryRef.current.filter((t) => t !== id);
    setTracks((prev) => prev.map((t) => (t.id === id ? emptyTrack(id) : t)));
    resetTransportIfEmpty();
  }, [resetTransportIfEmpty, stopTrack]);

  const clearAll = useCallback(() => {
    for (let i = 0; i < TRACK_COUNT; i++) {
      stopTrack(i);
      const nodes = trackNodesRef.current[i];
      if (nodes) { nodes.buffer = null; nodes.lengthLoops = 0; }
    }
    recordHistoryRef.current = [];
    recordingTrackRef.current = null;
    masterSamplesRef.current = null;
    loopDurationRef.current = 0;
    transportStartRef.current = 0;
    setIsRecording(false);
    setRecordArmedTrack(null);
    setMasterLoopLengthSec(null);
    setTracks(Array.from({ length: TRACK_COUNT }, (_, i) => emptyTrack(i)));
  }, [stopTrack]);

  const setTrackGain = useCallback((id: number, gain: number) => {
    const nodes = trackNodesRef.current[id];
    const ctx = graphCtxRef.current;
    if (!nodes || !ctx) return;
    nodes.gainValue = gain;
    if (!tracks[id]?.muted) nodes.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.01);
  }, [tracks]);

  const setMasterGain = useCallback((gain: number) => {
    const master = masterGainRef.current;
    const ctx = graphCtxRef.current;
    if (master && ctx) master.gain.setTargetAtTime(gain, ctx.currentTime, 0.01);
  }, []);

  const getPlayhead = useCallback(() => {
    const ctx = graphCtxRef.current;
    if (!ctx || masterSamplesRef.current === null) return 0;
    return playhead(ctx.currentTime, transportStartRef.current, loopDurationRef.current);
  }, []);

  // Tear down the graph and reset when the audio engine goes inactive (the
  // context is closed by useAudioMeter.disable, invalidating every node).
  useEffect(() => {
    if (engine.active) return;
    recorderRef.current = null;
    masterGainRef.current = null;
    trackNodesRef.current = [];
    graphCtxRef.current = null;
    workletLoadRef.current = null;
    recordChunksRef.current = [];
    recordingTrackRef.current = null;
    masterSamplesRef.current = null;
    loopDurationRef.current = 0;
    transportStartRef.current = 0;
    recordHistoryRef.current = [];
    setIsRecording(false);
    setRecordArmedTrack(null);
    setMasterLoopLengthSec(null);
    setTracks(Array.from({ length: TRACK_COUNT }, (_, i) => emptyTrack(i)));
  }, [engine.active]);

  return {
    ready: engine.active,
    tracks,
    isRecording,
    recordArmedTrack,
    masterLoopLengthSec,
    getPlayhead,
    startRecord,
    stopRecord,
    togglePlay,
    setMute,
    clear,
    clearAll,
    setTrackGain,
    setMasterGain,
  };
}
