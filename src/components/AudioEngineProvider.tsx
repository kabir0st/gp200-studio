import { createContext, useContext, type ReactNode } from 'react';
import { useAudioMeter, type AudioMeterApi } from '@/hooks/useAudioMeter';

// The GP-200 is a single USB audio device — only one AudioContext / getUserMedia
// open should exist for it. Both the AudioMeters and the loop station consume
// the same instance through this context, so they share one context + one input
// stream (two opens on the same device risk a device-open conflict and double
// the input latency). The provider owns the single useAudioMeter() call.

const AudioEngineContext = createContext<AudioMeterApi | null>(null);

export function AudioEngineProvider({ children }: { children: ReactNode }) {
  const engine = useAudioMeter();
  return <AudioEngineContext.Provider value={engine}>{children}</AudioEngineContext.Provider>;
}

export function useAudioEngine(): AudioMeterApi {
  const engine = useContext(AudioEngineContext);
  if (!engine) throw new Error('useAudioEngine must be used within an AudioEngineProvider');
  return engine;
}
