/**
 * Chassis sound: the mechanical clack of the stage-lights rocker.
 *
 * Two one-shots (`public/ui/*.wav`, provenance in that folder's README) played
 * through a tiny playback-only AudioContext.
 *
 * Deliberately NOT the shared engine context from AudioEngineProvider: that one
 * only exists while GP-200 capture is running (`useAudioMeter.getContext()`
 * returns null otherwise), and a chrome click must neither force the mic open
 * nor fall silent when capture stops. Same reasoning `useDrumMachine.ts`
 * documents for owning its own context — and for the same reason this one is
 * NOT mirrored onto the engine's `setSinkId` choice: routing the interface to a
 * loop-station output shouldn't move the UI's own noises off the speakers.
 */

const STORAGE_KEY = 'gp200:ui-sound';

/** Files are peak-normalised to -3 dBFS, which is far too loud for chrome. */
const CLICK_GAIN = 0.4;

const SOURCES = {
  on: 'ui/switch-on.wav',
  off: 'ui/switch-off.wav',
} as const;

type ClickName = keyof typeof SOURCES;

let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
let enabledCache: boolean | null = null;
const buffers = new Map<ClickName, AudioBuffer>();
const inflight = new Map<ClickName, Promise<AudioBuffer | null>>();

/** Default on; only an explicit 'off' mutes, so a blocked store stays audible. */
function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function isUiSoundEnabled(): boolean {
  if (enabledCache === null) enabledCache = readEnabled();
  return enabledCache;
}

export function setUiSoundEnabled(next: boolean): void {
  enabledCache = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
  } catch {
    // Private mode / blocked storage: the choice still holds for this session.
  }
}

/** The live output context. Only ever built from inside a click handler. */
function ensureContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}

/**
 * Decoding needs *a* context, but building a live AudioContext outside a user
 * gesture starts it suspended and makes Chrome log an autoplay warning. An
 * offline context has no output, so preloading stays silent and quiet in the
 * console; AudioBuffers are not bound to the context that decoded them.
 */
function decodeContext(): BaseAudioContext | null {
  if (ctx) return ctx;
  if (typeof OfflineAudioContext === 'undefined') return null;
  return new OfflineAudioContext(1, 1, 48000);
}

function loadClick(name: ClickName): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(name);
  if (pending) return pending;

  const job = (async (): Promise<AudioBuffer | null> => {
    try {
      const audio = decodeContext();
      if (!audio) return null;
      const response = await fetch(`${import.meta.env.BASE_URL}${SOURCES[name]}`);
      if (!response.ok) throw new Error(`${SOURCES[name]}: HTTP ${response.status}`);
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      buffers.set(name, buffer);
      return buffer;
    } catch {
      // A missing or undecodable click is never worth breaking a toggle over.
      return null;
    } finally {
      inflight.delete(name);
    }
  })();

  inflight.set(name, job);
  return job;
}

function play(buffer: AudioBuffer): void {
  const audio = ensureContext();
  if (!audio) return;
  // One physical switch makes one noise: spamming the toggle should retrigger,
  // not stack overlapping copies of a 170ms clack.
  try {
    playing?.stop();
  } catch {
    // already ended
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const gain = audio.createGain();
  gain.gain.value = CLICK_GAIN;
  source.connect(gain).connect(audio.destination);
  source.onended = () => {
    if (playing === source) playing = null;
    gain.disconnect();
  };
  source.start();
  playing = source;
}

/**
 * Fire the rocker clack. `on` picks the sample: the paddle sinking into the
 * housing is duller than the snap back out, so the two positions sound
 * different the way the real switch does.
 */
export function playSwitchClick(on: boolean): void {
  if (!isUiSoundEnabled()) return;
  const name: ClickName = on ? 'on' : 'off';
  const cached = buffers.get(name);
  if (cached) {
    play(cached);
    return;
  }
  // Cold start: decode first, then play a few ms late. preloadSwitchClicks()
  // has normally already run, so this path is the exception.
  void loadClick(name).then((buffer) => buffer && play(buffer));
}

/** Warm the decode cache so the first toggle is not the one that stutters. */
export function preloadSwitchClicks(): void {
  if (!isUiSoundEnabled()) return;
  void loadClick('on');
  void loadClick('off');
}
