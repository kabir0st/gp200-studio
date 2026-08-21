import { useEffect, useState } from 'react';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';

/**
 * The connect button's state machine, in one place.
 *
 * The landing page offers the same primary action twice — in the hero card
 * (LandingConnect) and, once that has scrolled away, in the sticky bar
 * (LandingStickyCta). Two buttons showing one handshake must never disagree
 * about what it is doing, so the label and the flags live here rather than
 * being written out at each call site.
 *
 * It returns state, not a ready-made handler, because the two callers differ
 * where it matters: the hero disables itself when Web MIDI is missing and
 * leaves the ghost "open without connecting" button beside it, while the
 * sticky bar has no room for a second button and falls back to the blank
 * preset instead. Only the hero has room for `hint`.
 *
 * `webMidiSupported` is resolved in an effect rather than at render: these
 * components are prerendered under Node, where there is no `navigator`, and
 * the static HTML must not claim Web MIDI is missing before the browser has
 * spoken.
 */
export function useConnectCta(midiDevice: UseMidiDeviceReturn) {
  const { status, handshakeStep } = midiDevice;
  const [webMidiSupported, setWebMidiSupported] = useState(true);

  useEffect(() => {
    setWebMidiSupported('requestMIDIAccess' in navigator);
  }, []);

  const busy = status === 'connecting' || status === 'handshaking';
  const connected = status === 'connected';

  // The sub-label carries the instruction the old single long label used to:
  // people click this before the pedal is plugged in, and the handshake then
  // fails for a reason that has nothing to do with the app.
  let label = 'CONNECT YOUR GP-200';
  let hint: string | null = 'plug it in over USB first';
  if (busy) {
    label = handshakeStep ?? 'CONNECTING…';
    hint = null;
  } else if (status === 'error') {
    label = 'RETRY CONNECT';
    hint = null;
  }

  return { busy, connected, webMidiSupported, label, hint };
}
