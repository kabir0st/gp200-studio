import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMeterApi } from '@/hooks/useAudioMeter';
import { track } from '@/core/analytics';
import {
  quantizeToBase,
  barsForCapture,
  cycleBars as widestBars,
  samplesToSeconds,
  secondsToSamples,
  boundaryForPress,
  cyclePhaseSurvives,
  anchorFromCapture,
  frameAtTime,
  playhead,
} from '@/core/looperTransport';
import {
  blendTail,
  findOnset,
  planCapture,
  resolveHead,
  capturedFrames,
  dbToGain,
  clampRecordSettings,
  loadRecordSettings,
  saveRecordSettings,
  softClipCurve,
  SILENCE_FLOOR,
  PREROLL_SEC,
  ONSET_SNAP_SEC,
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
// cycle is stored as that bar repeated four times. The copy is a memcpy of
// already-decoded PCM and only happens when the cycle actually changes.
//
// Growing the cycle must not break what is already playing, which is the whole
// reason the transport anchor moves to the new take's own downbeat rather than
// to "now": that keeps it congruent with the old anchor modulo the old cycle,
// so every track whose length divides both widths carries on emitting exactly
// the same samples and its source is left completely alone (cyclePhaseSurvives).
// Only a track whose tiling was, or becomes, a partial repeat has to be
// relaunched, and those all splice at one shared future instant.
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
// Where those edges land is loopCapture.planCapture()'s job, not this file's.
// The sample carrying a downbeat arrives output+input latency after that
// downbeat was scheduled, so the loop's first sample comes from there, and the
// STOP edge is pushed by the same amount so a hand-stopped take is exactly the
// gap between the two presses. A GRID take is armed a guard pre-roll earlier
// still and the head is sliced out on this side, which is what lets the user's
// latency trim move the loop point in either direction without ever discarding
// audio. The output leg and the trim only count when the player is following
// audio we scheduled; with nothing audible there is nothing to follow.
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
  /** context time `source` was scheduled to begin; a stop before it is silent */
  startedAt: number;
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
  /** derived from the rows, but applyCycle cannot re-derive it with no base */
  cycleBars: number;
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
  /** frame the loop's first sample belongs on (frame mode; 0 when level-armed) */
  loopHeadFrame: number;
  /** where the loop's first sample sits inside what the worklet posted */
  head: number;
  /** the grid downbeat this take was armed to, or null when it was not on one */
  gridStart: number | null;
  /** the transport anchor at arm time, to catch it moving under a live take */
  anchorAtArm: number;
  started: boolean;
}

/** How many undo steps to keep. Snapshots are cheap; the audio is shared. */
const HISTORY_LIMIT = 24;
/**
 * How far ahead a source swap is scheduled.
 *
 * Both halves of a splice share one instant, so the replacement begins on the
 * exact sample the old one stopped on. It also fixes a subtler thing on every
 * ordinary start: `start(ctx.currentTime, offset)` computes the offset for a
 * time the renderer has already passed, so the audio lands a render block late
 * by a non-deterministic amount. Scheduling slightly ahead makes it exact.
 */
const SPLICE_LEAD = 0.025;

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
      startedAt: 0,
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
   *
   * `when` defaults to a hair ahead of now (see SPLICE_LEAD). Anything already
   * playing is stopped at exactly that same instant and disconnected only once
   * it has actually ended, so replacing a source is a splice rather than a gap:
   * that is what lets the cycle grow under a running loop without a hole in it.
   * Pass one shared `when` to relaunch several tracks as a single edit.
   */
  const startTrackPlayback = useCallback((id: number, when?: number) => {
    const ctx = graphCtxRef.current;
    const nodes = trackNodesRef.current.get(id);
    if (!ctx || !nodes?.tiled) return;
    // Never behind the outgoing source's own start: stop(t) at or before the
    // scheduled start of a node makes it emit nothing at all.
    const at = Math.max(when ?? ctx.currentTime + SPLICE_LEAD, nodes.startedAt);

    const old = nodes.source;
    if (old) {
      old.onended = () => old.disconnect();
      old.stop(at);
    }

    const src = ctx.createBufferSource();
    src.buffer = nodes.tiled;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = nodes.tiled.duration;
    src.connect(nodes.gain);

    const duration = cycleDuration();
    const phase = playhead(at, transportStartRef.current, duration);
    src.start(at, phase * duration);
    nodes.source = src;
    nodes.startedAt = at;
    patchTrack(id, { state: 'playing' });
  }, [cycleDuration, patchTrack]);

  /** Stop a track now. Deliberately immediate: stop and delete want silence at
   *  once, and a deferred stop would null `source` while it is still audible. */
  const stopTrack = useCallback((id: number) => {
    const nodes = trackNodesRef.current.get(id);
    if (nodes?.source) {
      nodes.source.onended = null;
      nodes.source.stop();
      nodes.source.disconnect();
      nodes.source = null;
    }
  }, []);

  /**
   * Recompute the cycle from the tracks present and re-tile to it. Called after
   * any add or delete: the cycle is DERIVED from the widest track, so this both
   * grows it for a long new take and shrinks it again when that take is deleted.
   *
   * Deliberately does NOT touch the transport anchor. Moving the grid is a
   * musical decision that belongs to whatever caused the change (see the anchor
   * policy in finalizeTake), and re-anchoring here to `ctx.currentTime` is what
   * used to make every playing loop jump , at a moment that is not even a
   * downbeat, since finalize runs a tail's worth of time after the take ended.
   *
   * A running source is only rebuilt when its tiling genuinely moves. For a
   * track whose length divides both the old and the new width the re-tiled
   * buffer would emit the very same samples at the very same times, so the
   * cheapest correct thing is to leave it playing and swap `tiled` underneath
   * for the next start (cyclePhaseSurvives explains why that is exact).
   */
  const applyCycle = useCallback(() => {
    const ctx = graphCtxRef.current;
    const base = baseSamplesRef.current;
    if (!ctx || base === null) return;

    const bars: number[] = [];
    for (const nodes of trackNodesRef.current.values()) {
      if (nodes.content) bars.push(nodes.bars);
    }
    const prevBars = cycleBarsRef.current;
    const nextBars = widestBars(bars);
    const changed = nextBars !== prevBars;
    cycleBarsRef.current = nextBars;
    setCycleBars(nextBars);

    const cycleSamples = base * nextBars;
    const relaunch: number[] = [];
    for (const [id, nodes] of trackNodesRef.current) {
      if (!nodes.content) continue;
      if (!changed && nodes.tiled) continue;
      nodes.tiled = tileToCycle(ctx, nodes.content, cycleSamples);
      if (!nodes.source) continue;
      if (changed && !cyclePhaseSurvives(nodes.bars, prevBars, nextBars)) relaunch.push(id);
    }
    if (relaunch.length === 0) return;

    // Whatever is left over played a truncated repeat, so its content really
    // does move. Splice them all at one shared instant to keep them together.
    const at = ctx.currentTime + SPLICE_LEAD;
    for (const id of relaunch) startTrackPlayback(id, at);
  }, [startTrackPlayback]);

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
      cycleBars: cycleBarsRef.current,
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

  /**
   * Reconcile the live track set with a snapshot: remove what the snapshot does
   * not have, recreate what it does, and LEAVE ALONE anything that matches.
   *
   * A track matches when its id, its audio (buffers are shared by reference and
   * never mutated after install) and its bar count are all the same, and a
   * matching track keeps its running source untouched , that is what makes an
   * undo of one take out of four inaudible to the other three. Rebuilding
   * everything, which is what this used to do, restarted every loop on every
   * undo no matter how little actually changed.
   */
  const restoreSnapshot = useCallback((snapshot: LooperSnapshot) => {
    const ctx = graphCtxRef.current;
    if (!ctx) return;
    const wanted = new Map(snapshot.tracks.map((entry) => [entry.row.id, entry]));

    for (const [id, nodes] of trackNodesRef.current) {
      // A take in flight owns its own lane; cancelling it is the caller's job.
      if (id === recordingTrackRef.current) continue;
      const entry = wanted.get(id);
      if (entry && nodes.content === entry.content && nodes.bars === entry.row.bars) continue;
      stopTrack(id);
      nodes.gain.disconnect();
      trackNodesRef.current.delete(id);
    }

    baseSamplesRef.current = snapshot.baseSamples;
    baseLockedRef.current = snapshot.baseLocked;
    takeCountRef.current = snapshot.takeCount;
    nextTrackIdRef.current = snapshot.nextTrackId;
    setBaseLocked(snapshot.baseLocked);
    let restoredBaseSec: number | null = null;
    if (snapshot.baseSamples !== null) {
      restoredBaseSec = samplesToSeconds(snapshot.baseSamples, ctx.sampleRate);
    }
    setBaseDurationSec(restoredBaseSec);

    const created: number[] = [];
    let survivorPlaying = false;
    const rows: LooperTrack[] = [];
    for (const entry of snapshot.tracks) {
      const live = trackNodesRef.current.get(entry.row.id);
      if (live) {
        if (live.source) survivorPlaying = true;
        // Undo/redo is a history of takes, not of the mixer. Something the user
        // is listening to right now must not stop or mute itself because the
        // snapshot happened to be taken while it was quiet.
        let state: TrackState = 'stopped';
        if (live.source) state = 'playing';
        const muted = tracksRef.current.find((row) => row.id === entry.row.id)?.muted ?? false;
        rows.push({ ...entry.row, state, muted });
        continue;
      }
      const nodes = createTrackNodes(entry.row.id, entry.gainValue);
      if (!nodes) continue;
      nodes.content = entry.content;
      nodes.bars = entry.row.bars;
      if (entry.row.muted) nodes.gain.gain.value = 0;
      created.push(entry.row.id);
      rows.push(entry.row);
    }
    setTracks(rows);
    setSelectedTrack(snapshot.selectedTrack);

    // The snapshot's anchor is only safe to adopt when nothing survives to be
    // knocked out of phase by it , togglePlayAll re-anchors without writing any
    // history, so a snapshot can easily carry an origin the running sources
    // were never started against.
    if (!survivorPlaying) transportStartRef.current = snapshot.transportStart;
    // applyCycle re-derives the width from the rows, except with no base at all,
    // where there is nothing to derive it from and no content track can exist.
    if (snapshot.baseSamples === null) {
      cycleBarsRef.current = snapshot.cycleBars;
      setCycleBars(snapshot.cycleBars);
    }
    applyCycle();

    const at = ctx.currentTime + SPLICE_LEAD;
    for (const entry of snapshot.tracks) {
      if (!created.includes(entry.row.id)) continue;
      if (entry.row.state === 'playing') startTrackPlayback(entry.row.id, at);
    }
  }, [applyCycle, createTrackNodes, startTrackPlayback, stopTrack]);

  // ── Recording ──────────────────────────────────────────────────────────────

  /**
   * True when something is actually coming out of the speakers for the player
   * to play along to , which is what decides whether the output leg and the
   * user's trim apply to a take at all.
   *
   * Deliberately stricter than "a track holds audio": a stopped or muted track
   * is nothing to follow, and charging a take for a round trip it never made
   * would rotate it against its own grid.
   */
  const anyAudibleTrack = useCallback((): boolean => {
    for (const [id, nodes] of trackNodesRef.current) {
      if (!nodes.source) continue;
      if (tracksRef.current.find((row) => row.id === id)?.muted) continue;
      return true;
    }
    return false;
  }, []);

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
    // Resolve the head against where the worklet REPORTS starting, not where it
    // was asked to: a guard pre-roll reaching back past the current quantum is
    // only honoured in part, and measuring it here absorbs the difference
    // instead of rotating the take by it. Level takes refine their own head
    // from the onset once the audio is in.
    if (!pending.level) pending.head = resolveHead(pending.loopHeadFrame, startFrame);
    // Elapsed is capture progress, measured from the frame the LOOP began on:
    // that is the number the bar counter and the fixed-length stop agree with,
    // so the readout reaches "bar 4 of 4" exactly as the take ends.
    recordStartTimeRef.current = samplesToSeconds(startFrame + pending.head, ctx.sampleRate);
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
    let head = pending.head;
    if (pending.level) {
      head = findOnset(flat, {
        triggerIndex: pending.prerollFrames,
        floor: SILENCE_FLOOR,
        maxBackoff: pending.prerollFrames,
        snapRadius: Math.round(ONSET_SNAP_SEC * ctx.sampleRate),
      });
    }
    const captured = capturedFrames(bodyFrames, flat.length, head);
    if (captured === 0) {
      dropEmptyTrack(pending.trackId);
      return;
    }

    // Snapshot BEFORE anything below is mutated, and before the take number is
    // spent. An import or a delete may have landed while the take was rolling,
    // so this has to happen at finalize rather than at arm time , but it has to
    // precede the base and the anchor, or undoing the very first take puts back
    // a state that already has this take's bar length in it and the looper is
    // left with a loop it can never wrap. captureSnapshot skips content-less
    // rows, so the take's own armed lane is not in it.
    pushHistory();
    takeCountRef.current += 1;

    // Round to whole bars against the base , or, with no base yet, become it.
    const { bars, samples } = quantizeToBase(captured, baseSamplesRef.current ?? 0);
    const firstContent = !anyTrackHasAudio();
    const grew = bars > cycleBarsRef.current;
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
        anchorFromCapture(pending.startFrame + head, ctx.sampleRate, inputSec, outputSec);
    } else if (grew && pending.gridStart !== null
      && transportStartRef.current === pending.anchorAtArm) {
      // This take is about to widen the cycle, so the grid has to be re-laid
      // around it. Use the downbeat the take was ARMED to, never its captured
      // head: that boundary is the old anchor plus a whole number of old cycles,
      // which is exactly the condition under which every track already playing
      // keeps its phase (see cyclePhaseSurvives) , and it is free of the user's
      // trim, which would otherwise compound into the grid once per growth.
      transportStartRef.current = pending.gridStart;
    }
    // A take that neither starts nor widens the loop leaves the grid alone.
    // One gap, accepted rather than papered over: an import landing mid-take
    // makes `firstContent` false for a take that was armed with no grid at all,
    // so it keeps whatever phase the import established. Rotating that take's
    // own buffer would be the honest fix; moving the anchor would yank
    // everything else to suit one take.

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
      if (!createTrackNodes(trackId)) return;
      recordChunksRef.current = [];
      recordingTrackRef.current = trackId;
      setRecordArmedTrack(trackId);
      setTracks((prev) => [
        ...prev,
        {
          id: trackId,
          kind: 'record',
          // The counter itself is only spent once the take produces audio, so
          // arming and cancelling never burns a number , this is what that one
          // will be if it lands.
          label: `TAKE ${takeCountRef.current + 1}`,
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
      // Wait for the first note only while nothing is looping yet: once audio is
      // running there is a downbeat to drop in on, which is always the better
      // reference than "whenever the player happens to hit a string".
      const level = current.autoStart && !running;
      const onGrid = running && base !== null;
      // Grid-arming and charging for the round trip are separate questions: a
      // take recorded with everything stopped should still land on the bar, but
      // there is nothing audible for the player to be late against.
      const againstPlayback = onGrid && anyAudibleTrack();
      const { inputSec, outputSec } = currentLatency();

      let mode: 'level' | 'grid' | 'now' = 'now';
      if (level) mode = 'level';
      else if (onGrid) mode = 'grid';

      let gridStart: number | null = null;
      let startTime = ctx.currentTime;
      if (onGrid) {
        gridStart = boundaryForPress(
          ctx.currentTime,
          outputSec,
          transportStartRef.current,
          cycleDuration(),
        );
        startTime = gridStart;
      }

      const plan = planCapture({
        mode,
        startFrame: frameAtTime(startTime, rate),
        sampleRate: rate,
        inputLatencySec: inputSec,
        outputLatencySec: outputSec,
        trimMs: current.latencyTrimMs,
        againstPlayback,
        baseSamples: base,
        recordBars: current.recordBars,
        tailBlendMs: current.tailBlendMs,
      });

      pendingTakeRef.current = {
        trackId,
        level,
        startFrame: 0,
        prerollFrames: 0,
        offsetFrames: plan.offsetFrames,
        loopHeadFrame: plan.loopHeadFrame,
        head: 0,
        gridStart,
        anchorAtArm: transportStartRef.current,
        started: false,
      };

      if (level) {
        recorder.port.postMessage({
          type: 'arm',
          mode: 'level',
          threshold: dbToGain(current.triggerDb),
          prerollFrames: Math.round(PREROLL_SEC * rate),
          holdQuanta: 2,
          bodyFrames: plan.bodyFrames,
          tailFrames: plan.tailFrames,
        });
        setIsListening(true);
        return;
      }

      if (onGrid) setIsArmed(true);
      recorder.port.postMessage({
        type: 'arm',
        mode: 'frame',
        startFrame: plan.armFrame,
        bodyFrames: plan.bodyFrames,
        tailFrames: plan.tailFrames,
      });
    })();
  }, [
    anyAudibleTrack,
    createTrackNodes,
    currentLatency,
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
      // Only the FIRST thing in lays the grid. A later import that widens the
      // cycle drops in at the current phase rather than restarting everything
      // from the file's head: its tiled buffer is grid-aligned by construction,
      // so its downbeat still lands on the transport's, and nothing that is
      // already playing gets interrupted to make room for it.
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
    if (!ctx) return;
    // One instant for the whole restart: a fresh common anchor, and every track
    // scheduled against it rather than each against its own `currentTime`.
    const at = ctx.currentTime + SPLICE_LEAD;
    transportStartRef.current = at;
    for (const row of tracksRef.current) {
      if (row.hasAudio) startTrackPlayback(row.id, at);
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
    // An empty board can still hold a bar length , the transport outlives the
    // last track whenever the bar was locked to a tempo. CLEAR has to be able to
    // put that back too, or a stale bar has no way out through the UI at all.
    if (tracksRef.current.length === 0 && baseSamplesRef.current === null) return;
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
    // Same guard as undo: stepping history while a take is rolling would leave
    // pendingTakeRef pointing at a lane restoreSnapshot has already removed.
    if (recordingTrackRef.current !== null) {
      cancelRecord();
      return;
    }
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(captureSnapshot());
    restoreSnapshot(next);
    syncHistoryFlags();
  }, [cancelRecord, captureSnapshot, restoreSnapshot, syncHistoryFlags]);

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
  //
  // Wiping both history stacks here is load-bearing, not tidiness:
  // restoreSnapshot decides what to keep by comparing AudioBuffer identity, and
  // a snapshot that outlived its AudioContext would offer buffers from a dead
  // one as matches for tracks that no longer exist.
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
