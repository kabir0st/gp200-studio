import { useEffect, useState } from 'react';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import { SysExCodec } from '@/core/SysExCodec';

interface LandingConnectProps {
  midiDevice: UseMidiDeviceReturn;
  /** open the editor with a blank INIT preset */
  onOpenBlank: () => void;
  /** open the editor with the connected device's current preset */
  onOpenCurrent: () => void;
  loadError: string | null;
  onDismissError: () => void;
}

/**
 * The landing page's actual job: get you into the editor.
 *
 * Lifted from the old single-card Landing unchanged in behaviour — connect the
 * GP-200, or open a blank preset — but it now sits inside a hero that has to
 * sell the app first, so the surrounding markup carries `data-lp-cta` for the
 * sticky bar's ScrollTrigger to watch (see useLandingMotion).
 *
 * `webMidiSupported` is resolved in an effect rather than at render: this
 * component is prerendered under Node, where there is no `navigator`, and the
 * static HTML must not claim Web MIDI is missing before the browser has
 * spoken.
 */
export function LandingConnect({
  midiDevice,
  onOpenBlank,
  onOpenCurrent,
  loadError,
  onDismissError,
}: LandingConnectProps) {
  const { status, handshakeStep, errorMessage, currentSlot, connect } = midiDevice;
  const [webMidiSupported, setWebMidiSupported] = useState(true);

  useEffect(() => {
    setWebMidiSupported('requestMIDIAccess' in navigator);
  }, []);

  const busy = status === 'connecting' || status === 'handshaking';
  const connected = status === 'connected';
  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const deviceName = currentSlot !== null ? midiDevice.presetNames[currentSlot] : null;

  // The sub-label carries the instruction the old single long label used to:
  // people click this before the pedal is plugged in, and the handshake then
  // fails for a reason that has nothing to do with the app.
  let connectLabel = 'CONNECT YOUR GP-200';
  let connectHint: string | null = 'plug it in over USB first';
  if (busy) {
    connectLabel = handshakeStep ?? 'CONNECTING…';
    connectHint = null;
  } else if (status === 'error') {
    connectLabel = 'RETRY CONNECT';
    connectHint = null;
  }

  return (
    <div className="lp-connect" data-lp-cta>
      <div className="lp-actions">
        {connected ? (
          <button type="button" className="lp-btn primary" onClick={onOpenCurrent}>
            <span className="lp-led on" aria-hidden="true" />
            OPEN CURRENT PRESET
            {slotLabel && (
              <span className="lp-btn-sub">
                Slot {slotLabel}{deviceName ? ` »${deviceName}«` : ''}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            className="lp-btn primary"
            disabled={busy || !webMidiSupported}
            onClick={() => void connect()}
          >
            <span className={`lp-led${busy ? ' busy' : ''}`} aria-hidden="true" />
            {connectLabel}
            {connectHint && <span className="lp-btn-sub">{connectHint}</span>}
          </button>
        )}

        {/* Kept at exactly this accessible name: scripts/capture-guide-shots.mjs
            clicks it by role to get past the landing page before photographing
            every other surface in the app. */}
        <button type="button" className="lp-btn ghost" onClick={onOpenBlank}>
          OPEN WITHOUT CONNECTING
          <span className="lp-btn-sub">no pedal needed · blank preset</span>
        </button>
      </div>

      {status === 'error' && errorMessage && (
        <p className="lp-msg error" role="alert">{errorMessage}</p>
      )}
      {loadError && (
        <p className="lp-msg error" role="alert">
          {loadError}
          <button type="button" onClick={onDismissError} aria-label="Dismiss error">✕</button>
        </p>
      )}
      {!webMidiSupported && (
        <p className="lp-msg">
          Web MIDI is not available in this browser; use Chrome or Edge to connect a device.
          You can still open the editor and export presets.
        </p>
      )}
      {!connected && webMidiSupported && status !== 'error' && (
        <p className="lp-msg">
          Plug the GP-200 into your computer over USB and power it on, then click the button above.
        </p>
      )}
    </div>
  );
}
