import type { GP200Preset } from '@/core/types';
import { SysExCodec } from '@/core/SysExCodec';
import { getEffectName, getModuleName } from '@/core/effectNames';
import { getEffectParams } from '@/core/effectParams';
import { AudioMeters } from './AudioMeters';

interface SwitcherUnitProps {
  preset: GP200Preset;
  patchVolume: number;
  patchPan: number;
  patchTempo: number;
  currentSlot: number | null;
  connected: boolean;
  onLoadRequest: () => void;
  onSaveToActiveSlot?: () => void;
}

interface LiveBar {
  key: string;
  label: string;
  /** 0..1 */
  pct: number;
  value: string;
}

/**
 * Live treadle readouts: any pedal with a "Position" param (Whammy, wahs —
 * driven by the hardware expression pedal) plus the VOL block's volume.
 * These move in real time because hardware knob/expression messages already
 * mirror into preset state.
 */
function liveBars(preset: GP200Preset): LiveBar[] {
  const bars: LiveBar[] = [];
  for (const slot of preset.effects) {
    const defs = getEffectParams(slot.effectId);
    const pos = defs.find((d) => d.type === 'knob' && d.name === 'Position');
    if (pos && pos.type === 'knob') {
      const v = slot.params[pos.idx] ?? pos.default;
      bars.push({
        key: `pos-${slot.slotIndex}`,
        label: getEffectName(slot.effectId),
        pct: pos.max > pos.min ? (v - pos.min) / (pos.max - pos.min) : 0,
        value: `${Math.round(v)}`,
      });
    }
    if (getModuleName(slot.effectId) === 'VOL') {
      const vol = defs.find((d) => d.type === 'knob' && d.name === 'Volume');
      if (vol && vol.type === 'knob') {
        const v = slot.params[vol.idx] ?? vol.default;
        bars.push({
          key: `vol-${slot.slotIndex}`,
          label: 'VOL PEDAL',
          pct: vol.max > vol.min ? (v - vol.min) / (vol.max - vol.min) : 0,
          value: `${Math.round(v)}`,
        });
      }
    }
  }
  return bars;
}

/** Clean bottom control deck: status · live readouts · audio meters · LOAD/SAVE. */
export function SwitcherUnit({
  preset,
  patchVolume,
  patchPan,
  patchTempo,
  currentSlot,
  connected,
  onLoadRequest,
  onSaveToActiveSlot,
}: SwitcherUnitProps) {
  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const canSave = connected && currentSlot !== null && onSaveToActiveSlot !== undefined;
  const panDisplay = patchPan === 0 ? 'C' : patchPan < 0 ? `L${Math.abs(patchPan)}` : `R${patchPan}`;
  const bars = liveBars(preset);

  return (
    <div className="deck">
      <div className="deck-status">
        <span className={`deck-dot${connected ? ' on' : ''}`} aria-hidden="true" />
        <span className="deck-slot">{slotLabel ?? '—'}</span>
        <span className="deck-name">{preset.patchName || 'Untitled'}</span>
        <span className="deck-conn">{connected ? 'USB-MIDI' : 'OFFLINE'}</span>
      </div>

      <div className="deck-readouts">
        <span className="deck-meta">VOL <b>{patchVolume}</b></span>
        <span className="deck-meta">PAN <b>{panDisplay}</b></span>
        <span className="deck-meta">TEMPO <b>{patchTempo}</b></span>
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
        <button type="button" className="deck-btn" onClick={onLoadRequest}>
          LOAD
        </button>
        <button
          type="button"
          className="deck-btn primary"
          disabled={!canSave}
          title={canSave ? undefined : 'Connect the device to save'}
          onClick={onSaveToActiveSlot}
        >
          {slotLabel ? `SAVE TO ${slotLabel}` : 'SAVE'}
        </button>
      </div>
    </div>
  );
}
