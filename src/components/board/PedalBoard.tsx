import { useState, type DragEvent } from 'react';
import type { GP200Preset, EffectSlot } from '@/core/types';
import type { PushProgress } from '@/core/devicePush';
import { getSlotModule } from '@/core/effectNames';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { ControllerPanel } from '@/components/ControllerPanel';
import { FootswitchPanel } from '@/components/FootswitchPanel';
import { splitRows } from './boardLayout';
import { lookupPedalArt, usePedalManifest } from './pedalManifest';
import { Pedal } from './Pedal';
import { ChainStrip } from './ChainStrip';
import { InfoBar } from './InfoBar';
import { CableLayer } from './CableLayer';
import { SwitcherUnit } from './SwitcherUnit';
import { DeckDrawer } from './DeckDrawer';
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
  /* deck: metadata, live settings, file I/O, drawers */
  onPatchNameChange: (name: string) => void;
  onAuthorChange: (author: string) => void;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onTempoChange: (bpm: number) => void;
  onImportFile: (buffer: Uint8Array, filename: string) => void;
  onExportRequest: () => void;
  onCloseRequest: () => void;
  onFxSendChange: (pos: number) => void;
  onFxReturnChange: (pos: number) => void;
  onExpParamSelect: (page: number, item: number, blockIndex: number, paramIdx: number) => void;
  onExpMinMax: (page: number, item: number, min: number, max: number) => void;
  onCtrlBlockToggle: (ctrlIndex: number, blockIndex: number, on: boolean) => void;
  onOpenPatchManager: () => void;
  /* device session controls (deck-hosted — there is no separate status bar) */
  onConnectRequest: () => void;
  onDisconnect: () => void;
  onPushRequest: () => void;
  pushProgress: PushProgress | null;
  firmware: string | null;
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
  onPatchNameChange,
  onAuthorChange,
  onVolumeChange,
  onPanChange,
  onTempoChange,
  onImportFile,
  onExportRequest,
  onCloseRequest,
  onFxSendChange,
  onFxReturnChange,
  onExpParamSelect,
  onExpMinMax,
  onCtrlBlockToggle,
  onOpenPatchManager,
  onConnectRequest,
  onDisconnect,
  onPushRequest,
  pushProgress,
  firmware,
}: PedalBoardProps) {
  const artIndex = usePedalManifest();

  // hover inspects, ⓘ pins; both keyed by slotIndex (stable across reorders)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [pinnedSlot, setPinnedSlot] = useState<number | null>(null);
  const [openDrawer, setOpenDrawer] = useState<'fxloop' | 'exp' | 'ctrl' | null>(null);

  const inspectKey = pinnedSlot ?? hoverSlot;
  const inspected = inspectKey !== null
    ? preset.effects.find((e) => e.slotIndex === inspectKey) ?? null
    : null;

  const modules = preset.effects.map((e) => getSlotModule(e.slotIndex));
  const orderKey = preset.effects.map((e) => `${e.slotIndex}:${e.effectId}`).join(',');

  // rows balanced by rendered width so a wide AMP can't push the last
  // front-row pedal (usually CAB) off the stage
  const { front, back } = splitRows(preset.effects);

  const renderPedal = (slot: EffectSlot, index: number, row: 'front' | 'back') => (
    <Pedal
      key={`slot-${slot.slotIndex}`}
      slot={slot}
      index={index}
      row={row}
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
      <ChainStrip effects={preset.effects} />
      <InfoBar
        slot={inspected}
        art={inspected ? lookupPedalArt(artIndex, inspected.effectId) : undefined}
        pinned={pinnedSlot !== null && inspected !== null}
        onUnpin={() => setPinnedSlot(null)}
      />
      <main className="stage">
        <CableLayer modules={modules} orderKey={orderKey} hidden={dragIndex !== null} />
        <section className="board-deck">
          {/* reading order = chain order: front row first, remainder below */}
          <div className="board-row">
            <span className="flow-badge" aria-hidden="true">IN ›</span>
            {front.map((slot, i) => renderPedal(slot, i, 'front'))}
          </div>
          <div className="board-row">
            {back.map((slot, i) => renderPedal(slot, i + front.length, 'back'))}
            <span className="flow-badge" aria-hidden="true">› OUT</span>
          </div>
          <SwitcherUnit
            preset={preset}
            patchVolume={patchVolume}
            patchPan={patchPan}
            patchTempo={patchTempo}
            currentSlot={currentSlot}
            connected={connected}
            onLoadRequest={onLoadRequest}
            onSaveToActiveSlot={onSaveToActiveSlot}
            onPatchNameChange={onPatchNameChange}
            onAuthorChange={onAuthorChange}
            onVolumeChange={onVolumeChange}
            onPanChange={onPanChange}
            onTempoChange={onTempoChange}
            onImportFile={onImportFile}
            onExportRequest={onExportRequest}
            onCloseRequest={onCloseRequest}
            onOpenFxLoop={() => setOpenDrawer('fxloop')}
            onOpenExp={() => setOpenDrawer('exp')}
            onOpenCtrl={() => setOpenDrawer('ctrl')}
            onOpenPatchManager={onOpenPatchManager}
            onConnectRequest={onConnectRequest}
            onDisconnect={onDisconnect}
            onPushRequest={onPushRequest}
            pushProgress={pushProgress}
            firmware={firmware}
          />
        </section>
      </main>

      <DeckDrawer
        open={openDrawer === 'fxloop'}
        onClose={() => setOpenDrawer(null)}
        title="FX Loop Position"
      >
        <FxLoopArrows
          send={preset.fxLoopSend}
          ret={preset.fxLoopReturn}
          onSendChange={onFxSendChange}
          onReturnChange={onFxReturnChange}
        />
        <p className="font-mono-display text-caption text-text-muted mt-1">
          Drag ↗ SEND and ↘ RETURN between blocks. Send = Return bypasses the loop.
        </p>
      </DeckDrawer>

      <DeckDrawer
        open={openDrawer === 'exp'}
        onClose={() => setOpenDrawer(null)}
        title="EXP Controllers"
      >
        <ControllerPanel
          preset={preset}
          connected={connected}
          onParamSelect={onExpParamSelect}
          onMinMax={onExpMinMax}
        />
      </DeckDrawer>

      <DeckDrawer
        open={openDrawer === 'ctrl'}
        onClose={() => setOpenDrawer(null)}
        title="Footswitch CTRL"
      >
        <FootswitchPanel
          preset={preset}
          currentSlot={currentSlot}
          connected={connected}
          onCtrlBlockToggle={onCtrlBlockToggle}
        />
      </DeckDrawer>
    </div>
  );
}
