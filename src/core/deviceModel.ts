/**
 * Which GP-200 you actually own.
 *
 * The whole family — GP-200, GP-200R, GP-200X, GP-200JR and GP-200LT — writes
 * the same 1224-byte .prst and speaks the same SysEx, so files and patches move
 * between them freely. What differs is the front panel: the LT has four CTRL
 * footswitches where the rest have eight.
 *
 * That difference is presentation only. The file always carries all eight CTRL
 * records and controlRecords.ts always parses and writes eight, so a patch
 * edited on an LT keeps whatever CTRL 5-8 assignments it arrived with instead
 * of losing them. The model just decides how many switches to draw.
 *
 * Not auto-detected: the identity response carries a `deviceType` byte, but no
 * capture from an LT exists to say what it reads there, and guessing would mean
 * silently drawing the wrong panel. The choice is the user's until someone with
 * an LT sends a capture, at which point `deviceTypeByte` below is where the
 * mapping goes.
 */

export type DeviceModelId = 'gp200' | 'gp200lt';

export interface DeviceModel {
  id: DeviceModelId;
  /** Shown in the picker. */
  name: string;
  /** How many CTRL footswitches the hardware has. */
  ctrlCount: number;
  /** Identity-response deviceType byte, once one has been observed. */
  deviceTypeByte?: number;
}

export const DEVICE_MODELS: Record<DeviceModelId, DeviceModel> = {
  gp200: { id: 'gp200', name: 'GP-200 / R / X / JR', ctrlCount: 8 },
  gp200lt: { id: 'gp200lt', name: 'GP-200 LT', ctrlCount: 4 },
};

export const DEFAULT_DEVICE_MODEL: DeviceModelId = 'gp200';

/** Total CTRL records in the file, regardless of how many the panel shows. */
export const CTRL_RECORDS_IN_FILE = 8;

const STORAGE_KEY = 'gp200-studio:device-model';

export function isDeviceModelId(value: unknown): value is DeviceModelId {
  return value === 'gp200' || value === 'gp200lt';
}

export function loadDeviceModel(): DeviceModelId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isDeviceModelId(stored)) return stored;
  } catch {
    // Private mode / storage disabled: fall back to the common model.
  }
  return DEFAULT_DEVICE_MODEL;
}

export function saveDeviceModel(id: DeviceModelId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Preference is a nicety; failing to persist must not break the editor.
  }
}

/** How many CTRL footswitches to draw for a model. */
export function ctrlCountFor(id: DeviceModelId): number {
  return DEVICE_MODELS[id]?.ctrlCount ?? DEVICE_MODELS[DEFAULT_DEVICE_MODEL].ctrlCount;
}
