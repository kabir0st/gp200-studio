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

// Hex-dump the controller-assignment sweep the handshake already performs
// (0x11/0x1C → 0x12/0x1C, useMidiDevice step 9) with:
//   localStorage.setItem('gp200:debug:assignments', '1')
// The responses are collected into `assignmentInfo` and currently consumed by
// nothing. They're the candidate read side for device-truth CTRL/EXP masks
// (docs/protocol-capture.md §3 step 4), so dumping them is the zero-risk first
// probe before any write capture: if the masks are in there, the 0x11/0x1C ↔
// 0x12/0x1C pair is very likely the read/write pair we're missing.
export const ASSIGNMENT_DUMP_FLAG = 'gp200:debug:assignments';

export function isAssignmentDumpEnabled(): boolean {
  return isFlagEnabled(ASSIGNMENT_DUMP_FLAG);
}

function isFlagEnabled(flag: string): boolean {
  try {
    return localStorage.getItem(flag) === '1';
  } catch {
    return false;
  }
}
