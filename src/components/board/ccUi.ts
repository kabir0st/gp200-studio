/**
 * Small presentation helpers shared by the two MIDI-CC remote panels
 * (DrumsPanel = drums + tuner, DeviceLooperPanel = the pedal's own looper).
 * Kept apart from CcControls.tsx so neither file mixes components with
 * plain exports (`react/only-export-components`).
 */

export const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';

export function toggleVariant(on: boolean): 'primary' | 'ghost' {
  if (on) return 'primary';
  return 'ghost';
}

export function playStopLabel(playing: boolean): string {
  if (playing) return '■ STOP';
  return '▶ PLAY';
}

export function disabledTitle(connected: boolean, action: string): string {
  if (connected) return action;
  return 'Connect the GP-200 to use this';
}
