import { useState, type CSSProperties, type DragEvent } from 'react';
import type { GP200Preset, EffectSlot } from '@/core/types';
import type { PushProgress } from '@/core/devicePush';
import { getSlotModule } from '@/core/effectNames';
import { bayMinHeight, isWideSlot } from './boardLayout';
import { useFlipReorder } from './useFlipReorder';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { ControllerPanel } from '@/components/ControllerPanel';
import { FootswitchPanel } from '@/components/FootswitchPanel';
import { LooperPanel } from './LooperPanel';
import type { LooperApi } from '@/hooks/useLooper';
import type { LooperBindings } from '@/core/looperBindings';
import { splitRows } from './boardLayout';
import { lookupPedalArt, usePedalManifest } from './pedalManifest';
import { Pedal } from './Pedal';
import { EffectPicker } from './EffectPicker';
import { ChainStrip } from './ChainStrip';
import { InfoBar } from './InfoBar';
import { CableLayer } from './CableLayer';
import { SwitcherUnit } from './SwitcherUnit';
import { BoardTopBar } from './BoardTopBar';
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
  onExpParamSelect: (
    page: number,
    item: number,
    blockIndex: number | null,
    paramIdx: number,
  ) => void;
  onExpMinMax: (page: number, item: number, min: number, max: number) => void;
  onCtrlBlockToggle: (ctrlIndex: number, blockIndex: number, on: boolean) => void;
  onCtrlClear: (ctrlIndex: number) => void;
  onOpenPatchManager: () => void;
  onOpenGuide: () => void;
  /* loop station */
  looper: LooperApi;
  looperBindings: LooperBindings;
  onLooperBindingsChange: (next: LooperBindings) => void;
  onEnableAudio: () => void;
  audioStarting: boolean;
  /* device session controls (deck-hosted; there is no separate status bar) */
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
 * visual; the signal path is the array order, made legible by the cables).
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
  onCtrlClear,
  onOpenPatchManager,
  onOpenGuide,
  looper,
  looperBindings,
  onLooperBindingsChange,
  onEnableAudio,
  audioStarting,
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
  const [openDrawer, setOpenDrawer] = useState<'fxloop' | 'exp' | 'ctrl' | 'looper' | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  const inspectKey = pinnedSlot ?? hoverSlot;
  const inspected = inspectKey !== null
    ? preset.effects.find((e) => e.slotIndex === inspectKey) ?? null
    : null;

  const pickerEffect = preset.effects.find((slot) => slot.slotIndex === pickerSlot) ?? null;

  const modules = preset.effects.map((e) => getSlotModule(e.slotIndex));
  const orderKey = preset.effects.map((e) => `${e.slotIndex}:${e.effectId}`).join(',');

  // FLIP: capture pedal positions before a reorder, then spring them to place
  const { scopeRef, capture } = useFlipReorder(orderKey);
  const handleReorderDrop = (index: number) => {
    capture();
    onDrop(index);
  };
  const handleReorderMove = (from: number, to: number) => {
    capture();
    onMove(from, to);
  };

  // rows balanced by rendered width so a wide AMP can't push the last
  // front-row pedal (usually CAB) off the stage
  const { front, back } = splitRows(preset.effects);

  // each pedal sits in a fixed-size bay (compact/wide, keyed to the slot's module
  // (see isWideSlot). The pedal keeps its own natural size; the bay absorbs any
  // difference as padding, so swapping an effect never shifts a neighbour. The bay
  // (not just the pedal) is the drop target, so you don't have to aim precisely at
  // the pedal body, and while a drag is in flight every bay shows a drop slot.
  const renderPedal = (slot: EffectSlot, index: number, row: 'front' | 'back') => {
    const bayClasses = ['pedal-bay'];
    if (isWideSlot(slot.slotIndex)) bayClasses.push('wide');
    if (dragIndex !== null) bayClasses.push('droppable');
    if (dragIndex === index) bayClasses.push('drag-source');
    if (dragOverIndex === index && dragIndex !== index) bayClasses.push('drop-target');
    return (
      <div
        key={`slot-${slot.slotIndex}`}
        className={bayClasses.join(' ')}
        style={{ '--bay-h': `${bayMinHeight(slot.slotIndex)}px` } as CSSProperties}
        onDragOver={(e) => onDragOver(e, index)}
        onDrop={() => handleReorderDrop(index)}
      >
        <Pedal
          slot={slot}
          index={index}
          row={row}
          art={lookupPedalArt(artIndex, slot.effectId)}
          onToggle={() => onToggle(slot.slotIndex, slot.enabled)}
          onOpenPicker={() => setPickerSlot(slot.slotIndex)}
          onParamChange={(paramIdx, value) => onParamChange(slot.slotIndex, slot.effectId, paramIdx, value)}
          onDragStart={onDragStart}
          onMove={handleReorderMove}
          onInspect={(inspecting) =>
            setHoverSlot((prev) => (inspecting ? slot.slotIndex : prev === slot.slotIndex ? null : prev))
          }
          onPin={() => setPinnedSlot((prev) => (prev === slot.slotIndex ? null : slot.slotIndex))}
          isPinned={pinnedSlot === slot.slotIndex}
        />
      </div>
    );
  };

  return (
    <div className="board-view">
      <BoardTopBar
        connected={connected}
        currentSlot={currentSlot}
        firmware={firmware}
        pushProgress={pushProgress}
        onImportFile={onImportFile}
        onExportRequest={onExportRequest}
        onLoadRequest={onLoadRequest}
        onPushRequest={onPushRequest}
        onOpenPatchManager={onOpenPatchManager}
        onOpenGuide={onOpenGuide}
        onConnectRequest={onConnectRequest}
        onDisconnect={onDisconnect}
        onCloseRequest={onCloseRequest}
      />
      <ChainStrip effects={preset.effects} />
      <InfoBar
        slot={inspected}
        art={inspected ? lookupPedalArt(artIndex, inspected.effectId) : undefined}
        pinned={pinnedSlot !== null && inspected !== null}
        onUnpin={() => setPinnedSlot(null)}
      />
      <main className="stage">
        <section className="board-deck">
          {/* rows never wrap; the scroll wrapper handles overflow on narrow
              screens, and the cables live inside it so they scroll in lockstep
              with the pedals (the top/bottom bars stay put) */}
          <div className="board-scroll">
            <div className="board-rows" ref={scopeRef}>
              <CableLayer modules={modules} orderKey={orderKey} hidden={dragIndex !== null} />
              {/* reading order = chain order: front row first, remainder below */}
              <div className="board-row">
                <span className="flow-badge" aria-hidden="true">IN ›</span>
                {front.map((slot, i) => renderPedal(slot, i, 'front'))}
              </div>
              <div className="board-row">
                {back.map((slot, i) => renderPedal(slot, i + front.length, 'back'))}
                <span className="flow-badge" aria-hidden="true">› OUT</span>
              </div>
            </div>
          </div>
        </section>
        {/* Floating control deck: sits outside the board chassis so it can
            stick to the bottom of the scroll stage and float over the rows. */}
        <SwitcherUnit
          preset={preset}
          patchVolume={patchVolume}
          patchPan={patchPan}
          patchTempo={patchTempo}
          currentSlot={currentSlot}
          connected={connected}
          onSaveToActiveSlot={onSaveToActiveSlot}
          onPatchNameChange={onPatchNameChange}
          onAuthorChange={onAuthorChange}
          onVolumeChange={onVolumeChange}
          onPanChange={onPanChange}
          onTempoChange={onTempoChange}
          onOpenFxLoop={() => setOpenDrawer('fxloop')}
          onOpenExp={() => setOpenDrawer('exp')}
          onOpenCtrl={() => setOpenDrawer('ctrl')}
          onOpenLooper={() => setOpenDrawer('looper')}
        />
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
        title="Expression Pedals"
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
        title="CTRL Footswitches"
      >
        <FootswitchPanel
          preset={preset}
          currentSlot={currentSlot}
          connected={connected}
          onCtrlBlockToggle={onCtrlBlockToggle}
          onCtrlClear={onCtrlClear}
        />
      </DeckDrawer>

      <DeckDrawer
        open={openDrawer === 'looper'}
        onClose={() => setOpenDrawer(null)}
        title="Loop Station"
      >
        <LooperPanel
          looper={looper}
          bindings={looperBindings}
          onBindingsChange={onLooperBindingsChange}
          onEnableAudio={onEnableAudio}
          audioStarting={audioStarting}
        />
      </DeckDrawer>

      {pickerEffect && (
        <EffectPicker
          open
          module={getSlotModule(pickerEffect.slotIndex)}
          currentEffectId={pickerEffect.effectId}
          artIndex={artIndex}
          onSelect={(effectId) => onChangeEffect(pickerEffect.slotIndex, effectId)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  );
}
