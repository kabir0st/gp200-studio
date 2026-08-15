import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMeterApi } from '@/hooks/useAudioMeter';
import { track } from '@/core/analytics';
import {
  quantizeToBase,
  barsForCapture,
  cycleBars as widestBars,
  samplesToSeconds,
  secondsToSamples,
  nextBoundary,
  frameAtTime,
  playhead,
} from '@/core/looperTransport';
import {
  blendTail,
  findOnset,
  roundTripSamples,
  dbToGain,
  clampRecordSettings,
  loadRecordSettings,
  saveRecordSettings,
  softClipCurve,
  SILENCE_FLOOR,
  type LoopRecordSettings,
} from '@/core/loopCapture';
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
// AudioBufferSourceNode. Timing math lives in the pure `looperTransport` core,
// capture-edge maths in `loopCapture`, waveform reduction in `waveformPeaks`.
// This hook is the Web Audio glue + React state.
//
// ── The length model (the part worth reading) ────────────────────────────────
//
//   BASE   one "bar". Set ONCE by the first thing that lands: an imported file
//          takes its own length as the base, or , if you record before
//          importing , the first free-running take does. It can also be LOCKED
//          up front from the practice drum machine's tempo, which is the only
//          way to get a bar with no human reaction time baked into it.
//   CYCLE  the loop you hear and see: base x cycleBars, where cycleBars is the
//          LARGEST bar count across all tracks. Recording a take longer than the
//          current cycle GROWS it; deleting the take that was holding it wide
//          shrinks it back.
//
// Every track is TILED to exactly one cycle and looped, so all sources share an
// identical loop length and cannot drift apart , a 1-bar take under a 4-bar
// cycle is stored as that bar repeated four times. Growth re-tiles and relaunches
// everything on a boundary; the copy is a memcpy of already-decoded PCM and only
// happens when the cycle actually changes, which is rare.
//
// ── Where a take really begins and ends ──────────────────────────────────────
//
// Nothing about the capture edges is decided on the main thread. The recorder
// worklet is handed a target FRAME (or a trigger level) and starts/stops there
// itself, because a setTimeout is late by however long the UI is busy. Three
// arming modes, in the order they are chosen:
//
//   LEVEL  nothing is recorded yet and "start on first note" is on: the worklet
//          listens, keeps a rolling pre-roll, and fires on the attack. The
//          pre-roll is what makes this usable , a bare threshold always clips
//          the pick , and findOnset() then walks back to where the note left
//          the noise floor and snaps to a zero crossing.
//   GRID   audio exists, so capture begins on the next cycle downbeat and the
//          take always lands on the grid.
//   NOW    no grid worth waiting for: roll immediately.
//
// Every one of those start frames is pushed LATER by roundTripSamples(): the
// sample that carries the downbeat arrives output+input latency after the
// downbeat was scheduled. Compensating at the START (rather than trimming the
// head afterwards and padding the end with silence) is what keeps a take's
// length equal to what was played , and the STOP edge is pushed by the same
// amount, so a hand-stopped take is exactly the gap between the two presses.
// The output leg only counts when the player is following audio we scheduled
// (see captureOffsetFrames); with nothing playing there is nothing to follow.
//
// The loop point is joined by summing the ring-out CAPTURED PAST the loop end
// back over the downbeat (loopCapture.blendTail), never by fading the head in:
// the downbeat is the loudest transient in most takes and fading it is exactly
// what makes a loop sound like it is breathing.
//
// Tracks are DYNAMIC: every record->stop cycle appends a track, as does every
// import. The four transport controls the hardware bindings target: toggleRecord,
// togglePlayAll, selectNextTrack / selectPrevTrack.

export type TrackState = 'empty' | 'armed' | 'recording' | 'playing' | 'stopped';
export type TrackKind = 'record' | 'import';

export interface LooperTrack {
  id: number;
  /** where the audio came from , drives the lane's colour and label */
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
  /** true while the recorder is waiting for the first note to be played */
  isListening: boolean;
  /** id of the track currently being recorded/armed, or null */
  recordArmedTrack: number | null;
  /** length of one bar in seconds; null until the first track lands */
  baseDurationSec: number | null;
  /** the bar length was locked to a tempo instead of taken from a take */
  baseLocked: boolean;
  /** how many bars wide the loop currently is (1 when no tracks) */
  cycleBars: number;
  /** the full loop length in seconds; null until the first track lands */
  cycleDurationSec: number | null;
  /** the track the UI highlights and Track +/- moves; null when no tracks */
  selectedTrack: number | null;
  anyPlaying: boolean;
  /** at least one track holds finalised audio */
  hasContent: boolean;
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
  /** abandon the take in progress, keeping everything already recorded */
  cancelRecord: () => void;
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
  /** capture/timing preferences; persisted across sessions */
  settings: LoopRecordSettings;
  updateSettings: (patch: Partial<LoopRecordSettings>) => void;
  /** round trip the device itself reports, in ms (before the user trim) */
  latencyMs: number;
  /** fix the bar length to `seconds` before anything is recorded */
  lockBaseSeconds: (seconds: number) => void;
  /** release a locked bar length so the next take defines it again */
  unlockBase: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

// Per-track live Web Audio nodes + captured buffer (kept in a ref, never state).
interface TrackNodes {
  gain: GainNode;
  gainValue: number;
  /** the track's own audio, exactly `bars` long */
  content: AudioBuffer | null;
  /** `content` tiled/truncated to exactly one cycle , what actually plays */
  tiled: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  bars: number;
}

/** One track as an undo entry: the row plus the audio behind it. */
interface TrackSnapshot {
  row: LooperTrack;
  content: AudioBuffer;
  gainValue: number;
}

/** Everything an undo step has to put back. AudioBuffers are shared by
 *  reference, so a snapshot costs a few objects, not a copy of the audio. */
interface LooperSnapshot {
  tracks: TrackSnapshot[];
  baseSamples: number | null;
  baseLocked: boolean;
  transportStart: number;
  takeCount: number;
  nextTrackId: number;
  selectedTrack: number | null;
}

/** The take currently being captured, as the worklet reports it. */
interface PendingTake {
  trackId: number;
  /** true when the worklet is level-armed, so the head needs onset refinement */
  level: boolean;
  /** context frame the first posted sample sits on (set on 'started') */
  startFrame: number;
  /** frames posted before the level trigger (0 in frame mode) */
  prerollFrames: number;
  /** latency the start edge was pushed by; the stop edge uses the same */
  offsetFrames: number;
  started: boolean;
}

/** How many undo steps to keep. Snapshots are cheap; the audio is shared. */
const HISTORY_LIMIT = 24;
/** Pre-roll kept while level-armed, so the attack that fires it is recorded. */
const PREROLL_SEC = 0.08;
/** Zero-crossing search radius when placing a level-armed take's first sample. */
const ONSET_SNAP_SEC = 0.002;
/** Floor on how long the recorder keeps running past the loop end. */
const MIN_TAIL_SEC = 0.06;

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

/** Concatenate the posted capture chunks into one contiguous buffer. */
function flattenChunks(chunks: Float32Array[]): Float32Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const flat = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    flat.set(chunk, offset);
    offset += chunk.length;
  }
  return flat;
}

export function useLooper(engine: AudioMeterApi): LooperApi {
  const [tracks, setTracks] = useState<LooperTrack[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [importing, setImporting] = useState(false);
  const [recordArmedTrack, setRecordArmedTrack] = useState<number | null>(null);
  const [baseDurationSec, setBaseDurationSec] = useState<number | null>(null);
  const [baseLocked, setBaseLocked] = useState(false);
  const [cycleBars, setCycleBars] = useState(1);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [settings, setSettings] = useState<LoopRecordSettings>(loadRecordSettings);
  const [latencyMs, setLatencyMs] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Ref mirrors so transport callbacks registered once (MIDI dispatch) always
  // see current values.
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const selectedTrackRef = useRef(selectedTrack);
  selectedTrackRef.current = selectedTrack;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Web Audio graph (rebuilt whenever the engine opens a fresh context).
  const graphCtxRef = useRef<AudioContext | null>(null);
  const recorderRef = useRef<AudioWorkletNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const trackNodesRef = useRef<Map<number, TrackNodes>>(new Map());
  const workletLoadRef = useRef<Promise<void> | null>(null);

  // Recording accumulation + transport anchor.
  const recordChunksRef = useRef<Float32Array[]>([]);
  const recordingTrackRef = useRef<number | null>(null);
  const pendingTakeRef = useRef<PendingTake | null>(null);
  const recordStartTimeRef = useRef(0);
  // The length model: one bar, and how many bars wide the cycle is.
  const baseSamplesRef = useRef<number | null>(null);
  const baseLockedRef = useRef(false);
  const cycleBarsRef = useRef(1);
  const transportStartRef = useRef(0);
  const nextTrackIdRef = useRef(0);
  const takeCountRef = useRef(0);
  // The capture stream's own latency, read once when the graph is built.
  const inputLatencyRef = useRef(0);
  // Undo/redo stacks of whole-state snapshots.
  const undoRef = useRef<LooperSnapshot[]>([]);
  const redoRef = useRef<LooperSnapshot[]>([]);

  const patchTrack = useCallback((id: number, next: Partial<LooperTrack>) => {
    setTracks((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      return { ...row, ...next };
    }));
  }, []);

  /** True once any track holds finalised audio (an armed row does not count). */
  const anyTrackHasAudio = useCallback((): boolean => {
    for (const nodes of trackNodesRef.current.values()) {
      if (nodes.content) return true;
    }
    return false;
  }, []);

  /**
   * The round trip as it stands right now, and the number the panel shows.
   *
   * `outputLatency` is read LIVE rather than cached: Chromium reports 0 (or a
   * placeholder) until the context has actually rendered for a while, so a
   * value cached when the graph was built can be wrong by 200 ms. Falls back to
   * twice the buffer size where the driver never reports one.
   */
  const currentLatency = useCallback((): { inputSec: number; outputSec: number } => {
    const ctx = graphCtxRef.current;
    if (!ctx) return { inputSec: 0, outputSec: 0 };
    const outputSec = ctx.outputLatency || ctx.baseLatency * 2;
    const latency = { inputSec: inputLatencyRef.current, outputSec };
    setLatencyMs(Math.round((latency.inputSec + latency.outputSec) * 1000));
    return latency;
  }, []);

  /** Cycle length in seconds, straight off the refs (safe inside rAF). */
  const cycleDuration = useCallback((): number => {
    const ctx = graphCtxRef.current;
    if (!ctx || baseSamplesRef.current === null) return 0;
    return samplesToSeconds(baseSamplesRef.current * cycleBarsRef.current, ctx.sampleRate);
  }, []);

  // Handlers the recorder worklet's port calls. Held in a ref because the port
  // callback is installed once per AudioContext, and closing over the take
  // callbacks directly would pin the first render's versions of them.
  const takeHandlersRef = useRef({
    onStarted: (_startFrame: number, _prerollFrames: number) => {},
    onEnded: (_bodyFrames: number) => {},
    onCancelled: () => {},
  });

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
      if (!msg) return;
      if (msg.type === 'chunk') {
        if (recordingTrackRef.current !== null) {
          recordChunksRef.current.push(msg.samples as Float32Array);
        }
        return;
      }
      if (msg.type === 'started') {
        takeHandlersRef.current.onStarted(msg.startFrame as number, msg.prerollFrames as number);
        return;
      }
      if (msg.type === 'ended') {
        takeHandlersRef.current.onEnded(msg.bodyFrames as number);
        return;
      }
      if (msg.type === 'cancelled') takeHandlersRef.current.onCancelled();
    };
    source.connect(recorder);
    // Keep the recorder in the render graph without making sound.
    const silent = ctx.createGain();
    silent.gain.value = 0;
    recorder.connect(silent);
    silent.connect(ctx.destination);

    // mix bus → safety clipper → speakers. The level is a persisted setting,
    // so the freshly built node starts at whatever the user last left it on
    // rather than at unity (see the masterLevel effect below for later moves).
    const master = ctx.createGain();
    master.gain.value = settingsRef.current.masterLevel;
    const clipper = ctx.createWaveShaper();
    clipper.curve = softClipCurve();
    clipper.oversample = 'none';
    master.connect(clipper);
    clipper.connect(ctx.destination);

    // What the browser knows about the INPUT leg. This one is a property of the
    // opened stream and does not move, so it is read once with the graph.
    const streamTrack = source.mediaStream.getAudioTracks()[0];
    const streamSettings: MediaTrackSettings & { latency?: number } =
      streamTrack?.getSettings() ?? {};
    inputLatencyRef.current = streamSettings.latency ?? ctx.baseLatency;

    graphCtxRef.current = ctx;
    recorderRef.current = recorder;
    masterGainRef.current = master;
    // A fresh context invalidates every node from the old one.
    trackNodesRef.current = new Map();
    return true;
  }, [engine]);

  /** Create the per-track gain chain for a newly added track. */
  const createTrackNodes = useCallback((id: number, gainValue = 1): TrackNodes | null => {
    const ctx = graphCtxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master) return null;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    gain.connect(master);
    const nodes: TrackNodes = {
      gain,
      gainValue,
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
   * track perfectly in sync immediately , so un-muting or re-playing a track
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
    setTracks((prev) => prev.filter((row) => row.id !== trackId));
    setSelectedTrack((prev) => {
      if (prev !== trackId) return prev;
      const remaining = tracksRef.current.filter((row) => row.id !== trackId);
      if (remaining.length === 0) return null;
      return remaining[remaining.length - 1].id;
    });
  }, []);

  // ── Undo / redo ────────────────────────────────────────────────────────────

  /** Snapshot every track that holds audio. Rows still being armed or decoded
   *  are deliberately skipped: they are transient, and an undo that restored an
   *  empty lane would be restoring a UI artefact rather than a take. */
  const captureSnapshot = useCallback((): LooperSnapshot => {
    const snapshots: TrackSnapshot[] = [];
    for (const row of tracksRef.current) {
      const nodes = trackNodesRef.current.get(row.id);
      if (!nodes?.content) continue;
      snapshots.push({ row, content: nodes.content, gainValue: nodes.gainValue });
    }
    return {
      tracks: snapshots,
      baseSamples: baseSamplesRef.current,
      baseLocked: baseLockedRef.current,
      transportStart: transportStartRef.current,
      takeCount: takeCountRef.current,
      nextTrackId: nextTrackIdRef.current,
      selectedTrack: selectedTrackRef.current,
    };
  }, []);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }, []);

  /** Record the state BEFORE a destructive or additive change. */
  const pushHistory = useCallback(() => {
    undoRef.current.push(captureSnapshot());
    if (undoRef.current.length > HISTORY_LIMIT) undoRef.current.shift();
    redoRef.current = [];
    syncHistoryFlags();
  }, [captureSnapshot, syncHistoryFlags]);

  /** Rebuild the whole track set from a snapshot and relaunch what was playing. */
  const restoreSnapshot = useCallback((snapshot: LooperSnapshot) => {
    const ctx = graphCtxRef.current;
    if (!ctx) return;
    for (const [id, nodes] of trackNodesRef.current) {
      stopTrack(id);
      nodes.gain.disconnect();
    }
    trackNodesRef.current = new Map();

    baseSamplesRef.current = snapshot.baseSamples;
    baseLockedRef.current = snapshot.baseLocked;
    transportStartRef.current = snapshot.transportStart;
    takeCountRef.current = snapshot.takeCount;
    nextTrackIdRef.current = snapshot.nextTrackId;
    setBaseLocked(snapshot.baseLocked);
    let restoredBaseSec: number | null = null;
    if (snapshot.baseSamples !== null) {
      restoredBaseSec = samplesToSeconds(snapshot.baseSamples, ctx.sampleRate);
    }
    setBaseDurationSec(restoredBaseSec);

    for (const entry of snapshot.tracks) {
      const nodes = createTrackNodes(entry.row.id, entry.gainValue);
      if (!nodes) continue;
      nodes.content = entry.content;
      nodes.bars = entry.row.bars;
      if (entry.row.muted) nodes.gain.gain.value = 0;
    }
    setTracks(snapshot.tracks.map((entry) => entry.row));
    setSelectedTrack(snapshot.selectedTrack);
    cycleBarsRef.current = 0; // force applyCycle to re-tile everything
    applyCycle();
    // applyCycle re-anchors the transport when the cycle width moves, which is
    // right for a live edit and wrong for an undo: the restored tracks have to
    // land back on the phase they were recorded against.
    transportStartRef.current = snapshot.transportStart;
    for (const entry of snapshot.tracks) {
      if (entry.row.state === 'playing') startTrackPlayback(entry.row.id);
    }
  }, [applyCycle, createTrackNodes, startTrackPlayback, stopTrack]);

  // ── Recording ──────────────────────────────────────────────────────────────

  /**
   * Frames between an instant and the sample that carries it.
   *
   * `againstPlayback` is what decides whether the output leg counts. Dropping in
   * on a downbeat, the player is following audio we scheduled, so the full round
   * trip applies: they hear it one output latency late and their answer arrives
   * one input latency after that. Starting a take with nothing playing, there is
   * nothing to follow , only the input leg is real, and charging them for the
   * output leg would cut the first instant off the take.
   */
  const captureOffsetFrames = useCallback((againstPlayback: boolean): number => {
    const ctx = graphCtxRef.current;
    if (!ctx) return 0;
    const { inputSec, outputSec } = currentLatency();
    let outputLatencySec = 0;
    if (againstPlayback) outputLatencySec = outputSec;
    return roundTripSamples({
      outputLatencySec,
      inputLatencySec: inputSec,
      trimMs: settingsRef.current.latencyTrimMs,
      sampleRate: ctx.sampleRate,
    });
  }, [currentLatency]);

  /** Clear the recording UI state without touching the tracks. */
  const clearRecordState = useCallback(() => {
    recordingTrackRef.current = null;
    recordChunksRef.current = [];
    recordStartTimeRef.current = 0;
    setIsRecording(false);
    setIsArmed(false);
    setIsListening(false);
    setRecordArmedTrack(null);
  }, []);

  /** The worklet has begun capturing: note where, and switch the UI to REC. */
  const onCaptureStarted = useCallback((startFrame: number, prerollFrames: number) => {
    const ctx = graphCtxRef.current;
    const pending = pendingTakeRef.current;
    if (!ctx || !pending) return;
    pending.startFrame = startFrame;
    pending.prerollFrames = prerollFrames;
    pending.started = true;
    // Elapsed is capture progress, measured from the frame the body began on:
    // that is the number the bar counter and the fixed-length stop agree with,
    // so the readout reaches "bar 4 of 4" exactly as the take ends.
    recordStartTimeRef.current = samplesToSeconds(startFrame, ctx.sampleRate);
    setIsArmed(false);
    setIsListening(false);
    setIsRecording(true);
    patchTrack(pending.trackId, { state: 'recording' });
  }, [patchTrack]);

  /**
   * Turn the captured chunks into a track.
   *
   * `bodyFrames` is the loop itself; everything the worklet posted after it is
   * ring-out. Quantising can also push the loop point back inside the body, in
   * which case the trimmed overrun simply joins that ring-out , both are the
   * same thing musically, and both get summed over the downbeat.
   */
  const finalizeTake = useCallback((bodyFrames: number) => {
    const ctx = graphCtxRef.current;
    const pending = pendingTakeRef.current;
    pendingTakeRef.current = null;
    const chunks = recordChunksRef.current;
    clearRecordState();
    if (!ctx || !pending) return;

    const flat = flattenChunks(chunks);
    let head = 0;
    if (pending.level) {
      head = findOnset(flat, {
        triggerIndex: pending.prerollFrames,
        floor: SILENCE_FLOOR,
        maxBackoff: pending.prerollFrames,
        snapRadius: Math.round(ONSET_SNAP_SEC * ctx.sampleRate),
      });
    }
    const captured = Math.max(0, Math.min(bodyFrames, flat.length) - head);
    if (captured === 0) {
      dropEmptyTrack(pending.trackId);
      return;
    }

    // Round to whole bars against the base , or, with no base yet, become it.
    const { bars, samples } = quantizeToBase(captured, baseSamplesRef.current ?? 0);
    const firstContent = !anyTrackHasAudio();
    if (baseSamplesRef.current === null) {
      baseSamplesRef.current = samples;
      setBaseDurationSec(samplesToSeconds(samples, ctx.sampleRate));
    }
    if (firstContent) {
      // Anchor the transport to when this take was PLAYED: the scheduling clock
      // runs one output latency ahead of what the player hears, so subtracting
      // the round trip makes every later take line up with this one by ear.
      const { inputSec, outputSec } = currentLatency();
      transportStartRef.current =
        samplesToSeconds(pending.startFrame + head, ctx.sampleRate) - inputSec - outputSec;
    }

    const content = ctx.createBuffer(1, samples, ctx.sampleRate);
    const fitted = new Float32Array(samples);
    const bodyEnd = Math.min(head + samples, flat.length);
    fitted.set(flat.subarray(head, bodyEnd));
    // The loop join. NOT a crossfade: the head keeps its attack at full gain and
    // the ring-out decays over it, which is what a hardware looper does and what
    // makes the downbeat stay punchy across the wrap.
    const tailWanted = Math.round((settingsRef.current.tailBlendMs / 1000) * ctx.sampleRate);
    const tailEnd = Math.min(bodyEnd + tailWanted, flat.length);
    blendTail(fitted, flat.subarray(bodyEnd, tailEnd));
    content.copyToChannel(fitted, 0);

    // Snapshot here rather than at arm time: an import or a delete may have
    // landed while the take was rolling, and undo has to step back over THIS
    // take only. captureSnapshot skips content-less rows, so the take's own
    // armed lane is not in it.
    pushHistory();
    installTrackAudio(pending.trackId, content, bars, computePeaks(fitted, bucketsForBars(bars)));
  }, [
    clearRecordState,
    currentLatency,
    dropEmptyTrack,
    anyTrackHasAudio,
    installTrackAudio,
    pushHistory,
  ]);

  /** The worklet abandoned the take (cancel, or a stop while still waiting). */
  const onTakeCancelled = useCallback(() => {
    const pending = pendingTakeRef.current;
    pendingTakeRef.current = null;
    clearRecordState();
    if (pending) dropEmptyTrack(pending.trackId);
  }, [clearRecordState, dropEmptyTrack]);

  takeHandlersRef.current = {
    onStarted: onCaptureStarted,
    onEnded: finalizeTake,
    onCancelled: onTakeCancelled,
  };

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

      const current = settingsRef.current;
      const rate = ctx.sampleRate;
      const base = baseSamplesRef.current;
      const running = anyTrackHasAudio();
      // A fixed take length needs a bar to count in; without one the take runs
      // until it is stopped and defines the bar itself.
      let bodyFrames = 0;
      if (base !== null && current.recordBars !== null) bodyFrames = base * current.recordBars;
      // Keep recording past the end for the join, plus one pre-roll's worth: a
      // level-armed take shifts its head forward by up to that much when the
      // onset is refined, and the loop's last samples come out of the tail.
      const tailSec = Math.max(MIN_TAIL_SEC, current.tailBlendMs / 1000) + PREROLL_SEC;
      const tailFrames = Math.round(tailSec * rate);
      // Wait for the first note only while nothing is looping yet: once audio is
      // running there is a downbeat to drop in on, which is always the better
      // reference than "whenever the player happens to hit a string".
      const level = current.autoStart && !running;
      const onGrid = running && base !== null;
      const offsetFrames = captureOffsetFrames(onGrid);
      pendingTakeRef.current = {
        trackId,
        level,
        startFrame: 0,
        prerollFrames: 0,
        offsetFrames,
        started: false,
      };

      if (level) {
        recorder.port.postMessage({
          type: 'arm',
          mode: 'level',
          threshold: dbToGain(current.triggerDb),
          prerollFrames: Math.round(PREROLL_SEC * rate),
          holdQuanta: 2,
          bodyFrames,
          tailFrames,
        });
        setIsListening(true);
        return;
      }

      let startTime = ctx.currentTime;
      if (onGrid) {
        startTime = nextBoundary(ctx.currentTime, transportStartRef.current, cycleDuration());
        setIsArmed(true);
      }
      recorder.port.postMessage({
        type: 'arm',
        mode: 'frame',
        startFrame: frameAtTime(startTime, rate) + offsetFrames,
        bodyFrames,
        tailFrames,
      });
    })();
  }, [
    captureOffsetFrames,
    createTrackNodes,
    cycleDuration,
    ensureGraph,
    anyTrackHasAudio,
  ]);

  /** Stop the take in progress and keep it (the worklet still owes us a tail). */
  const stopRecord = useCallback(() => {
    const ctx = graphCtxRef.current;
    const recorder = recorderRef.current;
    const pending = pendingTakeRef.current;
    if (!ctx || !recorder || recordingTrackRef.current === null) return;
    // The stop edge moves by exactly what the start edge moved by, so the take
    // is as long as the gap between the two presses , not one latency short.
    // Without this the compensation would quietly shorten every free take.
    const stopFrame = frameAtTime(ctx.currentTime, ctx.sampleRate) + (pending?.offsetFrames ?? 0);
    recorder.port.postMessage({ type: 'stop', stopFrame });
    // The UI leaves REC immediately; finalizeTake lands a beat later, once the
    // ring-out has been captured.
    setIsRecording(false);
    setIsArmed(false);
    setIsListening(false);
  }, []);

  /** Abandon the take in progress; nothing is added and nothing is lost. */
  const cancelRecord = useCallback(() => {
    const recorder = recorderRef.current;
    if (recordingTrackRef.current === null) return;
    recorder?.port.postMessage({ type: 'cancel' });
    onTakeCancelled();
  }, [onTakeCancelled]);

  /** Record a new track, or stop (and keep) the recording in progress. */
  const toggleRecord = useCallback(() => {
    if (recordingTrackRef.current !== null) stopRecord();
    else {
      // Instrumented here rather than in LooperPanel: useLooperTriggers drives
      // the same call for MIDI-learned footswitches, and a panel-level event
      // would miss every hands-free loop , arguably the main way this gets used.
      track('looper_record', { tracks: tracksRef.current.length });
      startRecordNewTrack();
    }
  }, [startRecordNewTrack, stopRecord]);

  /**
   * Decode an audio file and add it as a track. The FIRST import sets the base
   * bar; later ones are rounded to whole bars like any take. Stereo is preserved
   * , only the recorder's own capture is mono.
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
        return `Could not decode "${file.name}" , try WAV, MP3, OGG or FLAC.`;
      }
      if (decoded.length === 0) return `"${file.name}" contains no audio.`;
      // The context can close while a long file decodes.
      if (graphCtxRef.current !== ctx) return 'Audio capture stopped during import.';

      const trackId = nextTrackIdRef.current;
      nextTrackIdRef.current += 1;
      if (!createTrackNodes(trackId)) return 'Could not create the track.';
      pushHistory();
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

      let bars = 1;
      if (baseSamplesRef.current !== null) {
        bars = barsForCapture(decoded.length, baseSamplesRef.current);
      }
      const firstContent = !anyTrackHasAudio();
      if (baseSamplesRef.current === null) {
        // First thing in: the file's own length IS the bar, used verbatim.
        baseSamplesRef.current = decoded.length;
        setBaseDurationSec(decoded.duration);
      }
      if (firstContent) transportStartRef.current = ctx.currentTime;
      const samples = baseSamplesRef.current * bars;

      // Fit to whole bars. An exact fit (always true for the first import)
      // reuses the decoded buffer untouched.
      let content = decoded;
      if (decoded.length !== samples) {
        content = ctx.createBuffer(decoded.numberOfChannels, samples, ctx.sampleRate);
        const tailWanted = Math.round(
          (settingsRef.current.tailBlendMs / 1000) * ctx.sampleRate,
        );
        for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
          const source = decoded.getChannelData(ch);
          const fitted = new Float32Array(samples);
          fitted.set(source.subarray(0, Math.min(decoded.length, samples)));
          // Same join as a recorded take: whatever the file had past the loop
          // point decays back over its head instead of being cut dead.
          const tailEnd = Math.min(samples + tailWanted, decoded.length);
          blendTail(fitted, source.subarray(Math.min(samples, decoded.length), tailEnd));
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
  }, [createTrackNodes, ensureGraph, anyTrackHasAudio, installTrackAudio, pushHistory]);

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
   * Play/stop ONLY the selected track , what the bound footswitch drives.
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
    const playing = tracksRef.current.some((row) => row.state === 'playing');
    if (playing) {
      for (const row of tracksRef.current) {
        if (row.state !== 'playing') continue;
        stopTrack(row.id);
        patchTrack(row.id, { state: 'stopped' });
      }
      return;
    }
    const ctx = graphCtxRef.current;
    if (ctx) transportStartRef.current = ctx.currentTime; // fresh common anchor
    for (const row of tracksRef.current) {
      if (row.hasAudio) startTrackPlayback(row.id);
    }
  }, [patchTrack, startTrackPlayback, stopTrack]);

  const selectTrack = useCallback((trackId: number) => {
    if (tracksRef.current.some((row) => row.id === trackId)) setSelectedTrack(trackId);
  }, []);

  const stepSelection = useCallback((step: number) => {
    const list = tracksRef.current;
    if (list.length === 0) return;
    const currentIndex = list.findIndex((row) => row.id === selectedTrackRef.current);
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

  /** Mute/unmute ONLY the selected track , the footswitch counterpart of the
   *  per-row MUTE button, same selected-track scope as togglePlaySelected.
   *  Declared after setMute so the dep array isn't a TDZ reference. */
  const toggleMuteSelected = useCallback(() => {
    const id = selectedTrackRef.current;
    if (id === null) return;
    const row = tracksRef.current.find((candidate) => candidate.id === id);
    if (!row) return;
    setMute(id, !row.muted);
  }, [setMute]);

  /** Drop the bar/transport once nothing is left , unless the bar was locked to
   *  a tempo, which is a deliberate setting and survives an empty board. */
  const resetTransportIfEmpty = useCallback(() => {
    if (anyTrackHasAudio()) return;
    takeCountRef.current = 0;
    cycleBarsRef.current = 1;
    setCycleBars(1);
    if (baseLockedRef.current) return;
    baseSamplesRef.current = null;
    transportStartRef.current = 0;
    setBaseDurationSec(null);
  }, [anyTrackHasAudio]);

  /** Remove a track entirely (tracks are dynamic; clearing deletes the row). */
  const clear = useCallback((id: number) => {
    if (recordingTrackRef.current === id) {
      cancelRecord();
      return;
    }
    pushHistory();
    stopTrack(id);
    const nodes = trackNodesRef.current.get(id);
    if (nodes) nodes.gain.disconnect();
    trackNodesRef.current.delete(id);
    const remaining = tracksRef.current.filter((row) => row.id !== id);
    setTracks(remaining);
    setSelectedTrack((prev) => {
      if (prev !== id) return prev;
      if (remaining.length === 0) return null;
      return remaining[remaining.length - 1].id;
    });
    // Deleting the widest track narrows the loop back down.
    applyCycle();
    resetTransportIfEmpty();
  }, [applyCycle, cancelRecord, pushHistory, resetTransportIfEmpty, stopTrack]);

  const clearAll = useCallback(() => {
    if (tracksRef.current.length === 0) return;
    pushHistory();
    for (const row of tracksRef.current) stopTrack(row.id);
    for (const nodes of trackNodesRef.current.values()) nodes.gain.disconnect();
    trackNodesRef.current = new Map();
    recorderRef.current?.port.postMessage({ type: 'cancel' });
    pendingTakeRef.current = null;
    clearRecordState();
    takeCountRef.current = 0;
    cycleBarsRef.current = 1;
    setCycleBars(1);
    setTracks([]);
    setSelectedTrack(null);
    if (baseLockedRef.current) return;
    baseSamplesRef.current = null;
    transportStartRef.current = 0;
    setBaseDurationSec(null);
  }, [clearRecordState, pushHistory, stopTrack]);

  /**
   * Undo. While a take is in flight this cancels it instead of touching the
   * history , that is what a player reaching for undo mid-take means, and it
   * makes the shortcut safe to hit the instant a pass goes wrong.
   */
  const undo = useCallback(() => {
    if (recordingTrackRef.current !== null) {
      cancelRecord();
      return;
    }
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(captureSnapshot());
    restoreSnapshot(previous);
    syncHistoryFlags();
  }, [cancelRecord, captureSnapshot, restoreSnapshot, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(captureSnapshot());
    restoreSnapshot(next);
    syncHistoryFlags();
  }, [captureSnapshot, restoreSnapshot, syncHistoryFlags]);

  const setTrackGain = useCallback((id: number, gain: number) => {
    const nodes = trackNodesRef.current.get(id);
    const ctx = graphCtxRef.current;
    if (!nodes || !ctx) return;
    nodes.gainValue = gain;
    const muted = tracksRef.current.find((row) => row.id === id)?.muted ?? false;
    if (!muted) nodes.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.01);
  }, []);

  /**
   * Live master level, deliberately NOT persisted , this is the EXP pedal's
   * path. A pedal sweep is a performance gesture, and writing every frame of
   * it back to localStorage would leave the slider wherever the foot stopped.
   * The UI slider goes through updateSettings({ masterLevel }) instead.
   */
  const setMasterGain = useCallback((gain: number) => {
    const master = masterGainRef.current;
    const ctx = graphCtxRef.current;
    if (master && ctx) master.gain.setTargetAtTime(gain, ctx.currentTime, 0.01);
  }, []);

  // Apply the stored output level whenever the user moves it. A graph built
  // after this point picks the same value up from settingsRef in ensureGraph.
  useEffect(() => {
    const master = masterGainRef.current;
    const ctx = graphCtxRef.current;
    if (!master || !ctx) return;
    master.gain.setTargetAtTime(settings.masterLevel, ctx.currentTime, 0.02);
  }, [settings.masterLevel]);

  const updateSettings = useCallback((patch: Partial<LoopRecordSettings>) => {
    setSettings((prev) => {
      const next = clampRecordSettings(prev, patch);
      saveRecordSettings(next);
      return next;
    });
  }, []);

  /**
   * Fix the bar length before anything is recorded , the tempo-sync path.
   *
   * A free-running first take ends when a human presses stop, so its length
   * carries their reaction time and every later take inherits it. Locking the
   * bar to a known tempo removes that error entirely, and combined with a fixed
   * take length the recorder never has to guess where the loop ends.
   */
  const lockBaseSeconds = useCallback((seconds: number) => {
    void (async () => {
      const ok = await ensureGraph();
      const ctx = graphCtxRef.current;
      if (!ok || !ctx || seconds <= 0) return;
      if (anyTrackHasAudio()) return;
      const samples = secondsToSamples(seconds, ctx.sampleRate);
      if (samples <= 0) return;
      baseSamplesRef.current = samples;
      baseLockedRef.current = true;
      transportStartRef.current = ctx.currentTime;
      cycleBarsRef.current = 1;
      setBaseLocked(true);
      setCycleBars(1);
      setBaseDurationSec(samplesToSeconds(samples, ctx.sampleRate));
    })();
  }, [ensureGraph, anyTrackHasAudio]);

  const unlockBase = useCallback(() => {
    if (anyTrackHasAudio()) return;
    baseLockedRef.current = false;
    baseSamplesRef.current = null;
    transportStartRef.current = 0;
    setBaseLocked(false);
    setBaseDurationSec(null);
  }, [anyTrackHasAudio]);

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

  // Build the graph as soon as capture is on rather than on the first REC. Two
  // reasons: the worklet module is fetched up front, so the first take is not
  // delayed by a network round trip, and the device's reported latency is read
  // in the same pass , which is what the setup panel shows and compensates for.
  const ensureGraphRef = useRef(ensureGraph);
  ensureGraphRef.current = ensureGraph;
  useEffect(() => {
    if (!engine.active) return;
    void ensureGraphRef.current().then(() => currentLatency());
  }, [currentLatency, engine.active]);

  // Tear down the graph and reset when the audio engine goes inactive (the
  // context is closed by useAudioMeter.disable, invalidating every node).
  useEffect(() => {
    if (engine.active) return;
    recorderRef.current = null;
    masterGainRef.current = null;
    trackNodesRef.current = new Map();
    graphCtxRef.current = null;
    workletLoadRef.current = null;
    pendingTakeRef.current = null;
    recordChunksRef.current = [];
    recordingTrackRef.current = null;
    baseSamplesRef.current = null;
    baseLockedRef.current = false;
    cycleBarsRef.current = 1;
    transportStartRef.current = 0;
    takeCountRef.current = 0;
    recordStartTimeRef.current = 0;
    inputLatencyRef.current = 0;
    setLatencyMs(0);
    undoRef.current = [];
    redoRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
    setIsRecording(false);
    setIsArmed(false);
    setIsListening(false);
    setRecordArmedTrack(null);
    setBaseDurationSec(null);
    setBaseLocked(false);
    setCycleBars(1);
    setTracks([]);
    setSelectedTrack(null);
  }, [engine.active]);

  let cycleDurationSec: number | null = null;
  if (baseDurationSec !== null) cycleDurationSec = baseDurationSec * cycleBars;

  return {
    ready: engine.active,
    tracks,
    isRecording,
    isArmed,
    isListening,
    recordArmedTrack,
    baseDurationSec,
    baseLocked,
    cycleBars,
    cycleDurationSec,
    selectedTrack,
    anyPlaying: tracks.some((row) => row.state === 'playing'),
    hasContent: tracks.some((row) => row.hasAudio),
    getPlayhead,
    getRecordElapsedSec,
    importing,
    importAudioFile,
    toggleRecord,
    cancelRecord,
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
    settings,
    updateSettings,
    latencyMs,
    lockBaseSeconds,
    unlockBase,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
