import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMeterApi } from '@/hooks/useAudioMeter';
import {
  quantizeToBase,
  barsForCapture,
  cycleBars as widestBars,
  samplesToSeconds,
  nextBoundary,
  playhead,
} from '@/core/looperTransport';
import {
  computePeaks,
  peaksFromChannels,
  bucketsForBars,
  type Waveform,
} from '@/core/waveformPeaks';

// `new URL(..., import.meta.url)` (not a `?url` import): Vite always emits this
// as a real, separately-fetchable asset file. A `?url` import to a small file
// gets inlined as a data: URL under the 4 KB limit, and Chromium's
// audioWorklet.addModule() rejects data: URLs; this pattern avoids that.
const recorderWorkletUrl = new URL('../audio/looper-recorder.worklet.js', import.meta.url).href;

// Multi-track loop station built on the shared audio engine (useAudioMeter via
// AudioEngineProvider). It taps the same GP-200 input source node, records raw
// PCM through an AudioWorklet, and plays each track back as a looping
// AudioBufferSourceNode. Timing math lives in the pure `looperTransport` core;
// waveform reduction in `waveformPeaks`. This hook is the Web Audio glue +
// React state.
//
// ── The length model (the part worth reading) ────────────────────────────────
//
//   BASE   one "bar". Set ONCE by the first thing that lands: an imported file
//          takes its own length as the base, or — if you record before
//          importing — the first free-running take does. Never changes after.
//   CYCLE  the loop you hear and see: base x cycleBars, where cycleBars is the
//          LARGEST bar count across all tracks. Recording a take longer than the
//          current cycle GROWS it; deleting the take that was holding it wide
//          shrinks it back.
//
// Every track is TILED to exactly one cycle and looped, so all sources share an
// identical loop length and cannot drift apart — a 1-bar take under a 4-bar
// cycle is stored as that bar repeated four times. Growth re-tiles and relaunches
// everything on a boundary; the copy is a memcpy of already-decoded PCM and only
// happens when the cycle actually changes, which is rare.
//
// Recording is boundary-aligned once a base exists: REC ARMS the take and
// capture begins on the next cycle downbeat, so content always starts at cycle
// position 0 and the timeline can draw it truthfully. With no base yet there is
// no grid to wait for, so the first take rolls immediately.
//
// Tracks are DYNAMIC: every record->stop cycle appends a track, as does every
// import. The four transport controls the hardware bindings target: toggleRecord,
// togglePlayAll, selectNextTrack / selectPrevTrack.

export type TrackState = 'empty' | 'armed' | 'recording' | 'playing' | 'stopped';
export type TrackKind = 'record' | 'import';

export interface LooperTrack {
  id: number;
  /** where the audio came from — drives the lane's colour and label */
  kind: TrackKind;
  /** "TAKE 1" for recordings, the file's name for imports */
  label: string;
  state: TrackState;
  muted: boolean;
  hasAudio: boolean;
  /** whole bars of content this track holds (0 while empty) */
  bars: number;
  /** content duration in seconds (bars x base) */
  durationSec: number;
  /** reduced peak envelope for the timeline; null until audio is finalised */
  waveform: Waveform | null;
}

export interface LooperApi {
  /** audio engine is active; the looper can record/play */
  ready: boolean;
  tracks: LooperTrack[];
  isRecording: boolean;
  /** true between hitting REC and the downbeat that starts capture */
  isArmed: boolean;
  /** id of the track currently being recorded/armed, or null */
  recordArmedTrack: number | null;
  /** length of one bar in seconds; null until the first track lands */
  baseDurationSec: number | null;
  /** how many bars wide the loop currently is (1 when no tracks) */
  cycleBars: number;
  /** the full loop length in seconds; null until the first track lands */
  cycleDurationSec: number | null;
  /** the track the UI highlights and Track +/- moves; null when no tracks */
  selectedTrack: number | null;
  anyPlaying: boolean;
  /** 0..1 within the cycle; read inside rAF, not React state */
  getPlayhead: () => number;
  /** seconds captured so far in the take in progress (0 when not recording) */
  getRecordElapsedSec: () => number;
  /** true while an import is being decoded */
  importing: boolean;
  /** decode an audio file and add it as a track; resolves to an error or null */
  importAudioFile: (file: File) => Promise<string | null>;
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
  /** the track's own audio, exactly `bars` long */
  content: AudioBuffer | null;
  /** `content` tiled/truncated to exactly one cycle — what actually plays */
  tiled: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  bars: number;
}

/** Seconds of fade applied where a capture is trimmed, so the splice is silent. */
const TRIM_FADE_SEC = 0.005;

/**
 * Ramp the last `TRIM_FADE_SEC` of a trimmed capture down to zero, in place.
 * Rounding a take to the nearest bar can cut mid-waveform; without this the
 * loop point ticks audibly on every pass.
 */
function fadeTail(samples: Float32Array, sampleRate: number): void {
  const fade = Math.min(Math.round(TRIM_FADE_SEC * sampleRate), samples.length);
  if (fade <= 1) return;
  const start = samples.length - fade;
  for (let i = 0; i < fade; i++) samples[start + i] *= 1 - i / fade;
}

/**
 * Repeat `content` until it fills exactly `cycleSamples`, truncating any partial
 * final repeat. Returns `content` untouched when it already is one cycle long,
 * which is the common case for the track defining the cycle.
 */
function tileToCycle(ctx: BaseAudioContext, content: AudioBuffer, cycleSamples: number): AudioBuffer {
  if (content.length === cycleSamples) return content;
  const tiled = ctx.createBuffer(content.numberOfChannels, cycleSamples, content.sampleRate);
  for (let ch = 0; ch < content.numberOfChannels; ch++) {
    const src = content.getChannelData(ch);
    const dst = tiled.getChannelData(ch);
    for (let offset = 0; offset < cycleSamples; offset += content.length) {
      const take = Math.min(content.length, cycleSamples - offset);
      dst.set(take === content.length ? src : src.subarray(0, take), offset);
    }
  }
  return tiled;
}

export function useLooper(engine: AudioMeterApi): LooperApi {
  const [tracks, setTracks] = useState<LooperTrack[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recordArmedTrack, setRecordArmedTrack] = useState<number | null>(null);
  const [baseDurationSec, setBaseDurationSec] = useState<number | null>(null);
  const [cycleBars, setCycleBars] = useState(1);
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
  const recordStartTimeRef = useRef(0);
  const armTimerRef = useRef<number | null>(null);
  // The length model: one bar, and how many bars wide the cycle is.
  const baseSamplesRef = useRef<number | null>(null);
  const cycleBarsRef = useRef(1);
  const transportStartRef = useRef(0);
  const nextTrackIdRef = useRef(0);
  const takeCountRef = useRef(0);

  const patchTrack = useCallback((id: number, next: Partial<LooperTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...next } : t)));
  }, []);

  /** Cycle length in seconds, straight off the refs (safe inside rAF). */
  const cycleDuration = useCallback((): number => {
    const ctx = graphCtxRef.current;
    if (!ctx || baseSamplesRef.current === null) return 0;
    return samplesToSeconds(baseSamplesRef.current * cycleBarsRef.current, ctx.sampleRate);
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

  /** Create the per-track gain chain for a newly added track. */
  const createTrackNodes = useCallback((id: number): TrackNodes | null => {
    const ctx = graphCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return null;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(master);
    const nodes: TrackNodes = {
      gain,
      gainValue: 1,
      content: null,
      tiled: null,
      source: null,
      bars: 0,
    };
    trackNodesRef.current.set(id, nodes);
    return nodes;
  }, []);

  /**
   * Launch a track's tiled buffer looping, entered at the CURRENT cycle phase
   * rather than waiting for the next downbeat. Because every tiled buffer is
   * exactly one cycle long, starting at phase p with offset p*cycle lands the
   * track perfectly in sync immediately — so un-muting or re-playing a track
   * mid-loop is instant instead of stalling for up to a full cycle.
   */
  const startTrackPlayback = useCallback((id: number) => {
    const ctx = graphCtxRef.current;
    const nodes = trackNodesRef.current.get(id);
    if (!ctx || !nodes?.tiled) return;
    nodes.source?.stop();
    nodes.source?.disconnect();

    const src = ctx.createBufferSource();
    src.buffer = nodes.tiled;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = nodes.tiled.duration;
    src.connect(nodes.gain);

    const duration = cycleDuration();
    const phase = playhead(ctx.currentTime, transportStartRef.current, duration);
    src.start(ctx.currentTime, phase * duration);
    nodes.source = src;
    patchTrack(id, { state: 'playing' });
  }, [cycleDuration, patchTrack]);

  const stopTrack = useCallback((id: number) => {
    const nodes = trackNodesRef.current.get(id);
    if (nodes?.source) {
      nodes.source.stop();
      nodes.source.disconnect();
      nodes.source = null;
    }
  }, []);

  /**
   * Recompute the cycle from the tracks present, re-tile every track to it and
   * relaunch whatever was playing. Called after any add or delete: the cycle is
   * DERIVED from the widest track, so this both grows it for a long new take and
   * shrinks it again when that take is deleted.
   */
  const applyCycle = useCallback(() => {
    const ctx = graphCtxRef.current;
    const base = baseSamplesRef.current;
    if (!ctx || base === null) return;

    const bars: number[] = [];
    for (const nodes of trackNodesRef.current.values()) {
      if (nodes.content) bars.push(nodes.bars);
    }
    const nextBars = widestBars(bars);
    const changed = nextBars !== cycleBarsRef.current;
    cycleBarsRef.current = nextBars;
    setCycleBars(nextBars);

    const cycleSamples = base * nextBars;
    const wasPlaying: number[] = [];
    for (const [id, nodes] of trackNodesRef.current) {
      if (!nodes.content) continue;
      if (changed || !nodes.tiled) {
        if (nodes.source) wasPlaying.push(id);
        nodes.tiled = tileToCycle(ctx, nodes.content, cycleSamples);
      }
    }
    if (!changed) return;

    // The cycle length moved under the running sources, so they all have to be
    // rebuilt. Re-anchor to now: the loop restarts from its downbeat, which is
    // the natural "you just made the loop longer, here it goes from the top".
    for (const id of wasPlaying) stopTrack(id);
    transportStartRef.current = ctx.currentTime;
    for (const id of wasPlaying) startTrackPlayback(id);
  }, [startTrackPlayback, stopTrack]);

  /**
   * Install finalised audio on a track: set the base if this is the first thing
   * in, record the bar count, reduce the waveform, then re-derive the cycle.
   * Shared by both the recorder and the file importer.
   */
  const installTrackAudio = useCallback((
    id: number,
    content: AudioBuffer,
    bars: number,
    waveform: Waveform,
  ) => {
    const ctx = graphCtxRef.current;
    const nodes = trackNodesRef.current.get(id);
    if (!ctx || !nodes) return;
    nodes.content = content;
    nodes.bars = bars;
    nodes.tiled = null; // forces applyCycle to (re)tile it
    patchTrack(id, {
      hasAudio: true,
      bars,
      durationSec: content.duration,
      waveform,
    });
    applyCycle();
    startTrackPlayback(id);
  }, [applyCycle, patchTrack, startTrackPlayback]);

  /** Drop a track that never got audio (empty capture, failed decode). */
  const dropEmptyTrack = useCallback((trackId: number) => {
    trackNodesRef.current.get(trackId)?.gain.disconnect();
    trackNodesRef.current.delete(trackId);
    setTracks((prev) => prev.filter((t) => t.id !== trackId));
    setSelectedTrack((prev) => {
      if (prev !== trackId) return prev;
      const remaining = tracksRef.current.filter((t) => t.id !== trackId);
      if (remaining.length === 0) return null;
      return remaining[remaining.length - 1].id;
    });
  }, []);

  const stopRecord = useCallback(() => {
    const ctx = graphCtxRef.current;
    const recorder = recorderRef.current;
    const trackId = recordingTrackRef.current;
    if (!ctx || !recorder || trackId === null) return;
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    recorder.port.postMessage({ type: 'stop' });
    recordingTrackRef.current = null;
    setIsRecording(false);
    setIsArmed(false);
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
      dropEmptyTrack(trackId);
      return;
    }

    // Round to whole bars against the base — or, with no base yet, become it.
    const { bars, samples } = quantizeToBase(trimmed.length, baseSamplesRef.current ?? 0);
    if (baseSamplesRef.current === null) {
      baseSamplesRef.current = samples;
      transportStartRef.current = ctx.currentTime;
      setBaseDurationSec(samplesToSeconds(samples, ctx.sampleRate));
    }

    // Pad (short) or truncate (long) to the exact bar length, fading a cut so
    // the loop point does not click.
    const content = ctx.createBuffer(1, samples, ctx.sampleRate);
    const fitted = new Float32Array(samples);
    fitted.set(trimmed.subarray(0, Math.min(trimmed.length, samples)));
    if (trimmed.length > samples) fadeTail(fitted, ctx.sampleRate);
    content.copyToChannel(fitted, 0);

    installTrackAudio(trackId, content, bars, computePeaks(fitted, bucketsForBars(bars)));
  }, [dropEmptyTrack, installTrackAudio]);

  const startRecordNewTrack = useCallback(() => {
    void (async () => {
      const ok = await ensureGraph();
      const ctx = graphCtxRef.current;
      const recorder = recorderRef.current;
      if (!ok || !ctx || !recorder || recordingTrackRef.current !== null) return;
      const trackId = nextTrackIdRef.current;
      nextTrackIdRef.current += 1;
      takeCountRef.current += 1;
      if (!createTrackNodes(trackId)) return;
      recordChunksRef.current = [];
      recordingTrackRef.current = trackId;
      setRecordArmedTrack(trackId);
      setTracks((prev) => [
        ...prev,
        {
          id: trackId,
          kind: 'record',
          label: `TAKE ${takeCountRef.current}`,
          state: 'armed',
          muted: false,
          hasAudio: false,
          bars: 0,
          durationSec: 0,
          waveform: null,
        },
      ]);
      setSelectedTrack(trackId);

      const begin = () => {
        armTimerRef.current = null;
        // A stop between arming and the downbeat cancels the take.
        if (recordingTrackRef.current !== trackId) return;
        recordStartTimeRef.current = ctx.currentTime;
        setIsArmed(false);
        setIsRecording(true);
        patchTrack(trackId, { state: 'recording' });
        recorder.port.postMessage({ type: 'start' });
      };

      // No base yet means no grid to wait for: roll immediately and let this
      // take define the bar. Otherwise arm and drop in on the next downbeat.
      const duration = cycleDuration();
      if (baseSamplesRef.current === null || duration <= 0) {
        begin();
        return;
      }
      setIsArmed(true);
      const at = nextBoundary(ctx.currentTime, transportStartRef.current, duration);
      armTimerRef.current = window.setTimeout(begin, Math.max(0, (at - ctx.currentTime) * 1000));
    })();
  }, [createTrackNodes, cycleDuration, ensureGraph, patchTrack]);

  /** Record a new track, or stop (and keep) the recording in progress. */
  const toggleRecord = useCallback(() => {
    if (recordingTrackRef.current !== null) stopRecord();
    else startRecordNewTrack();
  }, [startRecordNewTrack, stopRecord]);

  /**
   * Decode an audio file and add it as a track. The FIRST import sets the base
   * bar; later ones are rounded to whole bars like any take. Stereo is preserved
   * — only the recorder's own capture is mono.
   */
  const importAudioFile = useCallback(async (file: File): Promise<string | null> => {
    setImporting(true);
    try {
      const ok = await ensureGraph();
      const ctx = graphCtxRef.current;
      if (!ok || !ctx) return 'Enable audio capture first.';

      let decoded: AudioBuffer;
      try {
        decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      } catch {
        return `Could not decode "${file.name}" — try WAV, MP3, OGG or FLAC.`;
      }
      if (decoded.length === 0) return `"${file.name}" contains no audio.`;
      // The context can close while a long file decodes.
      if (graphCtxRef.current !== ctx) return 'Audio capture stopped during import.';

      const trackId = nextTrackIdRef.current;
      nextTrackIdRef.current += 1;
      if (!createTrackNodes(trackId)) return 'Could not create the track.';
      setTracks((prev) => [
        ...prev,
        {
          id: trackId,
          kind: 'import',
          label: file.name,
          state: 'stopped',
          muted: false,
          hasAudio: false,
          bars: 0,
          durationSec: 0,
          waveform: null,
        },
      ]);
      setSelectedTrack(trackId);

      const bars = baseSamplesRef.current === null
        ? 1
        : barsForCapture(decoded.length, baseSamplesRef.current);
      if (baseSamplesRef.current === null) {
        // First thing in: the file's own length IS the bar, used verbatim.
        baseSamplesRef.current = decoded.length;
        transportStartRef.current = ctx.currentTime;
        setBaseDurationSec(decoded.duration);
      }
      const samples = baseSamplesRef.current * bars;

      // Fit to whole bars. An exact fit (always true for the first import)
      // reuses the decoded buffer untouched.
      let content = decoded;
      if (decoded.length !== samples) {
        content = ctx.createBuffer(decoded.numberOfChannels, samples, ctx.sampleRate);
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          const fitted = new Float32Array(samples);
          fitted.set(decoded.getChannelData(ch).subarray(0, Math.min(decoded.length, samples)));
          if (decoded.length > samples) fadeTail(fitted, ctx.sampleRate);
          content.copyToChannel(fitted, ch);
        }
      }

      const channels: Float32Array[] = [];
      for (let ch = 0; ch < content.numberOfChannels; ch++) channels.push(content.getChannelData(ch));
      installTrackAudio(trackId, content, bars, peaksFromChannels(channels, bucketsForBars(bars)));
      return null;
    } finally {
      setImporting(false);
    }
  }, [createTrackNodes, ensureGraph, installTrackAudio]);

  const togglePlay = useCallback((id: number) => {
    const nodes = trackNodesRef.current.get(id);
    if (!nodes?.tiled) return;
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
    for (const nodes of trackNodesRef.current.values()) {
      if (nodes.content) return;
    }
    baseSamplesRef.current = null;
    cycleBarsRef.current = 1;
    transportStartRef.current = 0;
    takeCountRef.current = 0;
    setBaseDurationSec(null);
    setCycleBars(1);
  }, []);

  /** Remove a track entirely (tracks are dynamic; clearing deletes the row). */
  const clear = useCallback((id: number) => {
    stopTrack(id);
    const nodes = trackNodesRef.current.get(id);
    if (nodes) nodes.gain.disconnect();
    trackNodesRef.current.delete(id);
    if (recordingTrackRef.current === id) {
      recordingTrackRef.current = null;
      if (armTimerRef.current !== null) {
        clearTimeout(armTimerRef.current);
        armTimerRef.current = null;
      }
      recorderRef.current?.port.postMessage({ type: 'stop' });
      setIsRecording(false);
      setIsArmed(false);
      setRecordArmedTrack(null);
    }
    const remaining = tracksRef.current.filter((t) => t.id !== id);
    setTracks(remaining);
    setSelectedTrack((prev) => {
      if (prev !== id) return prev;
      if (remaining.length === 0) return null;
      return remaining[remaining.length - 1].id;
    });
    // Deleting the widest track narrows the loop back down.
    applyCycle();
    resetTransportIfEmpty();
  }, [applyCycle, resetTransportIfEmpty, stopTrack]);

  const clearAll = useCallback(() => {
    for (const track of tracksRef.current) stopTrack(track.id);
    for (const nodes of trackNodesRef.current.values()) nodes.gain.disconnect();
    trackNodesRef.current = new Map();
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    recorderRef.current?.port.postMessage({ type: 'stop' });
    recordingTrackRef.current = null;
    baseSamplesRef.current = null;
    cycleBarsRef.current = 1;
    transportStartRef.current = 0;
    takeCountRef.current = 0;
    setIsRecording(false);
    setIsArmed(false);
    setRecordArmedTrack(null);
    setBaseDurationSec(null);
    setCycleBars(1);
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
    if (!ctx || baseSamplesRef.current === null) return 0;
    return playhead(ctx.currentTime, transportStartRef.current, cycleDuration());
  }, [cycleDuration]);

  const getRecordElapsedSec = useCallback(() => {
    const ctx = graphCtxRef.current;
    if (!ctx || recordingTrackRef.current === null || recordStartTimeRef.current === 0) return 0;
    return Math.max(0, ctx.currentTime - recordStartTimeRef.current);
  }, []);

  // Tear down the graph and reset when the audio engine goes inactive (the
  // context is closed by useAudioMeter.disable, invalidating every node).
  useEffect(() => {
    if (engine.active) return;
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    recorderRef.current = null;
    masterGainRef.current = null;
    trackNodesRef.current = new Map();
    graphCtxRef.current = null;
    workletLoadRef.current = null;
    recordChunksRef.current = [];
    recordingTrackRef.current = null;
    baseSamplesRef.current = null;
    cycleBarsRef.current = 1;
    transportStartRef.current = 0;
    takeCountRef.current = 0;
    setIsRecording(false);
    setIsArmed(false);
    setRecordArmedTrack(null);
    setBaseDurationSec(null);
    setCycleBars(1);
    setTracks([]);
    setSelectedTrack(null);
  }, [engine.active]);

  // Never leave an arm timer behind on unmount.
  useEffect(() => () => {
    if (armTimerRef.current !== null) clearTimeout(armTimerRef.current);
  }, []);

  const cycleDurationSec = baseDurationSec === null ? null : baseDurationSec * cycleBars;

  return {
    ready: engine.active,
    tracks,
    isRecording,
    isArmed,
    recordArmedTrack,
    baseDurationSec,
    cycleBars,
    cycleDurationSec,
    selectedTrack,
    anyPlaying: tracks.some((track) => track.state === 'playing'),
    getPlayhead,
    getRecordElapsedSec,
    importing,
    importAudioFile,
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
