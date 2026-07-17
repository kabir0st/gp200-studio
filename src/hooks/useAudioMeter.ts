import { useCallback, useEffect, useRef, useState } from 'react';

// The GP-200 is a USB audio interface as well as a MIDI device. This hook
// captures its audio input (Web Audio) and exposes live in/out levels:
// the metering + capture foundation for the planned loop station.
// Everything is torn down on disable/unmount. enable() may run without a
// user gesture (the board auto-enables on open); Chrome then creates the
// AudioContext suspended, so enable() resumes it on the first interaction.

export interface AudioOutputOption {
  deviceId: string;
  label: string;
}

export interface AudioMeterApi {
  /** capture running */
  active: boolean;
  /** true while getUserMedia is in flight */
  starting: boolean;
  /** label of the opened input device */
  deviceLabel: string | null;
  error: string | null;
  /** input → speakers monitoring path on/off (OUT meter follows this) */
  monitoring: boolean;
  /**
   * Selectable playback devices ([] when AudioContext.setSinkId is
   * unsupported); routing to the GP-200's own output avoids the latency of
   * the OS default device.
   */
  outputDevices: AudioOutputOption[];
  /** current playback device id; '' = system default */
  outputDeviceId: string;
  enable: () => Promise<void>;
  disable: () => void;
  setMonitoring: (on: boolean) => void;
  setOutputDevice: (deviceId: string) => void;
  /** current levels 0..1 (perceptual, dB-mapped); read inside rAF, not state */
  getLevels: () => { input: number; output: number };
  /** the live AudioContext, or null while inactive; shared with the looper */
  getContext: () => AudioContext | null;
  /** the GP-200 input source node, or null while inactive; the looper taps this */
  getSource: () => MediaStreamAudioSourceNode | null;
}

const DEVICE_HINT = /gp-?200|valeton/i;
const OUTPUT_STORAGE_KEY = 'gp200-studio.audio-output-device';

// AudioContext.setSinkId is Chromium-only and not yet in TS's lib.dom; the
// app is Chrome/Edge-only anyway, but detect it so the API degrades to an
// empty device list where it's absent.
interface SinkCapableContext extends AudioContext {
  setSinkId?: (sinkId: string) => Promise<void>;
}

function sinkSelectionSupported(): boolean {
  return 'setSinkId' in AudioContext.prototype;
}

function loadSavedOutputDevice(): string {
  try {
    return localStorage.getItem(OUTPUT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveOutputDevice(deviceId: string): void {
  try {
    localStorage.setItem(OUTPUT_STORAGE_KEY, deviceId);
  } catch {
    // Private mode / storage disabled: the choice just won't persist.
  }
}

function levelFrom(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  const rms = Math.sqrt(sum / buf.length);
  const db = 20 * Math.log10(rms || 1e-6);
  return Math.min(1, Math.max(0, (db + 60) / 60)); // −60 dBFS..0 → 0..1
}

export function useAudioMeter(): AudioMeterApi {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [monitoring, setMonitoringState] = useState(false);
  const [outputDevices, setOutputDevices] = useState<AudioOutputOption[]>([]);
  const [outputDeviceId, setOutputDeviceId] = useState<string>(loadSavedOutputDevice);

  // The wanted sink, readable from stable callbacks without stale closures.
  const desiredSinkRef = useRef<string>(loadSavedOutputDevice());
  const deviceChangeCleanupRef = useRef<(() => void) | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const resumeCleanupRef = useRef<(() => void) | null>(null);

  const applySink = useCallback((ctx: AudioContext, deviceId: string) => {
    const sinkCtx: SinkCapableContext = ctx;
    if (!sinkCtx.setSinkId) return;
    // '' restores the system default. On failure (device vanished mid-call)
    // fall back to the default instead of leaving a dead selection around.
    void sinkCtx.setSinkId(deviceId).catch(() => {
      desiredSinkRef.current = '';
      setOutputDeviceId('');
      saveOutputDevice('');
    });
  }, []);

  // Re-read the audiooutput list (labels are readable once getUserMedia has
  // been granted). Drops Chromium's virtual 'default'/'communications'
  // entries; the UI offers the system default as its own '' option.
  const refreshOutputDevices = useCallback(async (): Promise<AudioOutputOption[]> => {
    if (!sinkSelectionSupported()) return [];
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        .filter((device) => device.kind === 'audiooutput')
        .filter((device) => device.deviceId !== 'default' && device.deviceId !== 'communications')
        .map((device) => ({ deviceId: device.deviceId, label: device.label || 'audio output' }));
      setOutputDevices(outputs);
      const wanted = desiredSinkRef.current;
      const wantedGone =
        wanted !== '' && !outputs.some((output) => output.deviceId === wanted);
      if (wantedGone) {
        desiredSinkRef.current = '';
        setOutputDeviceId('');
        if (ctxRef.current) applySink(ctxRef.current, '');
      }
      return outputs;
    } catch {
      return [];
    }
  }, [applySink]);

  const disable = useCallback(() => {
    resumeCleanupRef.current?.();
    resumeCleanupRef.current = null;
    deviceChangeCleanupRef.current?.();
    deviceChangeCleanupRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    sourceRef.current = null;
    void ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    inAnalyserRef.current = null;
    outAnalyserRef.current = null;
    monitorGainRef.current = null;
    setActive(false);
    setMonitoringState(false);
    setDeviceLabel(null);
  }, []);

  useEffect(() => disable, [disable]);

  const enable = useCallback(async () => {
    if (active || starting) return;
    setStarting(true);
    setError(null);
    try {
      // First a bare request so device labels become readable, then re-open
      // the GP-200 specifically if we can find it.
      let stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const gp = devices.find((d) => d.kind === 'audioinput' && DEVICE_HINT.test(d.label));
      const currentId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (gp && gp.deviceId !== currentId) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: gp.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      if (ctx.state === 'suspended') {
        // No user gesture yet (auto-enable on board open): the context starts
        // suspended and the meters would sit at zero until it runs.
        const resume = () => {
          void ctx.resume().catch(() => {});
        };
        resume();
        window.addEventListener('pointerdown', resume, { once: true });
        window.addEventListener('keydown', resume, { once: true });
        resumeCleanupRef.current = () => {
          window.removeEventListener('pointerdown', resume);
          window.removeEventListener('keydown', resume);
        };
      }
      const source = ctx.createMediaStreamSource(stream);
      const inAnalyser = ctx.createAnalyser();
      inAnalyser.fftSize = 1024;
      source.connect(inAnalyser);
      // monitoring path: source → gain (0 until enabled) → out analyser → speakers
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const outAnalyser = ctx.createAnalyser();
      outAnalyser.fftSize = 1024;
      source.connect(gain);
      gain.connect(outAnalyser);
      outAnalyser.connect(ctx.destination);

      ctxRef.current = ctx;
      streamRef.current = stream;
      sourceRef.current = source;
      inAnalyserRef.current = inAnalyser;
      outAnalyserRef.current = outAnalyser;
      monitorGainRef.current = gain;
      bufRef.current = new Float32Array(inAnalyser.fftSize);
      setDeviceLabel(stream.getAudioTracks()[0]?.label || 'audio input');
      setActive(true);

      // Playback routing: restore the saved output device (if still present)
      // and keep the device list fresh while capture runs.
      const outputs = await refreshOutputDevices();
      const wanted = desiredSinkRef.current;
      if (wanted && outputs.some((output) => output.deviceId === wanted)) {
        applySink(ctx, wanted);
      }
      if (sinkSelectionSupported()) {
        const onDeviceChange = () => {
          void refreshOutputDevices();
        };
        navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
        deviceChangeCleanupRef.current = () => {
          navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
        };
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio capture failed');
    } finally {
      setStarting(false);
    }
  }, [active, starting, applySink, refreshOutputDevices]);

  const setOutputDevice = useCallback((deviceId: string) => {
    desiredSinkRef.current = deviceId;
    setOutputDeviceId(deviceId);
    saveOutputDevice(deviceId);
    const ctx = ctxRef.current;
    if (ctx) applySink(ctx, deviceId);
  }, [applySink]);

  const setMonitoring = useCallback((on: boolean) => {
    const gain = monitorGainRef.current;
    const ctx = ctxRef.current;
    if (gain && ctx) gain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, 0.01);
    setMonitoringState(on);
  }, []);

  const getLevels = useCallback(() => {
    const buf = bufRef.current;
    if (!buf || !inAnalyserRef.current) return { input: 0, output: 0 };
    return {
      input: levelFrom(inAnalyserRef.current, buf),
      output: outAnalyserRef.current ? levelFrom(outAnalyserRef.current, buf) : 0,
    };
  }, []);

  const getContext = useCallback(() => ctxRef.current, []);
  const getSource = useCallback(() => sourceRef.current, []);

  return {
    active, starting, deviceLabel, error, monitoring,
    outputDevices, outputDeviceId,
    enable, disable, setMonitoring, setOutputDevice,
    getLevels, getContext, getSource,
  };
}
