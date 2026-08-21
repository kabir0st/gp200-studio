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
