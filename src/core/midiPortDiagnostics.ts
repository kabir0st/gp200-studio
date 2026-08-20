/**
 * The message CONNECT shows when it cannot find a GP-200.
 *
 * "GP-200 not found in MIDI ports" is true and useless: it reads identically
 * whether the pedal is unplugged, held open by the official editor, or — the
 * case that costs the most time — plugged in and working perfectly, but
 * invisible to the browser because ALSA never bridged it into the sequencer.
 *
 * Chrome on Linux enumerates Web MIDI from the ALSA *sequencer*, not from
 * rawmidi. A USB pedal can appear in `lsusb` and `/proc/asound/cards`, expose
 * `/dev/snd/midiC*D*`, and still show up nowhere in the browser until
 * `snd-seq-midi` is loaded to publish it as a sequencer client. Nothing in a
 * web page can detect or fix that, so the message names the fix instead.
 *
 * Listing the ports that *were* found is the other half. An empty list means
 * the browser sees no MIDI at all (permission, or a machine with none); a list
 * without the pedal in it means the pedal specifically is missing, which is a
 * different problem with different fixes.
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

export interface MidiPortSurvey {
  /** Every port name the browser exposed, inputs and outputs together. On a
   *  real MIDIPort `name` is `string | null`, hence the nulls. */
  portNames: readonly (string | null)[];
  /** `navigator.userAgent`, or '' where there isn't one. */
  userAgent: string;
}

/**
 * Whether to suggest loading the ALSA sequencer bridge.
 *
 * Desktop Linux only: Android reaches USB-MIDI through its own stack and
 * ChromeOS through a sandboxed service, so on either the modprobe advice is a
 * wrong turn down a road the user cannot even walk (no shell, no root).
 */
export function needsAlsaSequencerHint(userAgent: string): boolean {
  if (/Android|CrOS/i.test(userAgent)) return false;
  return /Linux|X11/i.test(userAgent);
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

  return `${found} On Linux the browser only sees MIDI through the ALSA `
    + 'sequencer: run "sudo modprobe snd-seq-midi", then reload this page.';
}
