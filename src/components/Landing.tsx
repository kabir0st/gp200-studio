import { useEffect, useState, type CSSProperties } from 'react';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import { SysExCodec } from '@/core/SysExCodec';
import { SLOT_MODULES } from '@/core/effectNames';
import { getBodySpec } from '@/components/board/boardPalette';
import { Logo } from '@/components/Logo';
import { Credits } from '@/components/Credits';

interface LandingProps {
  midiDevice: UseMidiDeviceReturn;
  /** open the editor with a blank INIT preset */
  onOpenBlank: () => void;
  /** open the editor with the connected device's current preset */
  onOpenCurrent: () => void;
  /** open the full-page guide */
  onOpenGuide: () => void;
  loadError: string | null;
  onDismissError: () => void;
}

const FEATURES: string[] = [
  'Visual pedalboard editor — drag to reorder, tweak every knob',
  'Assign EXP pedals, CTRL footswitches, and the FX loop',
  'Live USB-MIDI sync with your GP-200 (Chrome / Edge)',
  'Import & export .prst, manage all 256 device patches',
];

/**
 * Stage-styled landing: two actions only — connect the GP-200, or open the
 * editor with a blank preset. No file prompt; import lives in the board deck.
 */
export function Landing({ midiDevice, onOpenBlank, onOpenCurrent, onOpenGuide, loadError, onDismissError }: LandingProps) {
  const { status, handshakeStep, errorMessage, currentSlot, connect } = midiDevice;
  const [webMidiSupported, setWebMidiSupported] = useState(true);

  useEffect(() => {
    setWebMidiSupported('requestMIDIAccess' in navigator);
  }, []);

  const busy = status === 'connecting' || status === 'handshaking';
  const connected = status === 'connected';
  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const deviceName = currentSlot !== null ? midiDevice.presetNames[currentSlot] : null;

  return (
    <div className="landing-view">
      <div className="landing-panel">
        <div className="landing-chips" aria-hidden="true">
          {SLOT_MODULES.map((mod) => {
            const spec = getBodySpec(mod);
            const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
            return (
              <span key={mod} className="landing-chip" style={vars}>
                {mod}
              </span>
            );
          })}
        </div>

        <div className="landing-logo">
          <Logo size={72} />
        </div>
        <h1 className="landing-title">GP200 Studio</h1>
        <p className="landing-sub">Valeton GP-200 pedalboard editor</p>

        <div className="landing-actions">
          {connected ? (
            <button type="button" className="landing-btn primary" onClick={onOpenCurrent}>
              <span className="landing-led on" aria-hidden="true" />
              OPEN CURRENT PRESET
              {slotLabel && (
                <span className="landing-btn-sub">
                  Slot {slotLabel}{deviceName ? ` »${deviceName}«` : ''}
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="landing-btn primary"
              disabled={busy || !webMidiSupported}
              onClick={() => void connect()}
            >
              <span className={`landing-led${busy ? ' busy' : ''}`} aria-hidden="true" />
              {busy ? (handshakeStep ?? 'CONNECTING…') : status === 'error' ? 'RETRY CONNECT' : 'CONNECT YOUR GP-200'}
            </button>
          )}

          <button type="button" className="landing-btn" onClick={onOpenBlank}>
            OPEN EDITOR
            <span className="landing-btn-sub">start from a blank preset</span>
          </button>
        </div>

        <ul className="landing-features">
          {FEATURES.map((feature) => (
            <li key={feature} className="landing-feature">
              {feature}
            </li>
          ))}
        </ul>

        <button type="button" className="landing-guide-link" onClick={onOpenGuide}>
          Read the guide →
        </button>

        {status === 'error' && errorMessage && (
          <p className="landing-msg error" role="alert">{errorMessage}</p>
        )}
        {loadError && (
          <p className="landing-msg error" role="alert">
            {loadError}
            <button type="button" onClick={onDismissError} aria-label="Dismiss error">✕</button>
          </p>
        )}
        {!webMidiSupported && (
          <p className="landing-msg">
            Web MIDI is not available in this browser — use Chrome or Edge to connect a device.
            You can still open the editor and export presets.
          </p>
        )}
        {!connected && webMidiSupported && status !== 'error' && (
          <p className="landing-msg">Connect over USB, or open the editor and import a file from the deck.</p>
        )}

        <Credits className="landing-credits" />
      </div>
    </div>
  );
}
