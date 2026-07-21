import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioMeterApi } from '@/hooks/useAudioMeter';
import {
  DRUM_KITS,
  DRUM_LANES,
  STEP_COUNT,
  drumSamplePath,
  getPattern,
  randomizePattern,
  secondsPerStep,
  type DrumKit,
  type DrumLaneId,
  type DrumPattern,
  type RandomStyle,
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
  swing: number;
  /** 0..100 master level */
  volume: number;
  /** step lit in the grid; -1 while stopped */
  currentStep: number;
  steps: Record<DrumLaneId, readonly number[]>;
  mutedLanes: ReadonlySet<DrumLaneId>;
  togglePlay: () => void;
  stop: () => void;
  setBpm: (bpm: number) => void;
  setSwing: (swing: number) => void;
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

function toggledVelocity(current: number, step: number): number {
  if (current > 0) return 0;
  if (step % 4 === 0) return 1;
  return 0.7;
}

export function useDrumMachine(engine: AudioMeterApi): DrumMachineApi {
  const initialPattern = getPattern('rock-basic');
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kitId, setKitId] = useState(DRUM_KITS[0].id);
  const [patternId, setPatternId] = useState(initialPattern.id);
  const [patternName, setPatternName] = useState(initialPattern.name);
  const [bpm, setBpmState] = useState(initialPattern.bpm);
  const [swing, setSwingState] = useState(initialPattern.swing);
  const [volume, setVolumeState] = useState(80);
  const [currentStep, setCurrentStep] = useState(-1);
  const [steps, setSteps] = useState(initialPattern.steps);
  const [mutedLanes, setMutedLanes] = useState<ReadonlySet<DrumLaneId>>(new Set());

  // Mirrors read by the scheduler tick (which must see live values without
  // re-arming the interval).
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const swingRef = useRef(swing);
  swingRef.current = swing;
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const mutedRef = useRef(mutedLanes);
  mutedRef.current = mutedLanes;
  const kitIdRef = useRef(kitId);
  kitIdRef.current = kitId;

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const buffersRef = useRef(new Map<string, KitBuffers>());
  const tickTimerRef = useRef<number | null>(null);
  /** next step to schedule and its absolute context time */
  const nextRef = useRef({ step: 0, time: 0 });
  /** steps already scheduled, waiting to light up in the grid */
  const pendingStepsRef = useRef<{ step: number; time: number }[]>([]);
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
      const velocity = stepsRef.current[lane.id][step];
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
      nextRef.current = { step: (step + 1) % STEP_COUNT, time: time + delta };
    }
    const due = pendingStepsRef.current.filter((pending) => pending.time <= now);
    if (due.length > 0) {
      pendingStepsRef.current = pendingStepsRef.current.filter(
        (pending) => pending.time > now,
      );
      setCurrentStep(due[due.length - 1].step);
    }
  }, [scheduleStep]);

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
    setPlaying(false);
    setCurrentStep(-1);
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

  const setSwing = useCallback((nextSwing: number) => {
    setSwingState(Math.max(0, Math.min(0.5, nextSwing)));
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
    setBpmState(next.bpm);
    setSwingState(next.swing);
  }, []);

  const selectPattern = useCallback((nextPatternId: string) => {
    applyPattern(getPattern(nextPatternId));
  }, [applyPattern]);

  const randomize = useCallback((style: RandomStyle) => {
    const rolled = randomizePattern(style, Math.random);
    // Keep the user's tempo/swing: randomize varies the groove, not the feel.
    setPatternId(rolled.id);
    setPatternName(rolled.name);
    setSteps(rolled.steps);
  }, []);

  const toggleStep = useCallback((laneId: DrumLaneId, step: number) => {
    setSteps((prev) => {
      const lane = [...prev[laneId]];
      lane[step] = toggledVelocity(lane[step], step);
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
    bpm, swing, volume, currentStep, steps, mutedLanes,
    togglePlay, stop, setBpm, setSwing, setVolume,
    selectKit, selectPattern, randomize, toggleStep, toggleLaneMute,
  };
}
