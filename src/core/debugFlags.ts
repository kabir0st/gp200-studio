// Opt-in diagnostics toggles, readable live from DevTools without a reload.
//
// Enable the incoming-MIDI monitor (hex-dumps frames no dispatcher branch
// handled) with:
//   localStorage.setItem('gp200:debug:midiMonitor', '1')
// and disable it with removeItem. Read per call on purpose: one localStorage
// get per unhandled frame is negligible and lets the flag flip mid-session.

export const MIDI_MONITOR_FLAG = 'gp200:debug:midiMonitor';

export function isMidiMonitorEnabled(): boolean {
  try {
    return localStorage.getItem(MIDI_MONITOR_FLAG) === '1';
  } catch {
    return false;
  }
}
