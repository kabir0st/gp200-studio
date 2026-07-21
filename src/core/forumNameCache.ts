/**
 * localStorage cache for the visitor's message-wall display name, so the forum
 * form can prefill it on their next visit instead of asking again.
 *
 * Follows the same versioned-envelope + swallow-errors convention as
 * presetNameCache.ts (the app's other browser-persistence layer): private-mode
 * / quota / disabled-storage failures degrade to "no cache" instead of throwing.
 */

const FORUM_NAME_KEY = 'gp200:forum:name';

/** Bump when the envelope shape changes; older caches are then discarded. */
const CACHE_VERSION = 1;

interface NameEnvelope {
  v: number;
  updatedAt: number;
  name: string;
}

/** Read the cached name, or null on miss / malformed data / unavailable storage. */
export function loadForumName(): string | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(FORUM_NAME_KEY);
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
  const env = parsed as Partial<NameEnvelope>;
  if (env.v !== CACHE_VERSION) return null;
  if (typeof env.name !== 'string' || env.name.length === 0) return null;
  return env.name;
}

/** Persist the display name. Swallows quota/availability errors. */
export function saveForumName(name: string): void {
  const envelope: NameEnvelope = {
    v: CACHE_VERSION,
    updatedAt: Date.now(),
    name,
  };
  try {
    localStorage.setItem(FORUM_NAME_KEY, JSON.stringify(envelope));
  } catch {
    // Private mode / quota exceeded / storage disabled: cache is best-effort.
  }
}
