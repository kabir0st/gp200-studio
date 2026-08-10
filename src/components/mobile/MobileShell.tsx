import { useCallback, useEffect, useRef, useState } from 'react';
import type { PedalBoardProps } from '@/components/board/PedalBoard';
import { usePedalManifest } from '@/components/board/pedalManifest';
import { LooperPanel } from '@/components/board/LooperPanel';
import { DrumsPanel } from '@/components/board/DrumsPanel';
import { DeviceLooperPanel } from '@/components/board/DeviceLooperPanel';
import { BulkApplySection } from '@/components/BulkApplySection';
import { DrumMachinePanel } from '@/components/board/DrumMachinePanel';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { ControllerPanel } from '@/components/ControllerPanel';
import { FootswitchPanel } from '@/components/FootswitchPanel';
import { Tabs } from '@/components/ui/Tabs';
import { MobileHeader } from './MobileHeader';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import { MobileSheet } from './MobileSheet';
import { ChainScreen } from './ChainScreen';
import { PedalEditorScreen } from './PedalEditorScreen';
import { DeviceScreen } from './DeviceScreen';
import { track } from '@/core/analytics';
import './mobile.css';

type Sheet = 'fxloop' | 'patch' | 'meta' | null;

type PatchSettingsTab = 'exp' | 'ctrl' | 'bulk';

const PATCH_SETTINGS_TABS = [
  { id: 'exp', label: 'Expression' },
  { id: 'ctrl', label: 'Footswitches' },
  { id: 'bulk', label: 'Bulk Apply' },
];

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
  theme,
  onToggleTheme,
  soundOn,
  onToggleSound,
  onConnectRequest,
  onDisconnect,
  onPushRequest,
  pushProgress,
  firmware,
}: PedalBoardProps) {
  const [tab, setTab] = useState<MobileTab>('chain');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [patchTab, setPatchTab] = useState<PatchSettingsTab>('exp');

  function selectPatchTab(id: string) {
    if (id === 'exp' || id === 'ctrl' || id === 'bulk') {
      setPatchTab(id);
    }
  }
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

  // Every sheet opens through here, mirroring PedalBoard's openPanel, so the
  // phone can't drift out of the shared PanelId vocabulary.
  const openSheet = useCallback(
    (next: Exclude<Sheet, null>) => {
      setSheet(next);
      if (next === 'meta') {
        onPanelOpen('patch_meta');
        return;
      }
      onPanelOpen(next);
    },
    [onPanelOpen],
  );

  // Tab changes are the phone's entire navigation model. LOOP and DRUMS are the
  // same features the desktop hides behind drawers, so they also report
  // panel_open , that is what keeps "did anyone find the looper?" a single
  // number across both trees instead of two that can't be added together.
  const tabSettled = useRef(false);
  useEffect(() => {
    // Skip the mount render: landing on the default CHAIN tab isn't navigation.
    if (!tabSettled.current) {
      tabSettled.current = true;
      return;
    }
    track('nav_tab', { tab });
    if (tab === 'loop') onPanelOpen('looper');
    if (tab === 'drums') onPanelOpen('drums');
  }, [tab, onPanelOpen]);

  const editingSlot = editingIndex === null ? null : preset.effects[editingIndex];

  return (
    <div className="mobile-view">
      <MobileHeader
        connected={connected}
        patchName={preset.patchName}
        currentSlot={currentSlot}
        pushProgress={pushProgress}
        onActivateSlot={onActivateSlot}
        onEditMeta={() => openSheet('meta')}
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
            onOpenFxLoop={() => openSheet('fxloop')}
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
            {/* The pedal's own single loop, collapsed under the loop station */}
            <div className="mt-4 pt-4 border-t border-border-active">
              <DeviceLooperPanel connected={connected} sendCC={sendCC} />
            </div>
          </div>
        )}

        {tab === 'drums' && (
          <div className="m-screen">
            <h2 className="m-screen-title">PRACTICE DRUMS</h2>
            <DrumMachinePanel drums={drumMachine} />
            <h2 className="m-screen-title mt-6">GP-200 DRUMS &amp; TUNER</h2>
            <DrumsPanel
              connected={connected}
              sendCC={sendCC}
              ccChannel={ccChannel}
              onCcChannelChange={onCcChannelChange}
            />
          </div>
        )}

        {tab === 'device' && (
          <>
            {/* The desktop board wears the red rocker on its chassis rail; the
                phone has no chassis, so the same theme toggle lives in the
                DEVICE tab as a plain mobile button (the rocker's skin is
                .board-view-scoped, and the phone tree does not restyle
                borrowed chrome — it borrows whole components or nothing). */}
            <div className="m-screen pb-0">
              <h2 className="m-screen-title">STAGE LIGHTS</h2>
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'light'}
                className={`m-btn wide${theme === 'light' ? ' active' : ''}`}
                onClick={onToggleTheme}
              >
                {theme === 'light' ? '☀ LIGHTS ON' : '☾ DARK STAGE'}
              </button>
              {/* The clack the toggle above makes (src/lib/uiSound.ts). The
                  desktop hides this behind an icon next to the rocker; here it
                  reads as a second labelled row, which is all the phone has. */}
              <button
                type="button"
                role="switch"
                aria-checked={soundOn}
                className={`m-btn wide${soundOn ? ' active' : ''}`}
                onClick={onToggleSound}
              >
                {soundOn ? '♪ SWITCH SOUND ON' : '✕ SWITCH SOUND MUTED'}
              </button>
            </div>
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
              onOpenFxLoop={() => openSheet('fxloop')}
              onOpenPatchSettings={() => openSheet('patch')}
              onOpenGuide={onOpenGuide}
              onCloseRequest={onCloseRequest}
              sendCC={sendCC}
              deviceState={deviceState}
            />
          </>
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

      {/* One per-patch settings sheet, mirroring the desktop PATCH SETTINGS
          drawer's tabs: EXP assignment (+ live test row), CTRL footswitch
          masks, bulk apply. */}
      <MobileSheet open={sheet === 'patch'} onClose={() => setSheet(null)} title="Patch Settings">
        <Tabs
          tabs={PATCH_SETTINGS_TABS}
          active={patchTab}
          ariaLabel="Patch settings sections"
          onSelect={selectPatchTab}
        />
        <div role="tabpanel" className="pt-4">
          {patchTab === 'exp' && (
            <ControllerPanel
              preset={preset}
              connected={connected}
              onParamSelect={onExpParamSelect}
              onMinMax={onExpMinMax}
              sendCC={sendCC}
            />
          )}
          {patchTab === 'ctrl' && (
            <FootswitchPanel
              preset={preset}
              connected={connected}
              onCtrlBlockToggle={onCtrlBlockToggle}
              onCtrlClear={onCtrlClear}
            />
          )}
          {patchTab === 'bulk' && (
            <BulkApplySection
              connected={connected}
              canCopyCtrl={canCopyCtrl}
              progress={bulkApplyProgress}
              onApply={onBulkApply}
              onCancel={onCancelBulkApply}
            />
          )}
        </div>
      </MobileSheet>
    </div>
  );
}
