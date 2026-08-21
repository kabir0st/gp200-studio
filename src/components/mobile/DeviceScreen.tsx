import { useState } from 'react';
import { SysExCodec } from '@/core/SysExCodec';
import { tunerShow } from '@/core/ccControl';
import type { CCCommand } from '@/core/ccControl';
import type { KnobParam } from '@/core/effectParams';
import { COFFEE_URL } from '@/components/Credits';
import { AudioMeters } from '@/components/board/AudioMeters';
import { RemotePanel } from '@/components/board/RemotePanel';
import { DeviceStatePanel } from '@/components/board/DeviceStatePanel';
import type { DeviceStateDump } from '@/core/SysExCodec';
import { MobileKnob } from './MobileKnob';
import { FocusRail } from './FocusRail';
import { MobileRack } from './MobileRack';

interface DeviceScreenProps {
  connected: boolean;
  firmware: string | null;
  currentSlot: number | null;
  patchVolume: number;
  patchPan: number;
  patchTempo: number;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onTempoChange: (bpm: number) => void;
  onConnectRequest: () => void;
  onDisconnect: () => void;
  onLoadRequest: () => void;
  onPushRequest: () => void;
  onSaveToActiveSlot?: () => void;
  onOpenFxLoop: () => void;
  onOpenPatchSettings: () => void;
  onOpenGuide: () => void;
  onCloseRequest: () => void;
  sendCC: (command: CCCommand | CCCommand[]) => void;
  deviceState: DeviceStateDump | null;
}

/**
 * The three patch-global levels, described the way an effect's params are so
 * they can wear the same knob.
 *
 * `idx` is a local identifier here, not a slot in the device's 15-float param
 * array — nothing sends these by index, and the rail only needs to tell one
 * knob from another.
 */
const LEVELS = [
  { type: 'knob', name: 'VOLUME', idx: 0, min: 0, max: 100, step: 1, default: 80 },
  { type: 'knob', name: 'PAN', idx: 1, min: -50, max: 50, step: 1, default: 0 },
  { type: 'knob', name: 'TEMPO', idx: 2, min: 40, max: 250, step: 1, default: 120 },
] as const satisfies readonly KnobParam[];

/**
 * Session + patch-global tab: the desk the pedal is plugged into.
 *
 * Collects everything the desktop splits between the top bar's right cluster
 * and the floating deck, which on a phone were a wall of ~10px buttons
 * competing for one strip. The borrowed panels (remote, state dump, meters) are
 * reused whole and mounted in racks rather than restyled.
 */
export function DeviceScreen({
  connected,
  firmware,
  currentSlot,
  patchVolume,
  patchPan,
  patchTempo,
  onVolumeChange,
  onPanChange,
  onTempoChange,
  onConnectRequest,
  onDisconnect,
  onLoadRequest,
  onPushRequest,
  onSaveToActiveSlot,
  onOpenFxLoop,
  onOpenPatchSettings,
  onOpenGuide,
  onCloseRequest,
  sendCC,
  deviceState,
}: DeviceScreenProps) {
  const slotLabel = currentSlot === null ? null : SysExCodec.slotToLabel(currentSlot);
  // Device tuner toggle (CC58), mirrors BoardTopBar's local best-effort state:
  // the pedal doesn't report tuner visibility, so a front-panel close can
  // drift this until the next tap resyncs it.
  const [tunerOpen, setTunerOpen] = useState(false);
  /** which level knob the rail is pointed at */
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const values = [patchVolume, patchPan, patchTempo];
  const setters = [onVolumeChange, onPanChange, onTempoChange];
  const focus = focusIdx === null ? null : LEVELS[focusIdx];

  function handleToggleTuner() {
    const next = !tunerOpen;
    setTunerOpen(next);
    sendCC(tunerShow(next));
  }

  return (
    <div className="m-screen">
      {/* the front panel: what is plugged in, and what you can do about it */}
      <section className="m-panel">
        <div className="m-panel-head">
          <span className="m-panel-jack" aria-hidden="true" />
          <span className={`m-dot${connected ? ' on' : ''}`} aria-hidden="true" />
          <span className="m-panel-status">
            {connected ? 'USB-MIDI CONNECTED' : 'NOT CONNECTED'}
          </span>
          {firmware && <span className="m-status-fw">FW {firmware}</span>}
        </div>
        <div className="m-btn-grid">
          {connected ? (
            <>
              <button type="button" className="m-btn" onClick={onDisconnect}>
                DISCONNECT
              </button>
              <button
                type="button"
                className={tunerOpen ? 'm-btn tuner-active' : 'm-btn'}
                onClick={handleToggleTuner}
              >
                TUNER
              </button>
              <button type="button" className="m-btn" onClick={onLoadRequest}>
                LOAD
              </button>
              <button type="button" className="m-btn" onClick={onPushRequest}>
                SAVE AS
              </button>
            </>
          ) : (
            <button type="button" className="m-btn primary wide" onClick={onConnectRequest}>
              CONNECT GP-200
            </button>
          )}
        </div>
      </section>

      {/* the patch's own levels, on a chassis strip rather than in a form */}
      <section className="m-chassis">
        <h3 className="m-chassis-title">PATCH</h3>
        <div className="m-face chassis">
          {LEVELS.map((param, i) => (
            <MobileKnob
              key={param.name}
              param={param}
              value={values[i]}
              onChange={setters[i]}
              knobStyle="cream"
              ink="var(--chrome-text)"
              pedalName="Patch"
              onFocus={setFocusIdx}
              // these three are device-session settings; the board's deck gates
              // them on a connection the same way
              disabled={!connected}
            />
          ))}
        </div>
        <FocusRail
          param={focus}
          value={focus ? values[focus.idx] : 0}
          onChange={(idx, value) => setters[idx](value)}
        />
      </section>

      <section className="m-section">
        <h3 className="m-section-title">ROUTING</h3>
        <div className="m-btn-grid">
          <button type="button" className="m-btn" onClick={onOpenFxLoop}>
            FX LOOP
          </button>
          <button type="button" className="m-btn" onClick={onOpenPatchSettings}>
            PATCH SETTINGS
          </button>
        </div>
      </section>

      <MobileRack title="MIDI Remote">
        <RemotePanel connected={connected} sendCC={sendCC} />
      </MobileRack>

      <MobileRack title="Device State">
        <DeviceStatePanel connected={connected} state={deviceState} />
      </MobileRack>

      <MobileRack title="Audio">
        <AudioMeters />
      </MobileRack>

      <section className="m-section">
        <div className="m-btn-grid">
          <button type="button" className="m-btn ghost" onClick={onOpenGuide}>
            GUIDE
          </button>
          <button type="button" className="m-btn ghost" onClick={onCloseRequest}>
            CLOSE PATCH
          </button>
          <a
            className="m-btn ghost wide"
            href={COFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            ☕ BUY ME A COFFEE
          </a>
        </div>
      </section>

      {onSaveToActiveSlot && slotLabel && (
        <div className="m-sticky-foot">
          <button type="button" className="m-btn primary wide" onClick={onSaveToActiveSlot}>
            SAVE TO {slotLabel}
          </button>
        </div>
      )}
    </div>
  );
}
