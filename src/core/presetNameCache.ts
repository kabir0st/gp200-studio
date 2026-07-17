/**
 * localStorage cache for the GP-200's 256 slot names, so the Patch Manager can
 * show names instantly on connect instead of waiting for the ~5s background
 * SysEx scan. This is the app's only browser-persistence layer; durable state
 * otherwise lives on the device flash or in downloaded .prst/.zip files.
 *
 * The device exposes no unique serial over MIDI, so the cache is keyed on the
 * generic deviceType byte + the MIDI port name (effectively one cache per
 * machine). Names read back from the device are always re-verified in the
 * background (see useMidiDevice.syncPresetNames), so a stale cache self-heals.
 *
 * All storage access is wrapped so that private-mode / quota / disabled-storage
 * failures degrade to "no cache" instead of throwing.
 */

export const TOTAL_SLOTS = 256;

/** Bump when the envelope shape changes; older caches are then discarded. */
const CACHE_VERSION = 1;

interface CacheEnvelope {
  v: number;
  updatedAt: number;
  names: (string | null)[];
}

export function presetNameCacheKey(deviceType: number, portName: string | null): string {
  return `gp200:names:${deviceType}:${portName ?? 'unknown'}`;
}

/**
 * Read + validate a cached name list. Returns the 256-entry array on a hit, or
 * null on miss / malformed data / version mismatch / unavailable storage.
 */
export function loadCachedNames(key: string): (string | null)[] | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
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
  const env = parsed as Partial<CacheEnvelope>;
  if (env.v !== CACHE_VERSION) return null;
  if (!Array.isArray(env.names) || env.names.length !== TOTAL_SLOTS) return null;
  for (const entry of env.names) {
    if (entry !== null && typeof entry !== 'string') return null;
  }
  return env.names as (string | null)[];
}

/** Persist the name list. Swallows quota/availability errors. */
export function saveCachedNames(key: string, names: (string | null)[]): void {
  const envelope: CacheEnvelope = {
    v: CACHE_VERSION,
    updatedAt: Date.now(),
    names,
  };
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded / storage disabled: cache is best-effort.
  }
}
