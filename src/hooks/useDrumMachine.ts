import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMeterApi } from '@/hooks/useAudioMeter';
import {
  DRUM_KITS,
  DRUM_LANES,
  SIGNATURES,
  drumSamplePath,
  getPattern,
  nextStepVelocity,
  randomizePattern,
  secondsPerStep,
  type DrumKit,
  type DrumLaneId,
  type DrumPattern,
  type RandomStyle,
  type SignatureId,
} from '@/core/drumMachine';

// Browser practice drum machine: schedules the CC0 one-shots in public/drums/
// on a look-ahead Web Audio clock (setInterval tick + AudioContext.currentTime
// scheduling, the standard "tale of two clocks" pattern), so the groove stays
// tight even when React or the tab is busy.
//
// It runs on its OWN small AudioContext, not the shared engine context from
// AudioEngineProvider: that context only exists while GP-200 audio capture is
// active (it owns getUserMedia), and drum playback must not force the mic
// open or die when capture stops. A playback-only context doesn't touch the
// USB device input, so the one-context rule for the GP-200 is unaffected. The
// engine's output-device choice is still honored by mirroring setSinkId.

export interface DrumMachineApi {
  playing: boolean;
  /** kit samples are being fetched/decoded */
  loading: boolean;
  error: string | null;
  kitId: string;
  patternId: string;
  patternName: string;
  bpm: number;
  /** the drum tempo is mirroring the patch tempo instead of standing alone */
  followPatch: boolean;
  /** the patch tempo on offer to follow, echoed back for the panel's labels */
  patchTempo: number;
  swing: number;
  signature: SignatureId;
  /** 0..100 master level */
  volume: number;
  /**
   * Step currently sounding, -1 while stopped. A getter read inside rAF (same
   * pattern as AudioMeterApi.getLevels), NOT React state: step-rate setState
   * here would re-render App (the hook lives there) ~8-16×/s, and that churn
   * re-ran the Dialog focus trap every tick, yanking focus and snapping any
   * open <select> dropdown shut while the drums played.
   */
  getCurrentStep: () => number;
  steps: Record<DrumLaneId, readonly number[]>;
  mutedLanes: ReadonlySet<DrumLaneId>;
  togglePlay: () => void;
  stop: () => void;
  setBpm: (bpm: number) => void;
  setFollowPatch: (follow: boolean) => void;
  setSwing: (swing: number) => void;
  setSignature: (signature: SignatureId) => void;
  setVolume: (volume: number) => void;
  selectKit: (kitId: string) => void;
  selectPattern: (patternId: string) => void;
  randomize: (style: RandomStyle) => void;
  toggleStep: (laneId: DrumLaneId, step: number) => void;
  toggleLaneMute: (laneId: DrumLaneId) => void;
}

export const DRUM_BPM_MIN = 40;
export const DRUM_BPM_MAX = 240;

/** How far ahead the tick schedules audio, and how often it runs. */
const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

type KitBuffers = Partial<Record<DrumLaneId, AudioBuffer>>;

interface SinkCapableContext extends AudioContext {
  setSinkId?: (sinkId: string) => Promise<void>;
}

function findKit(kitId: string): DrumKit {
  const found = DRUM_KITS.find((kit) => kit.id === kitId);
  return found ?? DRUM_KITS[0];
}

function clampBpm(bpm: number): number {
  return Math.max(DRUM_BPM_MIN, Math.min(DRUM_BPM_MAX, Math.round(bpm)));
}

/** Cut or zero-pad every lane to the new bar length. */
function resizeLanes(
  steps: Record<DrumLaneId, readonly number[]>,
  barSteps: number,
): Record<DrumLaneId, readonly number[]> {
  const resized = {} as Record<DrumLaneId, readonly number[]>;
  for (const lane of DRUM_LANES) {
    const source = steps[lane.id];
    const next = new Array<number>(barSteps).fill(0);
    for (let step = 0; step < Math.min(barSteps, source.length); step++) {
      next[step] = source[step];
    }
    resized[lane.id] = next;
  }
  return resized;
}

/**
 * @param patchTempo the GP-200's own patch tempo, mirrored while the user has
 *   asked the drums to follow it (see `setFollowPatch`).
 */
export function useDrumMachine(engine: AudioMeterApi, patchTempo: number): DrumMachineApi {
  const initialPattern = getPattern('rock-basic');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kitId, setKitId] = useState(DRUM_KITS[0].id);
  const [patternId, setPatternId] = useState(initialPattern.id);
  const [patternName, setPatternName] = useState(initialPattern.name);
  const [bpm, setBpmState] = useState(initialPattern.bpm);
  const [followPatch, setFollowPatchState] = useState(false);
  const [swing, setSwingState] = useState(initialPattern.swing);
  const [signature, setSignatureState] = useState<SignatureId>(initialPattern.signature);
  const [volume, setVolumeState] = useState(80);
  const [steps, setSteps] = useState(initialPattern.steps);
  const [mutedLanes, setMutedLanes] = useState<ReadonlySet<DrumLaneId>>(new Set());

  // Mirrors read by the scheduler tick (which must see live values without
  // re-arming the interval).
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  // applyPattern is a stable callback, so it reads the link through a ref.
  const followPatchRef = useRef(followPatch);
  followPatchRef.current = followPatch;
  const swingRef = useRef(swing);
  swingRef.current = swing;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const mutedRef = useRef(mutedLanes);
  mutedRef.current = mutedLanes;
  const kitIdRef = useRef(kitId);
  kitIdRef.current = kitId;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const buffersRef = useRef(new Map<string, KitBuffers>());
  const tickTimerRef = useRef<number | null>(null);
  /** next step to schedule and its absolute context time */
  const nextRef = useRef({ step: 0, time: 0 });
  /** steps already scheduled, waiting to light up in the grid */
  const pendingStepsRef = useRef<{ step: number; time: number }[]>([]);
  /** step currently sounding; read by the panel inside rAF via getCurrentStep */
  const currentStepRef = useRef(-1);
  const liveSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  /** ringing open hats, so a closed hat can choke them (classic hi-hat rule) */
  const openHatsRef = useRef<{ source: AudioBufferSourceNode; time: number }[]>([]);
  const loadTokenRef = useRef(0);

  const applyEngineSink = useCallback(
    (ctx: AudioContext) => {
      const sinkCtx: SinkCapableContext = ctx;
      if (!sinkCtx.setSinkId) return;
      void sinkCtx.setSinkId(engine.outputDeviceId).catch(() => {});
    },
    [engine.outputDeviceId],
  );

  const ensureContext = useCallback((): AudioContext => {
    let ctx = ctxRef.current;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      const master = ctx.createGain();
      master.connect(ctx.destination);
      ctxRef.current = ctx;
      masterGainRef.current = master;
      applyEngineSink(ctx);
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    const master = masterGainRef.current;
    if (master) master.gain.value = (volume / 100) ** 2;
    return ctx;
  }, [applyEngineSink, volume]);

  // Follow the loop station / meters output-device choice.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx) applyEngineSink(ctx);
  }, [applyEngineSink]);

  const loadKit = useCallback(async (loadKitId: string): Promise<void> => {
    if (buffersRef.current.has(loadKitId)) return;
    const ctx = ensureContext();
    const token = ++loadTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const kit = findKit(loadKitId);
      const decoded = await Promise.all(
        DRUM_LANES.map(async (lane) => {
          const url = `${import.meta.env.BASE_URL}${drumSamplePath(kit, lane)}`;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`${lane.file}: HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          const buffer = await ctx.decodeAudioData(bytes);
          return { laneId: lane.id, buffer };
        }),
      );
      const kitBuffers: KitBuffers = {};
      for (const { laneId, buffer } of decoded) kitBuffers[laneId] = buffer;
      buffersRef.current.set(loadKitId, kitBuffers);
    } catch (err) {
      let message = 'Drum samples failed to load';
      if (err instanceof Error) message = `Drum samples failed to load (${err.message})`;
      setError(message);
    } finally {
      if (loadTokenRef.current === token) setLoading(false);
    }
  }, [ensureContext]);

  const scheduleStep = useCallback((step: number, time: number) => {
    const ctx = ctxRef.current;
    const master = masterGainRef.current;
    const kitBuffers = buffersRef.current.get(kitIdRef.current);
    if (!ctx || !master || !kitBuffers) return;
    for (const lane of DRUM_LANES) {
      const velocity = stepsRef.current[lane.id][step] ?? 0;
      if (velocity <= 0 || mutedRef.current.has(lane.id)) continue;
      const buffer = kitBuffers[lane.id];
      if (!buffer) continue;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const hitGain = ctx.createGain();
      hitGain.gain.value = velocity;
      source.connect(hitGain);
      hitGain.connect(master);
      liveSourcesRef.current.add(source);
      source.onended = () => liveSourcesRef.current.delete(source);
      // A new hat hit (open or closed) chokes any still-ringing open hat.
      if (lane.id === 'hatClosed' || lane.id === 'hatOpen') {
        for (const hat of openHatsRef.current) {
          if (hat.time < time) {
            try {
              hat.source.stop(time);
            } catch {
              // already stopped
            }
          }
        }
        openHatsRef.current = openHatsRef.current.filter((hat) => hat.time >= time);
        if (lane.id === 'hatOpen') openHatsRef.current.push({ source, time });
      }
      source.start(time);
    }
  }, []);

  const tick = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    while (nextRef.current.time < now + LOOKAHEAD_S) {
      const { step, time } = nextRef.current;
      scheduleStep(step, time);
      pendingStepsRef.current.push({ step, time });
      // Swing as an inter-step delta: leaving an even step stretches by the
      // swing amount, leaving an odd step gives it back.
      const stepLength = secondsPerStep(bpmRef.current);
      let delta = stepLength * (1 + swingRef.current);
      if (step % 2 === 1) delta = stepLength * (1 - swingRef.current);
      const barSteps = SIGNATURES[signatureRef.current].steps;
      nextRef.current = { step: (step + 1) % barSteps, time: time + delta };
    }
    const due = pendingStepsRef.current.filter((pending) => pending.time <= now);
    if (due.length > 0) {
      pendingStepsRef.current = pendingStepsRef.current.filter(
        (pending) => pending.time > now,
      );
      currentStepRef.current = due[due.length - 1].step;
    }
  }, [scheduleStep]);

  const getCurrentStep = useCallback(() => currentStepRef.current, []);

  const stop = useCallback(() => {
    if (tickTimerRef.current !== null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    for (const source of liveSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // never started or already ended
      }
    }
    liveSourcesRef.current.clear();
    openHatsRef.current = [];
    pendingStepsRef.current = [];
    currentStepRef.current = -1;
    setPlaying(false);
  }, []);

  const start = useCallback(async () => {
    const ctx = ensureContext();
    await loadKit(kitIdRef.current);
    if (!buffersRef.current.has(kitIdRef.current)) return;
    if (tickTimerRef.current !== null) return;
    nextRef.current = { step: 0, time: ctx.currentTime + 0.08 };
    tickTimerRef.current = window.setInterval(tick, TICK_MS);
    setPlaying(true);
    tick();
  }, [ensureContext, loadKit, tick]);

  const togglePlay = useCallback(() => {
    if (tickTimerRef.current !== null) {
      stop();
      return;
    }
    void start();
  }, [start, stop]);

  // Full teardown on unmount only (the hook lives in App, above both trees).
  useEffect(() => {
    return () => {
      stop();
      void ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
      masterGainRef.current = null;
    };
  }, [stop]);

  const setBpm = useCallback((nextBpm: number) => {
    setBpmState(clampBpm(nextBpm));
  }, []);

  /**
   * Follow the patch tempo, so a tempo-synced tremolo or delay on the GP-200
   * and the practice drums are counting the same beat.
   *
   * Opt-in rather than automatic: the patch tempo belongs to the patch, so an
   * always-on link would yank the drum tempo out from under you every time you
   * changed patch, and the drum machine is meant to work with no device
   * connected at all. Clamped to the drum machine's own range, which stops
   * 10 BPM short of the GP-200's 250.
   */
  const setFollowPatch = useCallback((follow: boolean) => {
    setFollowPatchState(follow);
  }, []);

  useEffect(() => {
    if (!followPatch) return;
    setBpmState(clampBpm(patchTempo));
  }, [followPatch, patchTempo]);

  const setSwing = useCallback((nextSwing: number) => {
    setSwingState(Math.max(0, Math.min(0.5, nextSwing)));
  }, []);

  const setSignature = useCallback((nextSignature: SignatureId) => {
    const barSteps = SIGNATURES[nextSignature].steps;
    setSignatureState(nextSignature);
    // Keep the groove's head, cut or pad the tail; the edit makes it custom.
    setSteps((prev) => resizeLanes(prev, barSteps));
    setPatternId('custom');
    setPatternName('Custom');
    // If the scheduler is mid-bar past the new length, wrap it in range.
    nextRef.current = {
      step: nextRef.current.step % barSteps,
      time: nextRef.current.time,
    };
  }, []);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(nextVolume)));
    setVolumeState(clamped);
    const master = masterGainRef.current;
    const ctx = ctxRef.current;
    if (master && ctx) {
      master.gain.setTargetAtTime((clamped / 100) ** 2, ctx.currentTime, 0.01);
    }
  }, []);

  const selectKit = useCallback((nextKitId: string) => {
    setKitId(findKit(nextKitId).id);
    // Preload in the background so PLAY (or a mid-playback switch) is instant.
    void loadKit(nextKitId);
  }, [loadKit]);

  const applyPattern = useCallback((next: DrumPattern) => {
    setPatternId(next.id);
    setPatternName(next.name);
    setSteps(next.steps);
    // A pattern picks the groove; while the link is on, the patch owns the
    // tempo. Same reasoning as randomize keeping the user's feel below.
    if (!followPatchRef.current) setBpmState(next.bpm);
    setSwingState(next.swing);
    setSignatureState(next.signature);
    nextRef.current = {
      step: nextRef.current.step % SIGNATURES[next.signature].steps,
      time: nextRef.current.time,
    };
  }, []);

  const selectPattern = useCallback((nextPatternId: string) => {
    applyPattern(getPattern(nextPatternId));
  }, [applyPattern]);

  const randomize = useCallback((style: RandomStyle) => {
    const rolled = randomizePattern(style, Math.random, signatureRef.current);
    // Keep the user's tempo/swing: randomize varies the groove, not the feel.
    setPatternId(rolled.id);
    setPatternName(rolled.name);
    setSteps(rolled.steps);
  }, []);

  const toggleStep = useCallback((laneId: DrumLaneId, step: number) => {
    setSteps((prev) => {
      const lane = [...prev[laneId]];
      lane[step] = nextStepVelocity(lane[step]);
      return { ...prev, [laneId]: lane };
    });
    setPatternId('custom');
  }, []);

  const toggleLaneMute = useCallback((laneId: DrumLaneId) => {
    setMutedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(laneId)) next.delete(laneId);
      else next.add(laneId);
      return next;
    });
  }, []);

  return {
    playing, loading, error, kitId, patternId, patternName,
    bpm, followPatch, patchTempo, swing, signature, volume, getCurrentStep, steps, mutedLanes,
    togglePlay, stop, setBpm, setFollowPatch, setSwing, setSignature, setVolume,
    selectKit, selectPattern, randomize, toggleStep, toggleLaneMute,
  };
}
