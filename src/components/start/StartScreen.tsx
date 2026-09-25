import type { CSSProperties } from 'react';
import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';
import { SysExCodec } from '@/core/SysExCodec';
import { SLOT_MODULES } from '@/core/effectNames';
import { getBodySpec } from '@/components/board/boardPalette';
import { Logo } from '@/components/Logo';
import { Credits } from '@/components/Credits';
import { useConnectCta } from '@/components/landing/useConnectCta';
import './start.css';

interface StartScreenProps {
  midiDevice: UseMidiDeviceReturn;
  /** open the editor with a blank INIT preset */
  onOpenBlank: () => void;
  /** open the editor with the connected device's current preset */
  onOpenCurrent: () => void;
  loadError: string | null;
  onDismissError: () => void;
}

const FEATURES: string[] = [
  'Multi-layer loop station: stack unlimited loops over USB audio, hands-free from the pedal',
  'Visual pedalboard editor: drag to reorder, tweak every knob',
  'Assign EXP pedals, CTRL footswitches, and the FX loop',
  'Live USB-MIDI sync with your GP-200 (Chrome / Edge)',
  'Import & export .prst, manage all 256 device patches',
];

/**
 * What `/` serves: the app's front door, and nothing else.
 *
 * One stage-styled panel with two actions — connect the GP-200, or open the
 * editor on a blank preset — so someone who already knows the app is one
 * click from the board. The long-form tour of the product lives at `/home`
 * (Landing.tsx), linked from here for anyone who arrived without knowing.
 *
 * Unlike the tour, this follows the stage theme (light or dark), because it is
 * the room the board is about to open in. It is prerendered from a
 * disconnected stub (src/prerender/entry-server.tsx), so it must read
 * completely with JavaScript off and touch no browser global during render.
 *
 * The connect label and flags come from useConnectCta, the same state machine
 * the tour's buttons use, so the two front pages describe a handshake alike.
 */
export function StartScreen({
  midiDevice,
  onOpenBlank,
  onOpenCurrent,
  loadError,
  onDismissError,
}: StartScreenProps) {
  const { status, errorMessage, currentSlot, connect } = midiDevice;
  const {
    busy,
    connected,
    webMidiSupported,
    label: connectLabel,
    hint: connectHint,
  } = useConnectCta(midiDevice);

  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const deviceName = currentSlot !== null ? midiDevice.presetNames[currentSlot] : null;

  return (
    <div className="start-view">
      <div className="start-panel">
        <div className="start-chips" aria-hidden="true">
          {SLOT_MODULES.map((mod) => {
            const spec = getBodySpec(mod);
            const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
            return (
              <span key={mod} className="start-chip" style={vars}>
                {mod}
              </span>
            );
          })}
        </div>

        <div className="start-logo">
          <Logo size={72} />
        </div>
        <h1 className="start-title">GP200 Studio</h1>
        <p className="start-sub">Valeton GP-200 pedalboard editor &amp; loop station</p>

        <div className="start-actions">
          {connected ? (
            <button type="button" className="start-btn primary" onClick={onOpenCurrent}>
              <span className="start-led on" aria-hidden="true" />
              OPEN CURRENT PRESET
              {slotLabel && (
                <span className="start-btn-sub">
                  Slot {slotLabel}{deviceName ? ` »${deviceName}«` : ''}
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              className="start-btn primary"
              disabled={busy || !webMidiSupported}
              onClick={() => void connect()}
            >
              <span className={`start-led${busy ? ' busy' : ''}`} aria-hidden="true" />
              {connectLabel}
              {connectHint && <span className="start-btn-sub">{connectHint}</span>}
            </button>
          )}
        </div>

        {status === 'error' && errorMessage && (
          <p className="start-msg error" role="alert">{errorMessage}</p>
        )}
        {loadError && (
          <p className="start-msg error" role="alert">
            {loadError}
            <button type="button" onClick={onDismissError} aria-label="Dismiss error">✕</button>
          </p>
        )}
        {!webMidiSupported && (
          <p className="start-msg">
            Web MIDI is not available in this browser; use Chrome or Edge to connect a device.
            You can still open the editor and export presets.
          </p>
        )}
        {!connected && webMidiSupported && status !== 'error' && (
          <p className="start-msg">
            Plug the GP-200 into your computer over USB and power it on, then click the button above.
          </p>
        )}

        {/* Kept at exactly this accessible name: scripts/capture-guide-shots.mjs
            clicks it by role to get past this page before photographing every
            other surface in the app. */}
        <button type="button" className="start-btn ghost" onClick={onOpenBlank}>
          OPEN WITHOUT CONNECTING
          <span className="start-btn-sub">no pedal needed · blank preset</span>
        </button>

        <ul className="start-features">
          {FEATURES.map((feature) => (
            <li key={feature} className="start-feature">
              {feature}
            </li>
          ))}
        </ul>

        {/* Real anchors, not buttons: this page is prerendered, and these are
            its crawlable edges into the tour and the guide. */}
        <p className="start-links">
          <a href="/home">What is GP200 Studio? →</a>
          <a href="/guide">Read the guide →</a>
        </p>

        <Credits className="start-credits" />
      </div>
    </div>
  );
}
