import { useCallback, useEffect, useRef, useState } from 'react';

// The GP-200 is a USB audio interface as well as a MIDI device. This hook
// captures its audio input (Web Audio) and exposes live in/out levels —
// the metering + capture foundation for the planned loop station.
// Everything is torn down on disable/unmount; no audio runs until the user
// clicks enable (getUserMedia + AudioContext both need a gesture anyway).

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
  enable: () => Promise<void>;
  disable: () => void;
  setMonitoring: (on: boolean) => void;
  /** current levels 0..1 (perceptual, dB-mapped) — read inside rAF, not state */
  getLevels: () => { input: number; output: number };
}

const DEVICE_HINT = /gp-?200|valeton/i;

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

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inAnalyserRef = useRef<AnalyserNode | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const disable = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
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
      inAnalyserRef.current = inAnalyser;
      outAnalyserRef.current = outAnalyser;
      monitorGainRef.current = gain;
      bufRef.current = new Float32Array(inAnalyser.fftSize);
      setDeviceLabel(stream.getAudioTracks()[0]?.label || 'audio input');
      setActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audio capture failed');
    } finally {
      setStarting(false);
    }
  }, [active, starting]);

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

  return { active, starting, deviceLabel, error, monitoring, enable, disable, setMonitoring, getLevels };
}
