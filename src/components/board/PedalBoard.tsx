import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import type { GP200Preset, EffectSlot } from '@/core/types';
import type { PushProgress } from '@/core/devicePush';
import { getSlotModule } from '@/core/effectNames';
import { isWideSlot } from './boardLayout';
import { useFlipReorder } from './useFlipReorder';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { ControllerPanel } from '@/components/ControllerPanel';
import { FootswitchPanel } from '@/components/FootswitchPanel';
import { LooperPanel } from './LooperPanel';
import { DrumsPanel } from './DrumsPanel';
import { DeviceLooperPanel } from './DeviceLooperPanel';
import { RemotePanel } from './RemotePanel';
import { DeviceStatePanel } from './DeviceStatePanel';
import { BulkApplySection } from '@/components/BulkApplySection';
import type { DeviceStateDump } from '@/core/SysExCodec';
import type { BulkApplyProgress, BulkScope } from '@/core/bulkApply';
import { DrumMachinePanel } from './DrumMachinePanel';
import type { CCCommand } from '@/core/ccControl';
import type { DrumMachineApi } from '@/hooks/useDrumMachine';
import type { LooperApi } from '@/hooks/useLooper';
import type { LooperActionKind, LooperBindings } from '@/core/looperBindings';
import type { LooperTriggerMap } from '@/core/looperTriggers';
import type { LearnNotice } from '@/hooks/useLooperTriggers';
import type { PanelId } from '@/core/analyticsEvents';
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
import { Dialog } from '@/components/ui/Dialog';
import { useCoarsePointer, useSingleRowBoard } from '@/hooks/useMediaQuery';
import { prefersReducedMotion } from '@/lib/motion';
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
  /* deck: metadata, live settings, drawers */
  onPatchNameChange: (name: string) => void;
  onAuthorChange: (author: string) => void;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
  onTempoChange: (bpm: number) => void;
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
  onActivateSlot: (slot: number) => void;
  onOpenGuide: () => void;
  /** Engagement analytics: a drawer (desktop) or tab/sheet (phone) was opened.
   *  Both trees report into the same PanelId vocabulary so "did anyone find the
   *  looper?" is one number rather than two incomparable ones. */
  onPanelOpen: (panel: PanelId) => void;
  /* loop station */
  looper: LooperApi;
  looperBindings: LooperBindings;
  onLooperBindingsChange: (next: LooperBindings) => void;
  onEnableAudio: () => void;
  audioStarting: boolean;
  /** Stomp-hijacking (and the FS takeover) only apply while the looper is open. */
  onLooperDrawerOpenChange: (open: boolean) => void;
  looperTriggers: LooperTriggerMap;
  looperArmedAction: LooperActionKind | null;
  onLooperArmLearn: (action: LooperActionKind) => void;
  onLooperClearTrigger: (action: LooperActionKind) => void;
  onLooperClearAll: () => void;
  looperLearnNotice: LearnNotice | null;
  /* browser practice drum machine (Web Audio, plays with or without a device) */
  drumMachine: DrumMachineApi;
  /* built-in drums/looper/tuner remote (plain MIDI CC, src/core/ccControl.ts) */
  sendCC: (command: CCCommand | CCCommand[]) => void;
  ccChannel: number;
  onCcChannelChange: (channel: number) => void;
  /* connect-time 0x4E state dump (read-only device settings view) */
  deviceState: DeviceStateDump | null;
  /* bulk apply (PATCH SETTINGS drawer): CTRL/volume across many patches */
  canCopyCtrl: boolean;
  onBulkApply: (scope: BulkScope, apply: { ctrl: boolean; volume: number | null }) => void;
  bulkApplyProgress: BulkApplyProgress | null;
  onCancelBulkApply: () => void;
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
  onCloseRequest,
  onFxSendChange,
  onFxReturnChange,
  onExpParamSelect,
  onExpMinMax,
  onCtrlBlockToggle,
  onCtrlClear,
  onOpenPatchManager,
  onActivateSlot,
  onOpenGuide,
  onPanelOpen,
  looper,
  looperBindings,
  onLooperBindingsChange,
  onEnableAudio,
  audioStarting,
  onLooperDrawerOpenChange,
  looperTriggers,
  looperArmedAction,
  onLooperArmLearn,
  onLooperClearTrigger,
  onLooperClearAll,
  looperLearnNotice,
  drumMachine,
  sendCC,
  deviceState,
  canCopyCtrl,
  onBulkApply,
  bulkApplyProgress,
  onCancelBulkApply,
  ccChannel,
  onCcChannelChange,
  onConnectRequest,
  onDisconnect,
  onPushRequest,
  pushProgress,
  firmware,
}: PedalBoardProps) {
  const artIndex = usePedalManifest();

  // Phones fold the two rows into one swipeable row (see useSingleRowBoard) and
  // get tap reorder arrows, since HTML5 drag-and-drop never fires on touch.
  const singleRow = useSingleRowBoard();
  const touch = useCoarsePointer();

  // hover inspects, ⓘ pins; both keyed by slotIndex (stable across reorders)
  const [hoverSlot, setHoverSlot] = useState<number | null>(null);
  const [pinnedSlot, setPinnedSlot] = useState<number | null>(null);
  const [openDrawer, setOpenDrawer] =
    useState<'fxloop' | 'patch' | 'looper' | 'drums' | 'remote' | null>(null);
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);

  // Report the looper drawer's open state up to App: the MIDI dispatcher tap
  // hijacks learned footswitch stomps only while the drawer is open.
  useEffect(() => {
    onLooperDrawerOpenChange(openDrawer === 'looper');
  }, [openDrawer, onLooperDrawerOpenChange]);

  // Every drawer *opens* through here so the analytics call can't be forgotten
  // on a new drawer. Closing (setOpenDrawer(null)) stays direct — only the open
  // is a discovery signal.
  const openPanel = useCallback(
    (panel: 'fxloop' | 'patch' | 'looper' | 'drums' | 'remote') => {
      setOpenDrawer(panel);
      onPanelOpen(panel);
    },
    [onPanelOpen],
  );

  const inspectKey = pinnedSlot ?? hoverSlot;
  const inspected = inspectKey !== null
    ? preset.effects.find((e) => e.slotIndex === inspectKey) ?? null
    : null;

  const pickerEffect = preset.effects.find((slot) => slot.slotIndex === pickerSlot) ?? null;

  const orderKey = preset.effects.map((e) => `${e.slotIndex}:${e.effectId}`).join(',');
  // Memoised because CableLayer takes this as an effect dependency: rebuilt inline,
  // a new array identity on every render made each hover/drag-over tear down the
  // ResizeObserver and re-measure, scheduling a rAF and a ~460ms settle timeout each
  // time. That thrash is what read as the board "glitching" while dragging.
  const modules = useMemo(
    () => preset.effects.map((e) => getSlotModule(e.slotIndex)),
    [preset.effects],
  );

  // FLIP: capture pedal positions before a reorder, then spring them to place
  const { scopeRef, capture } = useFlipReorder(orderKey);
  const handleReorderDrop = (index: number) => {
    capture();
    onDrop(index);
  };
  const handleReorderMove = (from: number, to: number) => {
    capture();
    onMove(from, to);
    // keep the pedal you just moved on screen (it can leave the viewport on a
    // narrow board); wait a frame so the new order is laid out first
    requestAnimationFrame(() => scrollToPedal(to));
  };

  // rows balanced by rendered width so a wide AMP can't push the last
  // front-row pedal (usually CAB) off the stage
  const { front, back } = splitRows(preset.effects);

  // chain strip / reorder arrows scroll the moved pedal back into view —
  // on a phone the target is usually off-screen after the move
  const scrollToPedal = useCallback(
    (index: number) => {
      const pedal = scopeRef.current?.querySelector<HTMLElement>(`[data-chain="${index}"]`);
      if (!pedal) return;
      let behavior: ScrollBehavior = 'smooth';
      if (prefersReducedMotion()) behavior = 'auto';
      pedal.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
    },
    [scopeRef],
  );

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
          showMoveButtons={touch}
          chainLength={preset.effects.length}
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
        onLoadRequest={onLoadRequest}
        onPushRequest={onPushRequest}
        patchName={preset.patchName}
        author={preset.author ?? ''}
        onPatchNameChange={onPatchNameChange}
        onAuthorChange={onAuthorChange}
        onOpenPatchManager={onOpenPatchManager}
        onActivateSlot={onActivateSlot}
        onOpenGuide={onOpenGuide}
        onConnectRequest={onConnectRequest}
        onDisconnect={onDisconnect}
        onCloseRequest={onCloseRequest}
        onOpenLooper={() => openPanel('looper')}
        onOpenDrums={() => openPanel('drums')}
        onOpenRemote={() => openPanel('remote')}
        drumsPlaying={drumMachine.playing}
        sendCC={sendCC}
      />
      <ChainStrip effects={preset.effects} onJump={scrollToPedal} />
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
            <div className={`board-rows${singleRow ? ' single' : ''}`} ref={scopeRef}>
              <CableLayer
                modules={modules}
                orderKey={`${orderKey}|${singleRow ? 1 : 2}`}
                hidden={dragIndex !== null}
              />
              {/* Phones get one row: two 340px+ rows plus the chrome don't fit a
                  phone viewport, and one row keeps the whole chain in a single
                  left-to-right swipe (cables stay same-row beziers throughout). */}
              {singleRow ? (
                <div className="board-row">
                  <span className="flow-badge" aria-hidden="true">IN ›</span>
                  {preset.effects.map((slot, i) => renderPedal(slot, i, 'front'))}
                  <span className="flow-badge" aria-hidden="true">› OUT</span>
                </div>
              ) : (
                <>
                  {/* reading order = chain order: front row first, remainder below */}
                  <div className="board-row">
                    <span className="flow-badge" aria-hidden="true">IN ›</span>
                    {front.map((slot, i) => renderPedal(slot, i, 'front'))}
                  </div>
                  <div className="board-row">
                    {back.map((slot, i) => renderPedal(slot, i + front.length, 'back'))}
                    <span className="flow-badge" aria-hidden="true">› OUT</span>
                  </div>
                </>
              )}
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
          onVolumeChange={onVolumeChange}
          onPanChange={onPanChange}
          onTempoChange={onTempoChange}
          onOpenFxLoop={() => openPanel('fxloop')}
          onOpenPatchSettings={() => openPanel('patch')}
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

      {/* One consolidated per-patch settings surface: EXP assignment (with
          the live position/A-B row, moved here from the REMOTE panel), CTRL
          footswitch masks, and the bulk-apply tool that copies them across
          patches. */}
      <DeckDrawer
        open={openDrawer === 'patch'}
        onClose={() => setOpenDrawer(null)}
        title="Patch Settings"
      >
        <p
          className="font-mono-display text-label text-text-muted uppercase
            tracking-widest mb-2"
        >
          Expression pedals
        </p>
        <ControllerPanel
          preset={preset}
          connected={connected}
          onParamSelect={onExpParamSelect}
          onMinMax={onExpMinMax}
          sendCC={sendCC}
        />
        <div className="mt-4 pt-4 border-t border-border-active">
          <p
            className="font-mono-display text-label text-text-muted uppercase
              tracking-widest mb-2"
          >
            CTRL footswitches
          </p>
          <FootswitchPanel
            preset={preset}
            connected={connected}
            onCtrlBlockToggle={onCtrlBlockToggle}
            onCtrlClear={onCtrlClear}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-border-active">
          <p
            className="font-mono-display text-label text-text-muted uppercase
              tracking-widest mb-2"
          >
            Bulk apply · many patches
          </p>
          <BulkApplySection
            connected={connected}
            canCopyCtrl={canCopyCtrl}
            progress={bulkApplyProgress}
            onApply={onBulkApply}
            onCancel={onCancelBulkApply}
          />
        </div>
      </DeckDrawer>

      {/* The loop station is a big centred dialog (same footprint as the effect
          picker), not a bottom sheet: it's a full workspace, not a quick tweak. */}
      <Dialog
        open={openDrawer === 'looper'}
        onClose={() => setOpenDrawer(null)}
        title="Loop Station"
        maxWidth="max-w-4xl"
      >
        <div className="flex items-center justify-between mb-4">
          <span
            className="font-mono-display text-label font-bold tracking-wider uppercase
              text-text-secondary"
          >
            Loop Station
          </span>
          <button
            type="button"
            onClick={() => setOpenDrawer(null)}
            aria-label="Close Loop Station"
            className="ui-btn font-mono-display text-xs font-bold px-3 py-1.5 -my-1 rounded
              text-text-muted hover:text-text-primary"
          >
            ✕
          </button>
        </div>
        <LooperPanel
          looper={looper}
          bindings={looperBindings}
          onBindingsChange={onLooperBindingsChange}
          onEnableAudio={onEnableAudio}
          audioStarting={audioStarting}
          triggers={looperTriggers}
          armedAction={looperArmedAction}
          onArmLearn={onLooperArmLearn}
          onClearTrigger={onLooperClearTrigger}
          onClearAll={onLooperClearAll}
          learnNotice={looperLearnNotice}
          learnEnabled={connected}
        />
        {/* The pedal's own single loop, collapsed: same drawer as the loop
            station it gets confused with, but never competing with it. */}
        <div className="mt-4 pt-4 border-t border-border-active">
          <DeviceLooperPanel connected={connected} sendCC={sendCC} />
        </div>
      </Dialog>

      <DeckDrawer
        open={openDrawer === 'drums'}
        onClose={() => setOpenDrawer(null)}
        title="Drums"
      >
        {/* Browser practice drums first (works offline); the hardware remote
            below needs a connected GP-200. Playback survives closing this
            drawer — the hook lives in App. */}
        <p
          className="font-mono-display text-label text-text-muted uppercase
            tracking-widest mb-2"
        >
          Practice drum machine · browser audio
        </p>
        <DrumMachinePanel drums={drumMachine} />
        <div className="mt-4 pt-4 border-t border-border-active">
          <p
            className="font-mono-display text-label text-text-muted uppercase
              tracking-widest mb-2"
          >
            GP-200 hardware · MIDI remote
          </p>
          <DrumsPanel
            connected={connected}
            sendCC={sendCC}
            ccChannel={ccChannel}
            onCcChannelChange={onCcChannelChange}
          />
        </div>
      </DeckDrawer>

      <DeckDrawer
        open={openDrawer === 'remote'}
        onClose={() => setOpenDrawer(null)}
        title="MIDI Remote"
      >
        <RemotePanel connected={connected} sendCC={sendCC} />
        <div className="mt-4 pt-4 border-t border-border-active">
          <p
            className="font-mono-display text-label text-text-muted uppercase
              tracking-widest mb-2"
          >
            Device state · read-only
          </p>
          <DeviceStatePanel connected={connected} state={deviceState} />
        </div>
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
