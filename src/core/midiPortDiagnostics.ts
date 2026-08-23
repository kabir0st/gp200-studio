/**
 * The message CONNECT shows when it cannot find a GP-200.
 *
 * "GP-200 not found in MIDI ports" is true and useless: it reads identically
 * whether the pedal is unplugged, held open by the official editor, or — the
 * case that costs the most time — plugged in and working perfectly, but
 * invisible to the browser because of something no web page can see.
 *
 * Chrome on Linux enumerates Web MIDI from the ALSA *sequencer*, not from
 * rawmidi. A USB pedal can appear in `lsusb` and `/proc/asound/cards`, expose
 * `/dev/snd/midiC*D*`, and still show up nowhere in the browser. Two distinct
 * faults cause that, and they are indistinguishable from inside the page, so
 * the message names both instead of guessing:
 *
 *   1. `snd-seq-midi` is not loaded, so rawmidi devices were never published
 *      as sequencer clients.
 *   2. The browser is sandboxed away from udev. Chromium enumerates ALSA
 *      cards through udev and binds them to sequencer clients; a Flatpak or
 *      Snap build gets `/dev/snd` via `devices=all` but no `/run/udev`, so it
 *      drops every card-backed port and keeps only the card-less ones.
 *
 * Listing the ports that *were* found is the other half, and it is what
 * separates those two from a third case. An empty list means the browser sees
 * no MIDI at all (a machine with none, or access never granted); a list with
 * other hardware in it but no pedal means the pedal specifically is missing;
 * a list of nothing but virtual ports is the signature of 1 or 2 above,
 * because Midi Through is card-less and survives both.
 *
 * Lives here rather than in useMidiDevice so the wording is testable without a
 * MIDIAccess mock. Note the coupling to errorCode() in analyticsEvents.ts: it
 * buckets this string by the words "not found", so every branch below keeps
 * them, and none introduce a word an earlier branch of that matcher claims
 * ("timeout", "not supported", "permission", "denied").
 */

/** Longest port name echoed back; vendor names get verbose. */
const MAX_NAME_LENGTH = 40;

/** How many names to list before the tail collapses into a count. */
const MAX_NAMES_LISTED = 4;

/**
 * Sequencer ports that exist with no sound card behind them.
 *
 * ALSA ships Midi Through (snd-seq-dummy) on every box, and DAWs and MIDI
 * bridges add loopbacks of their own. Being card-less is the whole point here:
 * it is why these survive a udev-blind browser when real devices do not.
 */
const VIRTUAL_PORT_PATTERNS: readonly RegExp[] = [
  /midi\s*through/i,
  /through\s*port/i,
  /rtmidi/i,
  /virtual/i,
  /loopmidi/i,
];

export interface MidiPortSurvey {
  /** Every port name the browser exposed, inputs and outputs together. On a
   *  real MIDIPort `name` is `string | null`, hence the nulls. */
  portNames: readonly (string | null)[];
  /** `navigator.userAgent`, or '' where there isn't one. */
  userAgent: string;
}

/**
 * Whether to suggest a Linux-specific fix at all.
 *
 * Desktop Linux only: Android reaches USB-MIDI through its own stack and
 * ChromeOS through a sandboxed service, so on either the advice is a wrong
 * turn down a road the user cannot even walk (no shell, no root).
 */
export function needsAlsaSequencerHint(userAgent: string): boolean {
  if (/Android|CrOS/i.test(userAgent)) return false;
  return /Linux|X11/i.test(userAgent);
}

/** Whether a single port name is one of the card-less always-there ports. */
export function isVirtualPortName(name: string): boolean {
  return VIRTUAL_PORT_PATTERNS.some((pattern) => pattern.test(name));
}

/**
 * Whether every port the browser found is virtual.
 *
 * This is the tell that the ALSA sequencer is reachable — something is being
 * enumerated — while nothing backed by an actual card is getting through.
 *
 * Requires at least one port on purpose: an empty list is a different fault
 * (no MIDI at all) with a different fix, and `every` on an empty array is
 * vacuously true, which would misfile it here.
 */
export function hasOnlyVirtualPorts(portNames: readonly string[]): boolean {
  return portNames.length > 0 && portNames.every(isVirtualPortName);
}

/** Trimmed, de-duplicated, length-capped port names, in first-seen order. */
export function summarisePortNames(portNames: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of portNames) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    names.push(
      trimmed.length > MAX_NAME_LENGTH ? `${trimmed.slice(0, MAX_NAME_LENGTH - 1)}…` : trimmed,
    );
  }
  return names;
}

/** The full error string for "the browser has MIDI, but no GP-200 in it". */
export function describeMissingDevice({ portNames, userAgent }: MidiPortSurvey): string {
  const names = summarisePortNames(portNames);
  const listed = names.slice(0, MAX_NAMES_LISTED);
  const hidden = names.length - listed.length;

  const found = names.length === 0
    ? 'GP-200 not found — the browser reports no MIDI ports at all.'
    : `GP-200 not found. Ports the browser can see: ${listed.join(', ')}`
      + `${hidden > 0 ? ` and ${hidden} more` : ''}.`;

  if (!needsAlsaSequencerHint(userAgent)) return found;

  // Nothing but virtual ports: the sequencer is reachable and every real card
  // is being dropped before it gets here. Both causes are named because the
  // page cannot tell them apart, and the sandbox one goes first — it is the
  // one that survives the modprobe advice and keeps the user stuck.
  if (hasOnlyVirtualPorts(names)) {
    return `${found} Only virtual ports came through, which on Linux means one `
      + 'of two things. If your browser is a Flatpak or Snap build it has no '
      + 'udev and drops every USB device: run "flatpak override --user '
      + '--filesystem=/run/udev:ro <app-id>" and fully restart it, or switch to '
      + 'a natively installed Chrome. Otherwise the ALSA sequencer bridge is '
      + 'missing: run "sudo modprobe snd-seq-midi", then reload this page.';
  }

  return `${found} On Linux the browser only sees MIDI through the ALSA `
    + 'sequencer: run "sudo modprobe snd-seq-midi", then reload this page.';
}

/**
 * The other half of the connect funnel: the pedal WAS found.
 *
 * Everything above covers "no GP-200 in the port list". Once both ports open,
 * the next thing that goes wrong is silence — the handshake sends its first
 * query and nothing ever comes back, and the caller rejects with a bare
 * "Response timeout" that names no cause at all.
 *
 * On Windows one cause dwarfs the rest, and it is invisible from inside the
 * page: Chromium's default MIDI backend there is legacy WinMM, which is
 * exclusive per process. Chromium opens every MIDI port the moment a page
 * calls requestMIDIAccess and holds them for the life of the process, so one
 * other browser with this app open — or Valeton's editor, or a DAW — takes
 * the pedal away from this one. Enumeration still succeeds, because listing
 * ports is a separate query that does not open them, which is exactly why
 * this presents as a timeout and not as a missing device.
 *
 * The second cause is the WinRT backend behind `use-winrt-midi-api`, which is
 * documented to hang on SysEx (crbug 645403) and this app speaks nothing but
 * SysEx. It is a flag rather than a default, so it is worth naming only after
 * the port-contention fix, and only as "match a browser that does work".
 *
 * Whether ANY byte arrived is the discriminator between those two shapes, and
 * it is passed in rather than guessed: a pedal that has said something is
 * plainly not being held by another process, and sending that user off to
 * close their other browser is a wrong turn.
 */

export interface HandshakeSilence {
  /** `navigator.userAgent`, or '' where there isn't one. */
  userAgent: string;
  /** Whether the browser is Brave; see braveFlagsUrl for why it can't be a UA test. */
  isBrave: boolean;
  /** Whether any MIDI byte at all arrived from the device since CONNECT. */
  sawAnyBytes: boolean;
}

/** Whether the exclusive-port advice applies. Desktop Windows only; nothing
 *  else in the UA field can match, so no exclusion list is needed. */
export function isWindowsUserAgent(userAgent: string): boolean {
  return /Windows NT/i.test(userAgent);
}

/**
 * The MIDI-backend flag, in the browser the user is actually holding.
 *
 * Brave ships Chrome's user-agent string byte for byte, so this cannot be
 * derived from `userAgent` and the caller has to resolve it from the
 * `navigator.brave` object Brave injects. Naming the wrong scheme here is
 * worse than naming none: `chrome://flags` does not open in Brave at all.
 */
function flagsUrl(isBrave: boolean): string {
  if (isBrave) return 'brave://flags/#use-winrt-midi-api';
  return 'chrome://flags/#use-winrt-midi-api';
}

/** Where the MIDI permission for this site lives. Brave gets its own wording
 *  because it defaults the grant to the session, so it lapses on every
 *  restart and the user is re-asked forever without being told why. */
function sitePermissionAdvice(isBrave: boolean): string {
  const path = 'Click the icon at the left of the address bar, open Site settings, and set '
    + '"MIDI device control & reprogram" to Allow.';
  if (!isBrave) return `${path} Then reload this page.`;
  return `${path} Brave lets that grant lapse when you close the site, so choose to `
    + 'remember the decision if you would rather not re-allow it after every restart. '
    + 'Then reload this page.';
}

/**
 * The message for a handshake that opened both ports and then heard nothing.
 *
 * Keeps the words "Response timeout" at the head deliberately: errorCode() in
 * analyticsEvents.ts matches substrings in priority order and tests `timeout`
 * first, so this stays in the bucket the terse message used to occupy and the
 * added prose cannot retitle the funnel.
 */
export function describeHandshakeSilence(
  { userAgent, isBrave, sawAnyBytes }: HandshakeSilence,
): string {
  // Bytes arrived, so the port is ours and the pedal is alive; the fault is in
  // what it replied, not in who owns it.
  if (sawAnyBytes) {
    return 'Response timeout — the GP-200 is sending, but not the reply this step asked '
      + 'for. Power-cycle the pedal and connect again; if it stops at the same step every '
      + 'time, your firmware may be one this app has not been read against.';
  }

  const held = 'Response timeout — the GP-200 port opened but the pedal never answered, '
    + 'which usually means another program already owns it. Close any other browser that '
    + 'has this app open (a browser keeps its MIDI ports for as long as its process lives, '
    + 'including a background tray icon after the last window is shut), quit Valeton\'s '
    + 'editor and any DAW, then unplug and replug the pedal.';

  if (!isWindowsUserAgent(userAgent)) return held;

  return `${held} Windows gives one program at a time exclusive use of a USB-MIDI port, so `
    + `this is the usual cause there. If nothing else is running, check ${flagsUrl(isBrave)}: `
    + 'that backend is known to hang on the SysEx messages this app is built out of. Set it '
    + 'to match a browser that does work, then fully relaunch.';
}

/**
 * The message for a browser that refused Web MIDI outright.
 *
 * Once a Block is stored for the origin the browser stops prompting, so this
 * failure is instant and has no popup behind it — the DOMException says
 * "Permission denied" and nothing about where the switch is. Carries the word
 * "permission" and none of errorCode()'s earlier triggers, so it buckets as
 * `permission` rather than as a timeout or a missing API.
 */
export function describeMidiAccessDenied({ isBrave }: { isBrave: boolean }): string {
  return 'The browser refused Web MIDI permission, so the GP-200 cannot be reached. '
    + sitePermissionAdvice(isBrave);
}

/**
 * The message for a MIDIAccess that resolved with SysEx stripped out.
 *
 * A browser can grant plain MIDI and withhold System Exclusive, and every
 * frame this app sends or expects is SysEx — so the access is worthless and
 * would otherwise present as a handshake that hangs for no visible reason.
 * Same bucketing constraint as describeMidiAccessDenied.
 */
export function describeSysexDenied({ isBrave }: { isBrave: boolean }): string {
  return 'Web MIDI opened without SysEx permission, and the GP-200 speaks nothing but '
    + 'SysEx. ' + sitePermissionAdvice(isBrave);
}
