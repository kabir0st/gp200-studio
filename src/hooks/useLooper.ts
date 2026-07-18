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
// audioWorklet.addModule() rejects data: URLs; this pattern avoids that.
const recorderWorkletUrl = new URL('../audio/looper-recorder.worklet.js', import.meta.url).href;

// Multi-track loop station built on the shared audio engine (useAudioMeter via
// AudioEngineProvider). It taps the same GP-200 input source node, records raw
// PCM through an AudioWorklet, and plays each track back as a looping
// AudioBufferSourceNode. The first recorded track sets the master loop length;
// later tracks are quantized to whole multiples of it and launched on the next
// loop boundary so everything stays phase-locked. All timing math lives in the
// pure `looperTransport` core; this hook is the Web Audio glue + React state.
//
// Tracks are DYNAMIC: every record→stop cycle appends a new track (there is no
// fixed slot count). The four transport controls the hardware bindings target:
// toggleRecord (record new track / stop), togglePlayAll (play all / stop all),
// selectNextTrack / selectPrevTrack (move the selection the UI and EXP pedal
// operate on).

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
  /** audio engine is active; the looper can record/play */
  ready: boolean;
  tracks: LooperTrack[];
  isRecording: boolean;
  /** id of the track currently being recorded, or null */
  recordArmedTrack: number | null;
  masterLoopLengthSec: number | null;
  /** the track the UI highlights and Track +/- moves; null when no tracks */
  selectedTrack: number | null;
  anyPlaying: boolean;
  /** 0..1 within the master loop; read inside rAF, not React state */
  getPlayhead: () => number;
  /** record a NEW track, or stop the recording in progress */
  toggleRecord: () => void;
  /** stop every playing track, or restart all recorded tracks together */
  togglePlayAll: () => void;
  /** Play/stop the selected track only (the footswitch-bound action). */
  togglePlaySelected: () => void;
  /** Mute/unmute the selected track only (the footswitch-bound action). */
  toggleMuteSelected: () => void;
  selectNextTrack: () => void;
  selectPrevTrack: () => void;
  selectTrack: (trackId: number) => void;
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

export function useLooper(engine: AudioMeterApi): LooperApi {
  const [tracks, setTracks] = useState<LooperTrack[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordArmedTrack, setRecordArmedTrack] = useState<number | null>(null);
  const [masterLoopLengthSec, setMasterLoopLengthSec] = useState<number | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);

  // Ref mirrors so transport callbacks registered once (MIDI dispatch) always
  // see current values.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const selectedTrackRef = useRef(selectedTrack);
  selectedTrackRef.current = selectedTrack;

  // Web Audio graph (rebuilt whenever the engine opens a fresh context).
  const graphCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<AudioWorkletNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const trackNodesRef = useRef<Map<number, TrackNodes>>(new Map());
  const workletLoadRef = useRef<Promise<void> | null>(null);

  // Recording accumulation + transport anchor.
  const recordChunksRef = useRef<Float32Array[]>([]);
  const recordingTrackRef = useRef<number | null>(null);
  const masterSamplesRef = useRef<number | null>(null);
  const transportStartRef = useRef<number>(0);
  const loopDurationRef = useRef<number>(0);
  const nextTrackIdRef = useRef(0);

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

    graphCtxRef.current = ctx;
    recorderRef.current = recorder;
    masterGainRef.current = master;
    // A fresh context invalidates every node from the old one.
    trackNodesRef.current = new Map();
    return true;
  }, [engine]);

  /** Create the per-track gain chain for a newly recorded track. */
  const createTrackNodes = useCallback((id: number): TrackNodes | null => {
    const ctx = graphCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return null;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(master);
    const nodes: TrackNodes = { gain, gainValue: 1, buffer: null, source: null, lengthLoops: 0 };
    trackNodesRef.current.set(id, nodes);
    return nodes;
  }, []);

  // Launch a track's buffer looping. First track anchors the transport at
  // ctx.currentTime; later tracks begin on the next master-loop boundary.
  const startTrackPlayback = useCallback((id: number) => {
    const ctx = graphCtxRef.current;
    const nodes = trackNodesRef.current.get(id);
    if (!ctx || !nodes?.buffer) return;
    nodes.source?.stop();
    nodes.source?.disconnect();

    const src = ctx.createBufferSource();
    src.buffer = nodes.buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = nodes.buffer.duration;
    src.connect(nodes.gain);

    let startAt = ctx.currentTime;
    if (masterSamplesRef.current !== null && loopDurationRef.current > 0) {
      startAt = nextBoundary(ctx.currentTime, transportStartRef.current, loopDurationRef.current);
    }
    src.start(startAt);
    nodes.source = src;
    patchTrack(id, { state: 'playing' });
  }, [patchTrack]);

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
      // Nothing captured: drop the just-created track again.
      trackNodesRef.current.delete(trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
      setSelectedTrack((prev) => {
        if (prev !== trackId) return prev;
        const remaining = tracksRef.current.filter((t) => t.id !== trackId);
        if (remaining.length === 0) return null;
        return remaining[remaining.length - 1].id;
      });
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
    const nodes = trackNodesRef.current.get(trackId);
    if (!nodes) return;
    nodes.buffer = buffer;
    nodes.lengthLoops = lengthLoops;
    patchTrack(trackId, { hasAudio: true, lengthLoops });
    startTrackPlayback(trackId);
  }, [patchTrack, startTrackPlayback]);

  const startRecordNewTrack = useCallback(() => {
    void (async () => {
      const ok = await ensureGraph();
      const recorder = recorderRef.current;
      if (!ok || !recorder || recordingTrackRef.current !== null) return;
      const trackId = nextTrackIdRef.current;
      nextTrackIdRef.current += 1;
      if (!createTrackNodes(trackId)) return;
      recordChunksRef.current = [];
      recordingTrackRef.current = trackId;
      setIsRecording(true);
      setRecordArmedTrack(trackId);
      setTracks((prev) => [
        ...prev,
        { id: trackId, state: 'recording', muted: false, hasAudio: false, lengthLoops: 0 },
      ]);
      setSelectedTrack(trackId);
      recorder.port.postMessage({ type: 'start' });
    })();
  }, [createTrackNodes, ensureGraph]);

  /** Record a new track, or stop (and keep) the recording in progress. */
  const toggleRecord = useCallback(() => {
    if (recordingTrackRef.current !== null) stopRecord();
    else startRecordNewTrack();
  }, [startRecordNewTrack, stopRecord]);

  const stopTrack = useCallback((id: number) => {
    const nodes = trackNodesRef.current.get(id);
    if (nodes?.source) {
      nodes.source.stop();
      nodes.source.disconnect();
      nodes.source = null;
    }
  }, []);

  const togglePlay = useCallback((id: number) => {
    const nodes = trackNodesRef.current.get(id);
    if (!nodes?.buffer) return;
    if (nodes.source) {
      stopTrack(id);
      patchTrack(id, { state: 'stopped' });
    } else {
      startTrackPlayback(id);
    }
  }, [patchTrack, startTrackPlayback, stopTrack]);

  /**
   * Play/stop ONLY the selected track — what the bound footswitch drives.
   * Deliberately not togglePlayAll: a stomp acts on the track the ◀ ▶ switches
   * have selected, leaving the rest of the loop playing underneath. Reads the
   * ref, not state, because the MIDI tap holds a stable looper ref.
   */
  const togglePlaySelected = useCallback(() => {
    const id = selectedTrackRef.current;
    if (id === null) return;
    togglePlay(id);
  }, [togglePlay]);

  /** Stop everything, or restart every recorded track phase-locked. */
  const togglePlayAll = useCallback(() => {
    const playing = tracksRef.current.some((t) => t.state === 'playing');
    if (playing) {
      for (const track of tracksRef.current) {
        if (track.state !== 'playing') continue;
        stopTrack(track.id);
        patchTrack(track.id, { state: 'stopped' });
      }
      return;
    }
    const ctx = graphCtxRef.current;
    if (ctx) transportStartRef.current = ctx.currentTime; // fresh common anchor
    for (const track of tracksRef.current) {
      if (track.hasAudio) startTrackPlayback(track.id);
    }
  }, [patchTrack, startTrackPlayback, stopTrack]);

  const selectTrack = useCallback((trackId: number) => {
    if (tracksRef.current.some((t) => t.id === trackId)) setSelectedTrack(trackId);
  }, []);

  const stepSelection = useCallback((step: number) => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    const currentIndex = list.findIndex((t) => t.id === selectedTrackRef.current);
    let nextIndex = currentIndex + step;
    if (currentIndex === -1) nextIndex = 0;
    // wrap around so a footswitch can cycle endlessly
    nextIndex = (nextIndex + list.length) % list.length;
    setSelectedTrack(list[nextIndex].id);
  }, []);

  const selectNextTrack = useCallback(() => stepSelection(1), [stepSelection]);
  const selectPrevTrack = useCallback(() => stepSelection(-1), [stepSelection]);

  const setMute = useCallback((id: number, muted: boolean) => {
    const nodes = trackNodesRef.current.get(id);
    const ctx = graphCtxRef.current;
    if (nodes && ctx) {
      let target = nodes.gainValue;
      if (muted) target = 0;
      nodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.01);
    }
    patchTrack(id, { muted });
  }, [patchTrack]);

  /** Mute/unmute ONLY the selected track — the footswitch counterpart of the
   *  per-row MUTE button, same selected-track scope as togglePlaySelected.
   *  Declared after setMute so the dep array isn't a TDZ reference. */
  const toggleMuteSelected = useCallback(() => {
    const id = selectedTrackRef.current;
    if (id === null) return;
    const track = tracksRef.current.find((t) => t.id === id);
    if (!track) return;
    setMute(id, !track.muted);
  }, [setMute]);

  const resetTransportIfEmpty = useCallback(() => {
    let anyAudio = false;
    for (const nodes of trackNodesRef.current.values()) {
      if (nodes.buffer) anyAudio = true;
    }
    if (!anyAudio) {
      masterSamplesRef.current = null;
      loopDurationRef.current = 0;
      transportStartRef.current = 0;
      setMasterLoopLengthSec(null);
    }
  }, []);

  /** Remove a track entirely (tracks are dynamic; clearing deletes the row). */
  const clear = useCallback((id: number) => {
    stopTrack(id);
    const nodes = trackNodesRef.current.get(id);
    if (nodes) nodes.gain.disconnect();
    trackNodesRef.current.delete(id);
    if (recordingTrackRef.current === id) {
      recordingTrackRef.current = null;
      setIsRecording(false);
      setRecordArmedTrack(null);
    }
    const remaining = tracksRef.current.filter((t) => t.id !== id);
    setTracks(remaining);
    setSelectedTrack((prev) => {
      if (prev !== id) return prev;
      if (remaining.length === 0) return null;
      return remaining[remaining.length - 1].id;
    });
    resetTransportIfEmpty();
  }, [resetTransportIfEmpty, stopTrack]);

  const clearAll = useCallback(() => {
    for (const track of tracksRef.current) stopTrack(track.id);
    for (const nodes of trackNodesRef.current.values()) nodes.gain.disconnect();
    trackNodesRef.current = new Map();
    recordingTrackRef.current = null;
    masterSamplesRef.current = null;
    loopDurationRef.current = 0;
    transportStartRef.current = 0;
    setIsRecording(false);
    setRecordArmedTrack(null);
    setMasterLoopLengthSec(null);
    setTracks([]);
    setSelectedTrack(null);
  }, [stopTrack]);

  const setTrackGain = useCallback((id: number, gain: number) => {
    const nodes = trackNodesRef.current.get(id);
    const ctx = graphCtxRef.current;
    if (!nodes || !ctx) return;
    nodes.gainValue = gain;
    const muted = tracksRef.current.find((t) => t.id === id)?.muted ?? false;
    if (!muted) nodes.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.01);
  }, []);

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
    trackNodesRef.current = new Map();
    graphCtxRef.current = null;
    workletLoadRef.current = null;
    recordChunksRef.current = [];
    recordingTrackRef.current = null;
    masterSamplesRef.current = null;
    loopDurationRef.current = 0;
    transportStartRef.current = 0;
    setIsRecording(false);
    setRecordArmedTrack(null);
    setMasterLoopLengthSec(null);
    setTracks([]);
    setSelectedTrack(null);
  }, [engine.active]);

  return {
    ready: engine.active,
    tracks,
    isRecording,
    recordArmedTrack,
    masterLoopLengthSec,
    selectedTrack,
    anyPlaying: tracks.some((track) => track.state === 'playing'),
    getPlayhead,
    toggleRecord,
    togglePlayAll,
    togglePlaySelected,
    toggleMuteSelected,
    selectNextTrack,
    selectPrevTrack,
    selectTrack,
    togglePlay,
    setMute,
    clear,
    clearAll,
    setTrackGain,
    setMasterGain,
  };
}
