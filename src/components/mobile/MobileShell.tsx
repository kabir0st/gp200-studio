import { useEffect, useRef, useState } from 'react';
import type { PedalBoardProps } from '@/components/board/PedalBoard';
import { usePedalManifest } from '@/components/board/pedalManifest';
import { LooperPanel } from '@/components/board/LooperPanel';
import { DrumsPanel } from '@/components/board/DrumsPanel';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { ControllerPanel } from '@/components/ControllerPanel';
import { FootswitchPanel } from '@/components/FootswitchPanel';
import { MobileHeader } from './MobileHeader';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { MobileSheet } from './MobileSheet';
import { ChainScreen } from './ChainScreen';
import { PedalEditorScreen } from './PedalEditorScreen';
import { DeviceScreen } from './DeviceScreen';
import './mobile.css';

type Sheet = 'fxloop' | 'exp' | 'ctrl' | 'meta' | null;

/**
 * Root of the phone tree, rendered below 640px in place of PedalBoard.
 *
 * Takes PedalBoardProps verbatim: App builds one props object and spreads it
 * into whichever tree renders, so a new editor capability cannot reach the
 * board and silently skip the phone. Props are destructured explicitly (never
 * `...rest`) so anything this tree ignores is visible in review.
 *
 * Crossing the 640px boundary unmounts one tree and mounts the other. Preset,
 * MIDI session, looper and audio state all live in App/hooks and survive; only
 * ephemeral UI state (active tab, open sheet) resets. That is deliberate —
 * debouncing the breakpoint would reintroduce mid-resize flicker.
 *
 * Ignored on purpose: dragIndex / dragOverIndex / onDragStart / onDragOver /
 * onDrop. Those drive HTML5 drag-and-drop, which never fires on touch; reorder
 * here goes through onMove.
 */
export default function MobileShell({
  preset,
  onToggle,
  onChangeEffect,
  onParamChange,
  onMove,
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
  sendCC,
  ccChannel,
  onCcChannelChange,
  onConnectRequest,
  onDisconnect,
  onPushRequest,
  pushProgress,
  firmware,
}: PedalBoardProps) {
  const [tab, setTab] = useState<MobileTab>('chain');
  const [sheet, setSheet] = useState<Sheet>(null);
  /** array position of the block being edited, or null for the chain list */
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const artIndex = usePedalManifest();
  /** the scrolling region, so a chain drag near the edge can auto-scroll it */
  const mainRef = useRef<HTMLElement>(null);

  // Stomp hijacking + the footswitch takeover are only safe while the looper is
  // actually on screen; on the phone that's the LOOP tab, not a dialog.
  useEffect(() => {
    onLooperDrawerOpenChange(tab === 'loop');
  }, [tab, onLooperDrawerOpenChange]);

  // The Patches tab is a launcher for the shared patch manager sheet, which
  // App owns; bounce back to Chain so the tab never sits on an empty screen.
  useEffect(() => {
    if (tab !== 'patches') return;
    onOpenPatchManager();
    setTab('chain');
  }, [tab, onOpenPatchManager]);

  const editingSlot = editingIndex === null ? null : preset.effects[editingIndex];

  return (
    <div className="mobile-view">
      <MobileHeader
        connected={connected}
        patchName={preset.patchName}
        currentSlot={currentSlot}
        pushProgress={pushProgress}
        onActivateSlot={onActivateSlot}
        onEditMeta={() => setSheet('meta')}
      />

      <main className="m-main" ref={mainRef}>
        {tab === 'chain' && editingSlot && editingIndex !== null && (
          <PedalEditorScreen
            slot={editingSlot}
            index={editingIndex}
            chainLength={preset.effects.length}
            artIndex={artIndex}
            onBack={() => setEditingIndex(null)}
            onToggle={() => onToggle(editingSlot.slotIndex, editingSlot.enabled)}
            onChangeEffect={(effectId) => onChangeEffect(editingSlot.slotIndex, effectId)}
            onParamChange={(paramIdx, value) =>
              onParamChange(editingSlot.slotIndex, editingSlot.effectId, paramIdx, value)
            }
          />
        )}

        {tab === 'chain' && !editingSlot && (
          <ChainScreen
            preset={preset}
            artIndex={artIndex}
            scrollRef={mainRef}
            onToggle={onToggle}
            onMove={onMove}
            onOpenSlot={setEditingIndex}
            onOpenFxLoop={() => setSheet('fxloop')}
          />
        )}

        {tab === 'loop' && (
          <div className="m-screen">
            <h2 className="m-screen-title">LOOP STATION</h2>
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
          </div>
        )}

        {tab === 'drums' && (
          <div className="m-screen">
            <h2 className="m-screen-title">DRUMS &amp; LOOPER</h2>
            <DrumsPanel
              connected={connected}
              sendCC={sendCC}
              ccChannel={ccChannel}
              onCcChannelChange={onCcChannelChange}
            />
          </div>
        )}

        {tab === 'device' && (
          <DeviceScreen
            connected={connected}
            firmware={firmware}
            currentSlot={currentSlot}
            patchVolume={patchVolume}
            patchPan={patchPan}
            patchTempo={patchTempo}
            onVolumeChange={onVolumeChange}
            onPanChange={onPanChange}
            onTempoChange={onTempoChange}
            onConnectRequest={onConnectRequest}
            onDisconnect={onDisconnect}
            onLoadRequest={onLoadRequest}
            onPushRequest={onPushRequest}
            onSaveToActiveSlot={onSaveToActiveSlot}
            onOpenFxLoop={() => setSheet('fxloop')}
            onOpenExp={() => setSheet('exp')}
            onOpenCtrl={() => setSheet('ctrl')}
            onOpenGuide={onOpenGuide}
            onCloseRequest={onCloseRequest}
            sendCC={sendCC}
          />
        )}
      </main>

      <MobileTabBar active={tab} onChange={setTab} />

      {/* One sheet depth maximum: Dialog locks page scroll, and stacking two
          double-fires the restore. */}
      <MobileSheet open={sheet === 'meta'} onClose={() => setSheet(null)} title="Patch">
        <label className="m-field">
          <span className="m-field-label">NAME</span>
          <input
            className="m-input"
            value={preset.patchName}
            maxLength={16}
            onChange={(e) => onPatchNameChange(e.target.value)}
          />
        </label>
        <label className="m-field">
          <span className="m-field-label">AUTHOR</span>
          <input
            className="m-input"
            value={preset.author}
            maxLength={16}
            onChange={(e) => onAuthorChange(e.target.value)}
          />
        </label>
      </MobileSheet>

      <MobileSheet open={sheet === 'fxloop'} onClose={() => setSheet(null)} title="FX Loop">
        <FxLoopArrows
          send={preset.fxLoopSend}
          ret={preset.fxLoopReturn}
          onSendChange={onFxSendChange}
          onReturnChange={onFxReturnChange}
        />
      </MobileSheet>

      <MobileSheet open={sheet === 'exp'} onClose={() => setSheet(null)} title="Expression Pedal">
        <ControllerPanel
          preset={preset}
          connected={connected}
          onParamSelect={onExpParamSelect}
          onMinMax={onExpMinMax}
        />
      </MobileSheet>

      <MobileSheet open={sheet === 'ctrl'} onClose={() => setSheet(null)} title="CTRL Footswitches">
        <FootswitchPanel
          preset={preset}
          connected={connected}
          onCtrlBlockToggle={onCtrlBlockToggle}
          onCtrlClear={onCtrlClear}
        />
      </MobileSheet>
    </div>
  );
}
