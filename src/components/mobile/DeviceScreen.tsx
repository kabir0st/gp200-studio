import { useState } from 'react';
import { SysExCodec } from '@/core/SysExCodec';
import { tunerShow } from '@/core/ccControl';
import type { CCCommand } from '@/core/ccControl';
import { AudioMeters } from '@/components/board/AudioMeters';
import { RemotePanel } from '@/components/board/RemotePanel';

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
  onOpenExp: () => void;
  onOpenCtrl: () => void;
  onOpenGuide: () => void;
  onCloseRequest: () => void;
  sendCC: (command: CCCommand | CCCommand[]) => void;
}

/** Labelled full-width slider, the same control ParamSlider uses. */
function LevelRow({
  label,
  value,
  min,
  max,
  readout,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  readout: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="m-param">
      <div className="m-param-head">
        <span className="m-param-name">{label}</span>
        <span className="m-param-value">{readout}</span>
      </div>
      <div className="m-param-control">
        <input
          type="range"
          className="m-slider"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
    </div>
  );
}

/**
 * Session + patch-global tab. Collects everything the desktop splits between
 * the top bar's right cluster and the floating deck, which on a phone were a
 * wall of ~10px buttons competing for the same strip.
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
  onOpenExp,
  onOpenCtrl,
  onOpenGuide,
  onCloseRequest,
  sendCC,
}: DeviceScreenProps) {
  const slotLabel = currentSlot === null ? null : SysExCodec.slotToLabel(currentSlot);
  const panReadout = patchPan === 0 ? 'C' : patchPan < 0 ? `L${-patchPan}` : `R${patchPan}`;
  // Device tuner toggle (CC58), mirrors BoardTopBar's local best-effort state:
  // the pedal doesn't report tuner visibility, so a front-panel close can
  // drift this until the next tap resyncs it.
  const [tunerOpen, setTunerOpen] = useState(false);

  function handleToggleTuner() {
    const next = !tunerOpen;
    setTunerOpen(next);
    sendCC(tunerShow(next));
  }

  return (
    <div className="m-screen">
      <section className="m-section">
        <h2 className="m-screen-title">DEVICE</h2>
        <div className="m-status">
          <span className={`m-dot${connected ? ' on' : ''}`} aria-hidden="true" />
          <span>{connected ? 'USB-MIDI CONNECTED' : 'NOT CONNECTED'}</span>
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

      <section className="m-section">
        <h3 className="m-section-title">PATCH</h3>
        <LevelRow
          label="VOLUME"
          value={patchVolume}
          min={0}
          max={100}
          readout={String(patchVolume)}
          disabled={!connected}
          onChange={onVolumeChange}
        />
        <LevelRow
          label="PAN"
          value={patchPan}
          min={-50}
          max={50}
          readout={panReadout}
          disabled={!connected}
          onChange={onPanChange}
        />
        <LevelRow
          label="TEMPO"
          value={patchTempo}
          min={40}
          max={250}
          readout={`${patchTempo} BPM`}
          disabled={!connected}
          onChange={onTempoChange}
        />
      </section>

      <section className="m-section">
        <h3 className="m-section-title">ROUTING</h3>
        <div className="m-btn-grid">
          <button type="button" className="m-btn" onClick={onOpenFxLoop}>
            FX LOOP
          </button>
          <button type="button" className="m-btn" onClick={onOpenExp}>
            EXP PEDAL
          </button>
          <button type="button" className="m-btn wide" onClick={onOpenCtrl}>
            CTRL FOOTSWITCHES
          </button>
        </div>
      </section>

      <section className="m-section">
        <h3 className="m-section-title">MIDI REMOTE</h3>
        <RemotePanel connected={connected} sendCC={sendCC} />
      </section>

      <section className="m-section">
        <h3 className="m-section-title">AUDIO</h3>
        <AudioMeters />
      </section>

      <section className="m-section">
        <div className="m-btn-grid">
          <button type="button" className="m-btn ghost" onClick={onOpenGuide}>
            GUIDE
          </button>
          <button type="button" className="m-btn ghost" onClick={onCloseRequest}>
            CLOSE PATCH
          </button>
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
