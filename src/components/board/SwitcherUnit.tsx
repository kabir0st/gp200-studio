import { useEffect, useRef, useState } from 'react';
import type { GP200Preset } from '@/core/types';
import type { PushProgress } from '@/core/devicePush';
import { SysExCodec } from '@/core/SysExCodec';
import { getEffectName, getSlotModule } from '@/core/effectNames';
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
  onPatchNameChange: (name: string) => void;
  onAuthorChange: (author: string) => void;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onTempoChange: (bpm: number) => void;
  onImportFile: (buffer: Uint8Array, filename: string) => void;
  onExportRequest: () => void;
  onCloseRequest: () => void;
  onOpenFxLoop: () => void;
  onOpenExp: () => void;
  /* device session (the old top status bar, merged into the deck) */
  onConnectRequest: () => void;
  onDisconnect: () => void;
  /** open the slot browser in push mode ("save as" to any slot) */
  onPushRequest: () => void;
  pushProgress: PushProgress | null;
  firmware: string | null;
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
    if (getSlotModule(slot.slotIndex) === 'VOL') {
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

/** Small anchored popover above the deck: click-outside and Escape close it. */
function DeckPop({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="deck-pop" role="group" aria-label={label}>
      {children}
    </div>
  );
}

/** Clean bottom control deck: status · live readouts · audio meters · actions. */
export function SwitcherUnit({
  preset,
  patchVolume,
  patchPan,
  patchTempo,
  currentSlot,
  connected,
  onLoadRequest,
  onSaveToActiveSlot,
  onPatchNameChange,
  onAuthorChange,
  onVolumeChange,
  onPanChange,
  onTempoChange,
  onImportFile,
  onExportRequest,
  onCloseRequest,
  onOpenFxLoop,
  onOpenExp,
  onConnectRequest,
  onDisconnect,
  onPushRequest,
  pushProgress,
  firmware,
}: SwitcherUnitProps) {
  const [openPop, setOpenPop] = useState<'meta' | 'settings' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const canSave = connected && currentSlot !== null && onSaveToActiveSlot !== undefined;
  const panDisplay = patchPan === 0 ? 'C' : patchPan < 0 ? `L${Math.abs(patchPan)}` : `R${patchPan}`;
  const bars = liveBars(preset);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onImportFile(new Uint8Array(ev.target!.result as ArrayBuffer), file.name);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // allow re-importing the same file
  }

  return (
    <div className="deck">
      <div className="deck-status">
        <span className={`deck-dot${connected ? ' on' : ''}`} aria-hidden="true" />
        <span className="deck-slot">{slotLabel ?? '—'}</span>
        <button
          type="button"
          className="deck-name editable"
          title="Edit patch name & author"
          aria-expanded={openPop === 'meta'}
          onClick={() => setOpenPop((p) => (p === 'meta' ? null : 'meta'))}
        >
          {preset.patchName || 'Untitled'}
        </button>
        <span className="deck-conn" title={firmware ? `GP-200 firmware ${firmware}` : undefined}>
          {connected ? `USB-MIDI${firmware ? ` · FW ${firmware}` : ''}` : 'OFFLINE'}
        </span>
        {pushProgress && (
          <span
            className={`deck-sync${pushProgress.phase === 'done' ? ' done' : ''}`}
            role="status"
            aria-live="polite"
          >
            {pushProgress.phase === 'done'
              ? '✓ SENT'
              : `SYNC ${pushProgress.completed}/${pushProgress.total}`}
          </span>
        )}
        {openPop === 'meta' && (
          <DeckPop label="Patch name and author" onClose={() => setOpenPop(null)}>
            <label className="dp-field">
              <span>Patch name</span>
              <input
                value={preset.patchName}
                maxLength={16}
                autoFocus
                onChange={(e) => onPatchNameChange(e.target.value.slice(0, 16))}
                onKeyDown={(e) => e.key === 'Enter' && setOpenPop(null)}
              />
            </label>
            <label className="dp-field">
              <span>Author</span>
              <input
                value={preset.author ?? ''}
                maxLength={16}
                onChange={(e) => onAuthorChange(e.target.value.slice(0, 16))}
                onKeyDown={(e) => e.key === 'Enter' && setOpenPop(null)}
              />
            </label>
          </DeckPop>
        )}
      </div>

      <div className="deck-readouts">
        <button
          type="button"
          className="deck-meta-btn"
          title={connected ? 'Adjust patch volume / pan / tempo' : 'Connect the device to adjust (live-only settings)'}
          aria-expanded={openPop === 'settings'}
          onClick={() => setOpenPop((p) => (p === 'settings' ? null : 'settings'))}
        >
          <span className="deck-meta">VOL <b>{patchVolume}</b></span>
          <span className="deck-meta">PAN <b>{panDisplay}</b></span>
          <span className="deck-meta">TEMPO <b>{patchTempo}</b></span>
        </button>
        {openPop === 'settings' && (
          <DeckPop label="Patch settings" onClose={() => setOpenPop(null)}>
            <label className="dp-field">
              <span>Patch vol <b>{patchVolume}</b></span>
              <input type="range" min={0} max={100} step={1} value={patchVolume} disabled={!connected}
                onChange={(e) => onVolumeChange(Number(e.target.value))} />
            </label>
            <label className="dp-field">
              <span>Patch pan <b>{panDisplay}</b></span>
              <input type="range" min={-50} max={50} step={1} value={patchPan} disabled={!connected}
                onChange={(e) => onPanChange(Number(e.target.value))} />
            </label>
            <label className="dp-field">
              <span>Tempo <b>{patchTempo} BPM</b></span>
              <input type="range" min={40} max={250} step={1} value={patchTempo} disabled={!connected}
                onChange={(e) => onTempoChange(Number(e.target.value))} />
            </label>
            {!connected && <p className="dp-note">Live-only device settings — connect to adjust.</p>}
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
        <input
          ref={fileInputRef}
          type="file"
          accept=".prst,.hlx"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFilePick}
        />
        <button type="button" className="deck-btn" onClick={() => fileInputRef.current?.click()}>
          IMPORT
        </button>
        <button type="button" className="deck-btn" onClick={onExportRequest}>
          EXPORT
        </button>
        <button type="button" className="deck-btn" onClick={onOpenFxLoop}>
          FX LOOP
        </button>
        <button type="button" className="deck-btn" onClick={onOpenExp}>
          EXP
        </button>
        {connected ? (
          <>
            <button type="button" className="deck-btn" onClick={onLoadRequest}>
              LOAD
            </button>
            <button
              type="button"
              className="deck-btn primary"
              disabled={!canSave}
              onClick={onSaveToActiveSlot}
            >
              {slotLabel ? `SAVE TO ${slotLabel}` : 'SAVE'}
            </button>
            <button type="button" className="deck-btn" title="Save to another slot" onClick={onPushRequest}>
              SAVE AS
            </button>
            <button
              type="button"
              className="deck-btn quiet"
              title="Disconnect device"
              aria-label="Disconnect device"
              onClick={onDisconnect}
            >
              ✕
            </button>
          </>
        ) : (
          <button type="button" className="deck-btn primary" onClick={onConnectRequest}>
            CONNECT GP-200
          </button>
        )}
        <button type="button" className="deck-btn quiet" title="Close preset" onClick={onCloseRequest}>
          CLOSE
        </button>
      </div>
    </div>
  );
}
