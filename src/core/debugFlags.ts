// Opt-in diagnostics toggles, readable live from DevTools without a reload.
//
// Enable the incoming-MIDI monitor (hex-dumps frames no dispatcher branch
// handled) with:
//   localStorage.setItem('gp200:debug:midiMonitor', '1')
// and disable it with removeItem. Read per call on purpose: one localStorage
// get per unhandled frame is negligible and lets the flag flip mid-session.

export const MIDI_MONITOR_FLAG = 'gp200:debug:midiMonitor';

export function isMidiMonitorEnabled(): boolean {
  return isFlagEnabled(MIDI_MONITOR_FLAG);
}

// Hex-dump the User-IR enumeration sweep the handshake performs
// (0x11/0x1C → 0x12/0x1C, useMidiDevice step 9) with:
//   localStorage.setItem('gp200:debug:assignments', '1')
// The sweep was re-identified 2026-08-08 as the device's 30 User-IR slot
// names (docs/protocol-capture.md §3); the names feed `userIrNames`, and this
// flag dumps each raw record for eyeballing the layout beyond the name field.
export const ASSIGNMENT_DUMP_FLAG = 'gp200:debug:assignments';

export function isAssignmentDumpEnabled(): boolean {
  return isFlagEnabled(ASSIGNMENT_DUMP_FLAG);
}

// Hardware experiment for Gap C (docs/protocol-capture.md §2b): when set,
// renameSlot additionally sends the EXPERIMENTAL single-field patch-name
// frame (SysExCodec.buildPatchName, address hypothesis 0x0B60) before the
// save-commit. Enable with:
//   localStorage.setItem('gp200:debug:nameWrite', '1')
// If the rename then survives a power cycle, the hypothesis is confirmed and
// the frame can be promoted to the default path.
export const NAME_WRITE_FLAG = 'gp200:debug:nameWrite';

export function isNameWriteEnabled(): boolean {
  return isFlagEnabled(NAME_WRITE_FLAG);
}

function isFlagEnabled(flag: string): boolean {
  try {
    return localStorage.getItem(flag) === '1';
  } catch {
    return false;
  }
}
