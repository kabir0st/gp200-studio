// Decoders for the GP-200's real-time footswitch / expression-pedal frames.
//
// STATUS: the exact wire format is PENDING a USB capture (see
// docs/protocol-capture.md §4, footswitch presses and EXP-pedal sweep). The
// cheapest hypothesis, consistent with the device exposing standard MIDI clock
// I/O, is that both arrive as **standard Control Change** messages rather than
// SysEx. This module implements that path with PLACEHOLDER CC numbers so the
// dispatcher and UI can be built and unit-tested now; swap the constants (and,
// if the capture shows SysEx instead, add a SysEx decoder here) once the
// `.pcap` diff lands. Keeping every magic number in this one pure module means
// the reverse-engineered format is documented, testable, and never smeared
// across the dispatcher.

/** Foot-controller CC number carrying EXP-pedal position 0..127. PLACEHOLDER. */
export const EXP_CC = 4; // TODO(capture): confirm against gp200-exp-sweep.pcap

/** CC number → footswitch number (1..8). PLACEHOLDER mapping. */
export const FS_CC_MAP: ReadonlyMap<number, number> = new Map([
  [80, 1], [81, 2], [82, 3], [83, 4],
  [84, 5], [85, 6], [86, 7], [87, 8],
]); // TODO(capture): confirm against gp200-footswitch-*.pcap

/** CC value at/above which a footswitch counts as pressed (MIDI switch convention). */
export const FS_ON_THRESHOLD = 64;

export type ControlEvent =
  | { kind: 'exp'; value: number } // 0..127
  | { kind: 'footswitch'; fsNumber: number; state: boolean };

/**
 * Decode an incoming raw MIDI message into a looper-relevant control event, or
 * null if it isn't one. Handles standard Control Change (status 0xB0..0xBF);
 * anything else (SysEx, notes) returns null and is left for other handlers.
 */
export function decodeControlChange(data: ArrayLike<number>): ControlEvent | null {
  if (data.length < 3) return null;
  if ((data[0] & 0xf0) !== 0xb0) return null; // not a Control Change
  const cc = data[1];
  const value = data[2];
  if (cc === EXP_CC) return { kind: 'exp', value };
  const fsNumber = FS_CC_MAP.get(cc);
  if (fsNumber !== undefined) return { kind: 'footswitch', fsNumber, state: value >= FS_ON_THRESHOLD };
  return null;
}
