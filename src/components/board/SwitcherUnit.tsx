import { useEffect, useRef, useState } from 'react';
import type { GP200Preset } from '@/core/types';
import { SysExCodec } from '@/core/SysExCodec';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { getEffectParams } from '@/core/effectParams';
import { AudioMeters } from './AudioMeters';
import { ActionIcon } from './ActionIcon';

interface SwitcherUnitProps {
  preset: GP200Preset;
  patchVolume: number;
  patchPan: number;
  patchTempo: number;
  currentSlot: number | null;
  connected: boolean;
  onSaveToActiveSlot?: () => void;
  onPatchNameChange: (name: string) => void;
  onAuthorChange: (author: string) => void;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onTempoChange: (bpm: number) => void;
  onOpenFxLoop: () => void;
  onOpenExp: () => void;
  onOpenCtrl: () => void;
}

interface LiveBar {
  key: string;
  label: string;
  /** 0..1 */
  pct: number;
  value: string;
}

/**
 * Live treadle readouts: any pedal with a "Position" param (Whammy, wahs,
 * driven by the hardware expression pedal) plus the VOL block's volume.
 * These move in real time because hardware knob/expression messages already
 * mirror into preset state.
 */
function liveBars(preset: GP200Preset): LiveBar[] {
  const bars: LiveBar[] = [];
  for (const slot of preset.effects) {
    const defs = getEffectParams(slot.effectId);
    const pos = defs.find((def) => def.type === 'knob' && def.name === 'Position');
    if (pos && pos.type === 'knob') {
      const value = slot.params[pos.idx] ?? pos.default;
      let pct = 0;
      if (pos.max > pos.min) pct = (value - pos.min) / (pos.max - pos.min);
      bars.push({
        key: `pos-${slot.slotIndex}`,
        label: getEffectName(slot.effectId),
        pct,
        value: `${Math.round(value)}`,
      });
    }
    if (getSlotModule(slot.slotIndex) === 'VOL') {
      const vol = defs.find((def) => def.type === 'knob' && def.name === 'Volume');
      if (vol && vol.type === 'knob') {
        const value = slot.params[vol.idx] ?? vol.default;
        let pct = 0;
        if (vol.max > vol.min) pct = (value - vol.min) / (vol.max - vol.min);
        bars.push({
          key: `vol-${slot.slotIndex}`,
          label: 'VOL PEDAL',
          pct,
          value: `${Math.round(value)}`,
        });
      }
    }
  }
  return bars;
}

function panLabel(pan: number): string {
  if (pan === 0) return 'C';
  if (pan < 0) return `L${Math.abs(pan)}`;
  return `R${pan}`;
}

interface DeckPopProps {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Wider variant for popovers with side-by-side controls (sliders + buttons). */
  wide?: boolean;
}

/** Small anchored popover above the deck: click-outside and Escape close it. */
function DeckPop({ label, onClose, children, wide }: DeckPopProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  let popClass = 'deck-pop';
  if (wide) popClass = 'deck-pop wide';
  return (
    <div ref={ref} className={popClass} role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Patch control deck: name/author · volume · pan/tempo · live readouts ·
 *  meters · routing drawers · save-to-active-slot. */
export function SwitcherUnit({
  preset,
  patchVolume,
  patchPan,
  patchTempo,
  currentSlot,
  connected,
  onSaveToActiveSlot,
  onPatchNameChange,
  onAuthorChange,
  onVolumeChange,
  onPanChange,
  onTempoChange,
  onOpenFxLoop,
  onOpenExp,
  onOpenCtrl,
}: SwitcherUnitProps) {
  const [openPop, setOpenPop] = useState<'meta' | 'settings' | null>(null);

  let slotLabel: string | null = null;
  if (currentSlot !== null) slotLabel = SysExCodec.slotToLabel(currentSlot);
  const canSave = connected && currentSlot !== null && onSaveToActiveSlot !== undefined;
  const panDisplay = panLabel(patchPan);
  const bars = liveBars(preset);

  let volTitle = 'Connect the device to adjust patch volume';
  if (connected) volTitle = 'Patch volume (live device setting)';
  let settingsTitle = 'Connect the device to adjust (live-only settings)';
  if (connected) settingsTitle = 'Adjust patch pan / tempo';

  function toggleMeta() {
    setOpenPop((prev) => {
      if (prev === 'meta') return null;
      return 'meta';
    });
  }

  function toggleSettings() {
    setOpenPop((prev) => {
      if (prev === 'settings') return null;
      return 'settings';
    });
  }

  let saveLabel = 'SAVE';
  if (slotLabel) saveLabel = `SAVE TO ${slotLabel}`;

  return (
    <div className="deck">
      <div className="deck-status">
        <button
          type="button"
          className="deck-name editable"
          title="Edit patch name & author"
          aria-expanded={openPop === 'meta'}
          onClick={toggleMeta}
        >
          {preset.patchName || 'Untitled'}
        </button>
        {openPop === 'meta' && (
          <DeckPop label="Patch name and author" onClose={() => setOpenPop(null)}>
            <label className="dp-field">
              <span>
                Patch name <b>{`${preset.patchName.length}/16`}</b>
              </span>
              <input
                value={preset.patchName}
                maxLength={16}
                autoFocus
                onChange={(event) => onPatchNameChange(event.target.value.slice(0, 16))}
                onKeyDown={(event) => event.key === 'Enter' && setOpenPop(null)}
              />
            </label>
            <label className="dp-field">
              <span>
                Author <b>{`${(preset.author ?? '').length}/16`}</b>
              </span>
              <input
                value={preset.author ?? ''}
                maxLength={16}
                onChange={(event) => onAuthorChange(event.target.value.slice(0, 16))}
                onKeyDown={(event) => event.key === 'Enter' && setOpenPop(null)}
              />
            </label>
            <p className="dp-note">Shown on the device display. 16 characters max.</p>
          </DeckPop>
        )}
      </div>

      <div className="deck-readouts">
        <div className="deck-vol" title={volTitle}>
          <span className="deck-vol-lbl">VOL</span>
          <input
            type="range"
            className="deck-vol-slider"
            min={0}
            max={100}
            step={1}
            value={patchVolume}
            disabled={!connected}
            aria-label="Patch volume"
            onChange={(event) => onVolumeChange(Number(event.target.value))}
          />
          <b className="deck-vol-val">{patchVolume}</b>
        </div>

        <button
          type="button"
          className="deck-meta-btn"
          title={settingsTitle}
          aria-expanded={openPop === 'settings'}
          onClick={toggleSettings}
        >
          <span className="deck-meta">PAN <b>{panDisplay}</b></span>
          <span className="deck-meta">TEMPO <b>{patchTempo}</b></span>
        </button>
        {openPop === 'settings' && (
          <DeckPop label="Patch settings" wide onClose={() => setOpenPop(null)}>
            <div className="dp-field">
              <span>Patch pan <b>{panDisplay}</b></span>
              <div className="dp-row">
                <input
                  type="range"
                  min={-50}
                  max={50}
                  step={1}
                  value={patchPan}
                  disabled={!connected}
                  aria-label="Patch pan"
                  onChange={(event) => onPanChange(Number(event.target.value))}
                />
                <button
                  type="button"
                  className="dp-btn"
                  disabled={!connected || patchPan === 0}
                  onClick={() => onPanChange(0)}
                >
                  CENTER
                </button>
              </div>
              <div className="dp-scale" aria-hidden="true">
                <span>L50</span>
                <span>C</span>
                <span>R50</span>
              </div>
            </div>
            <div className="dp-field">
              <span>Tempo <b>{patchTempo} BPM</b></span>
              <div className="dp-row">
                <input
                  type="range"
                  min={40}
                  max={250}
                  step={1}
                  value={patchTempo}
                  disabled={!connected}
                  aria-label="Tempo"
                  onChange={(event) => onTempoChange(Number(event.target.value))}
                />
                <input
                  type="number"
                  className="dp-num"
                  min={40}
                  max={250}
                  value={patchTempo}
                  disabled={!connected}
                  aria-label="Tempo in BPM"
                  onChange={(event) => {
                    const bpm = Math.max(40, Math.min(250, Number(event.target.value)));
                    onTempoChange(bpm);
                  }}
                />
              </div>
            </div>
            {!connected && (
              <p className="dp-note">Live-only device settings. Connect to adjust.</p>
            )}
          </DeckPop>
        )}
        {bars.map((bar) => (
          <span key={bar.key} className="deck-live" title={`${bar.label}: ${bar.value}`}>
            <span className="dl-lbl">{bar.label}</span>
            <span className="dl-track"><span className="dl-fill" style={{ width: `${bar.pct * 100}%` }} /></span>
            <b className="dl-val">{bar.value}</b>
          </span>
        ))}
      </div>

      <AudioMeters />

      <div className="deck-actions">
        <button type="button" className="deck-btn" onClick={onOpenFxLoop}>
          <ActionIcon name="fxloop" />
          <span className="db-label">FX LOOP</span>
        </button>
        <button type="button" className="deck-btn" onClick={onOpenExp}>
          <ActionIcon name="exp" />
          <span className="db-label">EXP</span>
        </button>
        <button
          type="button"
          className="deck-btn"
          title="Assign CTRL footswitches to effect blocks"
          onClick={onOpenCtrl}
        >
          <ActionIcon name="ctrl" />
          <span className="db-label">CTRL</span>
        </button>
        {connected && (
          <button
            type="button"
            className="deck-btn primary"
            disabled={!canSave}
            onClick={onSaveToActiveSlot}
          >
            <ActionIcon name="save" />
            <span className="db-label">{saveLabel}</span>
          </button>
        )}
      </div>
    </div>
  );
}
