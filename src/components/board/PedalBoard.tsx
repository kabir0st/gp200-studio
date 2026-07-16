import { useState, type DragEvent } from 'react';
import type { GP200Preset, EffectSlot } from '@/core/types';
import { getModuleName } from '@/core/effectNames';
import { lookupPedalArt, usePedalManifest } from './pedalManifest';
import { Pedal } from './Pedal';
import { ChainStrip } from './ChainStrip';
import { InfoBar } from './InfoBar';
import { CableLayer } from './CableLayer';
import { SwitcherUnit } from './SwitcherUnit';
import './board.css';

export interface PedalBoardProps {
  preset: GP200Preset;
  onToggle: (slotIndex: number, currentlyEnabled: boolean) => void;
  onChangeEffect: (slotIndex: number, effectId: number) => void;
  onParamChange: (slotIndex: number, effectId: number, paramIndex: number, value: number) => void;
  /** reorder by array position (drag drop + keyboard grip) */
  onMove: (fromIndex: number, toIndex: number) => void;
  dragIndex: number | null;
  dragOverIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (e: DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  patchVolume: number;
  patchPan: number;
  patchTempo: number;
  currentSlot: number | null;
  connected: boolean;
  onLoadRequest: () => void;
  onSaveToActiveSlot?: () => void;
}

/**
 * The skeuomorphic board view: chain strip → info bar → stage (cables +
 * two pedal rows + switcher). Chain order = effects array order; the first
 * 6 pedals sit on the front row, the rest on the back row (rows are purely
 * visual — the signal path is the array order, made legible by the cables).
 */
export function PedalBoard({
  preset,
  onToggle,
  onChangeEffect,
  onParamChange,
  onMove,
  dragIndex,
  dragOverIndex,
  onDragStart,
  onDragOver,
  onDrop,
  patchVolume,
  patchPan,
  patchTempo,
  currentSlot,
  connected,
  onLoadRequest,
  onSaveToActiveSlot,
}: PedalBoardProps) {
  const artIndex = usePedalManifest();

  // hover inspects, ⓘ pins; both keyed by slotIndex (stable across reorders)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [pinnedSlot, setPinnedSlot] = useState<number | null>(null);

  const inspectKey = pinnedSlot ?? hoverSlot;
  const inspected = inspectKey !== null
    ? preset.effects.find((e) => e.slotIndex === inspectKey) ?? null
    : null;

  const modules = preset.effects.map((e) => getModuleName(e.effectId));
  const orderKey = preset.effects.map((e) => `${e.slotIndex}:${e.effectId}`).join(',');

  const renderPedal = (slot: EffectSlot, index: number) => (
    <Pedal
      key={`slot-${slot.slotIndex}`}
      slot={slot}
      index={index}
      art={lookupPedalArt(artIndex, slot.effectId)}
      onToggle={() => onToggle(slot.slotIndex, slot.enabled)}
      onChangeEffect={(effectId) => onChangeEffect(slot.slotIndex, effectId)}
      onParamChange={(paramIdx, value) => onParamChange(slot.slotIndex, slot.effectId, paramIdx, value)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      isDragOver={dragOverIndex === index && dragIndex !== index}
      onMove={onMove}
      onInspect={(inspecting) =>
        setHoverSlot((prev) => (inspecting ? slot.slotIndex : prev === slot.slotIndex ? null : prev))
      }
      onPin={() => setPinnedSlot((prev) => (prev === slot.slotIndex ? null : slot.slotIndex))}
      isPinned={pinnedSlot === slot.slotIndex}
    />
  );

  return (
    <div className="board-view">
      <ChainStrip
        effects={preset.effects}
        patchVolume={patchVolume}
        patchPan={patchPan}
        patchTempo={patchTempo}
      />
      <InfoBar
        slot={inspected}
        art={inspected ? lookupPedalArt(artIndex, inspected.effectId) : undefined}
        pinned={pinnedSlot !== null && inspected !== null}
        onUnpin={() => setPinnedSlot(null)}
      />
      <main className="stage">
        <CableLayer modules={modules} orderKey={orderKey} hidden={dragIndex !== null} />
        <section className="board-deck">
          <div className="board-row">
            {preset.effects.slice(6).map((slot, i) => renderPedal(slot, i + 6))}
          </div>
          <div className="board-row">
            {preset.effects.slice(0, 6).map((slot, i) => renderPedal(slot, i))}
          </div>
          <SwitcherUnit
            patchName={preset.patchName}
            currentSlot={currentSlot}
            connected={connected}
            onLoadRequest={onLoadRequest}
            onSaveToActiveSlot={onSaveToActiveSlot}
          />
        </section>
      </main>
    </div>
  );
}
