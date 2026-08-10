// Device-global settings model: footswitch mode/targets/combos + Auto Cab
// Match, mirroring the GP-200's SETTINGS → Footswitch screen.
//
// Wire format: the 0x12/0x08 settings-write family (SysExCodec.buildFsMode /
// buildFsTarget / buildFsCombo / buildAutoCabMatch), decoded 2026-07-18 from
// the dumps/ capture set , docs/protocol-capture.md §0.2/§0.3. The protocol
// is WRITE-ONLY so far: the app cannot read the pedal's current values, so
// this model tracks "what the app last set" and persists it locally.
//
// Pure module: id tables, model shape, localStorage envelope. Sending lives
// in useMidiSend. The settings drawer UI was removed (write-only protocol,
// no read-back to show); the model persists for the looper FS takeover,
// which rewrites TAP targets and must restore the last-written values.

/** FS action ids, verbatim from the fs-1-tap-all-changes capture sweep. */
export const FS_ACTION = {
  NONE: 0x00,
  CTRL1: 0x01,
  CTRL2: 0x02,
  CTRL3: 0x03,
  CTRL4: 0x04,
  LOOPER: 0x05,
  DRUM: 0x06,
  TUNER: 0x07,
  TAP_TEMPO: 0x08,
  BANK_UP: 0x09,
  BANK_DOWN: 0x0a,
  PATCH_UP: 0x0b,
  PATCH_DOWN: 0x0c,
  PATCH_A: 0x0d,
  PATCH_B: 0x0e,
  PATCH_C: 0x0f,
  PATCH_D: 0x10,
  BANK: 0x11,
  DRUM_PATCH_UP: 0x12,
  DRUM_PATCH_DOWN: 0x13,
  EXP1_AB: 0x14,
  MIDI: 0x15,
  // 0x16 unobserved in the sweeps; presumably reserved.
  CTRL5: 0x17,
  CTRL6: 0x18,
  CTRL7: 0x19,
  CTRL8: 0x1a,
} as const;

const ACTION_LABELS = new Map<number, string>([
  [FS_ACTION.NONE, 'None'],
  [FS_ACTION.CTRL1, 'CTRL 1'],
  [FS_ACTION.CTRL2, 'CTRL 2'],
  [FS_ACTION.CTRL3, 'CTRL 3'],
  [FS_ACTION.CTRL4, 'CTRL 4'],
  [FS_ACTION.LOOPER, 'Looper'],
  [FS_ACTION.DRUM, 'Drum'],
  [FS_ACTION.TUNER, 'Tuner'],
  [FS_ACTION.TAP_TEMPO, 'Tap'],
  [FS_ACTION.BANK_UP, 'Bank +'],
  [FS_ACTION.BANK_DOWN, 'Bank -'],
  [FS_ACTION.PATCH_UP, 'Patch +'],
  [FS_ACTION.PATCH_DOWN, 'Patch -'],
  [FS_ACTION.PATCH_A, 'Patch A'],
  [FS_ACTION.PATCH_B, 'Patch B'],
  [FS_ACTION.PATCH_C, 'Patch C'],
  [FS_ACTION.PATCH_D, 'Patch D'],
  [FS_ACTION.BANK, 'Bank'],
  [FS_ACTION.DRUM_PATCH_UP, 'Drum Patch +'],
  [FS_ACTION.DRUM_PATCH_DOWN, 'Drum Patch -'],
  [FS_ACTION.EXP1_AB, 'Exp1 A/B'],
  [FS_ACTION.MIDI, 'Midi'],
  [FS_ACTION.CTRL5, 'CTRL 5'],
  [FS_ACTION.CTRL6, 'CTRL 6'],
  [FS_ACTION.CTRL7, 'CTRL 7'],
  [FS_ACTION.CTRL8, 'CTRL 8'],
]);

export function fsActionLabel(actionId: number): string {
  return ACTION_LABELS.get(actionId) ?? `0x${actionId.toString(16)}`;
}

/** TAP dropdown ids in the device's own menu order (per actions.md). */
export const TAP_MENU: readonly number[] = [
  FS_ACTION.BANK, FS_ACTION.BANK_UP, FS_ACTION.BANK_DOWN,
  FS_ACTION.PATCH_UP, FS_ACTION.PATCH_DOWN,
  FS_ACTION.PATCH_A, FS_ACTION.PATCH_B, FS_ACTION.PATCH_C, FS_ACTION.PATCH_D,
  FS_ACTION.LOOPER, FS_ACTION.DRUM,
  FS_ACTION.DRUM_PATCH_UP, FS_ACTION.DRUM_PATCH_DOWN,
  FS_ACTION.EXP1_AB, FS_ACTION.MIDI, FS_ACTION.TUNER,
  FS_ACTION.CTRL1, FS_ACTION.CTRL2, FS_ACTION.CTRL3, FS_ACTION.CTRL4,
  FS_ACTION.CTRL5, FS_ACTION.CTRL6, FS_ACTION.CTRL7, FS_ACTION.CTRL8,
  FS_ACTION.TAP_TEMPO, FS_ACTION.NONE,
];

/** HOLD menu = TAP menu minus CTRL 1-8 and Tap (per the hold sweep). */
export const HOLD_MENU: readonly number[] = TAP_MENU.filter((actionId) => {
  if (actionId === FS_ACTION.TAP_TEMPO) return false;
  const isCtrl =
    (actionId >= FS_ACTION.CTRL1 && actionId <= FS_ACTION.CTRL4) ||
    (actionId >= FS_ACTION.CTRL5 && actionId <= FS_ACTION.CTRL8);
  return !isCtrl;
});

/** The CTRL action for footswitch n , used by the looper takeover, which
 *  points each hijacked switch at its same-numbered CTRL. */
export function ctrlActionForFs(fs: number): number {
  if (fs <= 4) return FS_ACTION.CTRL1 + (fs - 1);
  return FS_ACTION.CTRL5 + (fs - 5);
}

export const FS_MODES = ['Patch', 'Stomp', 'User'] as const;

export interface DeviceSettings {
  /** 0=Patch, 1=Stomp, 2=User */
  fsMode: number;
  /** action ids for FS1..FS8 tap / hold */
  taps: number[];
  holds: number[];
  /** action ids for combos FS1+5, FS2+6, FS3+7, FS4+8 */
  combos: number[];
  autoCabMatch: boolean;
}

export const defaultDeviceSettings: DeviceSettings = {
  fsMode: 0,
  taps: Array.from({ length: 8 }, () => FS_ACTION.NONE),
  holds: Array.from({ length: 8 }, () => FS_ACTION.NONE),
  combos: Array.from({ length: 4 }, () => FS_ACTION.NONE),
  autoCabMatch: true,
};

// ---------------------------------------------------------------------------
// Persistence (same guarded envelope pattern as looperTriggers.ts).
// ---------------------------------------------------------------------------

const STORE_KEY = 'gp200:deviceSettings';
const STORE_VERSION = 1;

interface StoreEnvelope {
  v: number;
  updatedAt: number;
  settings: DeviceSettings;
}

function isActionIdArray(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  return value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 0x1a);
}

function isValidSettings(value: unknown): value is DeviceSettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Partial<DeviceSettings>;
  if (!Number.isInteger(settings.fsMode)) return false;
  if ((settings.fsMode as number) < 0 || (settings.fsMode as number) > 2) return false;
  if (!isActionIdArray(settings.taps, 8)) return false;
  if (!isActionIdArray(settings.holds, 8)) return false;
  if (!isActionIdArray(settings.combos, 4)) return false;
  return typeof settings.autoCabMatch === 'boolean';
}

export function loadDeviceSettings(): DeviceSettings | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const env = parsed as Partial<StoreEnvelope>;
  if (env.v !== STORE_VERSION) return null;
  if (!isValidSettings(env.settings)) return null;
  return env.settings;
}

export function saveDeviceSettings(settings: DeviceSettings): void {
  const envelope: StoreEnvelope = {
    v: STORE_VERSION,
    updatedAt: Date.now(),
    settings,
  };
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded / storage disabled: best-effort.
  }
}
