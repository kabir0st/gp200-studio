import { useCallback, useEffect, useRef, useState } from 'react';
import type { GP200Preset } from '@/core/types';
import { SysExCodec } from '@/core/SysExCodec';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { getEffectParams } from '@/core/effectParams';
import { AudioMeters } from './AudioMeters';
import { ActionIcon } from './ActionIcon';
import { DeckPop } from './DeckPop';

interface SwitcherUnitProps {
  preset: GP200Preset;
  patchVolume: number;
  patchPan: number;
  patchTempo: number;
  currentSlot: number | null;
  connected: boolean;
  onSaveToActiveSlot?: () => void;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onTempoChange: (bpm: number) => void;
  onOpenFxLoop: () => void;
  onOpenPatchSettings: () => void;
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

const TEMPO_MIN = 40;
const TEMPO_MAX = 250;

interface TempoDraftInputProps {
  value: number;
  disabled: boolean;
  onCommit: (bpm: number) => void;
}

/**
 * Tempo entry that validates on commit instead of on every keystroke.
 *
 * A controlled number input that clamps inside onChange cannot be typed into:
 * clear it, type "1", and 1 clamps up to the 40 floor, so the next keystroke
 * builds on 40 and 120 is unreachable. The draft is therefore a string — the
 * only shape that can hold a half-typed "12" or an empty field — and the clamp
 * happens once, when the value is committed.
 *
 * Commit has to cover unmount, not just blur: DeckPop closes on a document
 * mousedown, so clicking away tears this input down before a blur ever reaches
 * React, and the number the user typed would be dropped. Each commit also sends
 * exactly one SysEx frame, where the old per-keystroke clamp sent one per digit.
 */
function TempoDraftInput({ value, disabled, onCommit }: TempoDraftInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  // The unmount commit fires from a cleanup that must not resubscribe on every
  // keystroke, so it reads the current draft through a ref rather than deps.
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  /** `syncDraft` is false on the unmount path, where setting state is pointless. */
  const flush = useCallback((syncDraft: boolean) => {
    const { draft: text, value: current, onCommit: send } = latest.current;
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      if (syncDraft) setDraft(String(current));
      return;
    }
    const bpm = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(parsed)));
    if (syncDraft) setDraft(String(bpm));
    if (bpm !== current) send(bpm);
  }, []);

  useEffect(() => () => flush(false), [flush]);

  return (
    <input
      ref={inputRef}
      type="number"
      className="dp-num"
      min={TEMPO_MIN}
      max={TEMPO_MAX}
      value={draft}
      disabled={disabled}
      aria-label="Tempo in BPM"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => flush(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          flush(true);
          inputRef.current?.blur();
        }
      }}
    />
  );
}

/** Patch control deck: volume · pan/tempo · live readouts · meters · routing
 *  drawers · save-to-active-slot. The patch name/author editor lives in the top
 *  bar (BoardTopBar), next to the slot readout it belongs with. */
export function SwitcherUnit({
  preset,
  patchVolume,
  patchPan,
  patchTempo,
  currentSlot,
  connected,
  onSaveToActiveSlot,
  onVolumeChange,
  onPanChange,
  onTempoChange,
  onOpenFxLoop,
  onOpenPatchSettings,
}: SwitcherUnitProps) {
  const [openPop, setOpenPop] = useState<'settings' | null>(null);

  let slotLabel: string | null = null;
  if (currentSlot !== null) slotLabel = SysExCodec.slotToLabel(currentSlot);
  const canSave = connected && currentSlot !== null && onSaveToActiveSlot !== undefined;
  const panDisplay = panLabel(patchPan);
  const bars = liveBars(preset);

  let volTitle = 'Connect the device to adjust patch volume';
  if (connected) volTitle = 'Patch volume (live device setting)';
  let settingsTitle = 'Connect the device to adjust (live-only settings)';
  if (connected) settingsTitle = 'Adjust patch pan / tempo';

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
                  min={TEMPO_MIN}
                  max={TEMPO_MAX}
                  step={1}
                  value={patchTempo}
                  disabled={!connected}
                  aria-label="Tempo"
                  onChange={(event) => onTempoChange(Number(event.target.value))}
                />
                <TempoDraftInput
                  value={patchTempo}
                  disabled={!connected}
                  onCommit={onTempoChange}
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
        <button
          type="button"
          className="deck-btn"
          title="Patch settings: expression pedals, CTRL footswitches, bulk apply"
          onClick={onOpenPatchSettings}
        >
          <ActionIcon name="ctrl" />
          <span className="db-label">SETTINGS</span>
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
