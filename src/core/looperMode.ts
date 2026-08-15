// Which of the loop station's two faces the user last had open.
//
// Persisted per machine like every other looper preference (loopCapture.ts,
// looperTriggers.ts): the mode is a habit of whoever is standing in front of
// the rig, not a property of a patch or a file. New users land on SIMPLE.

export type LooperMode = 'simple' | 'advanced';

export const DEFAULT_LOOPER_MODE: LooperMode = 'simple';

const MODE_KEY = 'gp200-studio.looper.mode';

export function loadLooperMode(): LooperMode {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(MODE_KEY);
  } catch {
    return DEFAULT_LOOPER_MODE;
  }
  if (raw === 'advanced') return 'advanced';
  if (raw === 'simple') return 'simple';
  return DEFAULT_LOOPER_MODE;
}

export function saveLooperMode(mode: LooperMode): void {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Private mode / quota exceeded / storage disabled.
  }
}
