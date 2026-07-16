import { useCallback, useEffect, useRef, useState } from 'react';
import { usePreset } from '@/hooks/usePreset';
import { useMidiDevice } from '@/hooks/useMidiDevice';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { PRSTEncoder } from '@/core/PRSTEncoder';
import { convertHLX } from '@/core/HLXConverter';
import { pushPresetToDevice, type PushProgress } from '@/core/devicePush';
import { EFFECT_MAP } from '@/core/effectNames';
import type { GP200Preset } from '@/core/types';

import { FileUpload } from '@/components/FileUpload';
import { PedalBoard } from '@/components/board/PedalBoard';
import { DeviceStatusBar } from '@/components/DeviceStatusBar';
import { DeviceSlotBrowser } from '@/components/DeviceSlotBrowser';
import { FirmwareCompatDialog } from '@/components/FirmwareCompatDialog';
import { PatchSettingsCard } from '@/components/PatchSettingsCard';
import { ControllerPanel } from '@/components/ControllerPanel';
import { AmpHeadPanel } from '@/components/AmpHeadPanel';
import { FxLoopArrows } from '@/components/FxLoopArrows';
import { ExportPresetDialog } from '@/components/ExportPresetDialog';
import { Button } from '@/components/ui/Button';

function App() {
  const {
    preset, loadPreset, setPatchName, setAuthor, toggleEffect, changeEffect,
    reorderEffects, setParam, setFxLoopSend, setFxLoopReturn, reset,
  } = usePreset();
  const midiDevice = useMidiDevice();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [slotBrowserMode, setSlotBrowserMode] = useState<'pull' | 'push' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showAmpHead, setShowAmpHead] = useState(false);
  const [importedFromHLX, setImportedFromHLX] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [firmwareWarningDismissed, setFirmwareWarningDismissed] = useState(false);
  // Live-only device settings — not modeled in the .prst binary format, so
  // they aren't part of GP200Preset and don't round-trip through save/export.
  const [patchVolume, setPatchVolume] = useState(50);
  const [patchPan, setPatchPan] = useState(0);
  const [patchTempo, setPatchTempo] = useState(120);

  const [pushProgress, setPushProgress] = useState<PushProgress | null>(null);
  const pushAbortRef = useRef<AbortController | null>(null);

  // Synchronous view of the preset for device-message validation callbacks
  // (the callbacks are registered once per connection, so they'd otherwise
  // close over a stale preset).
  const presetRef = useRef<GP200Preset | null>(preset);
  presetRef.current = preset;

  // Reset the firmware warning once the device disconnects, so reconnecting
  // to a different (or updated) device shows the warning fresh if it applies.
  useEffect(() => {
    if (midiDevice.status === 'disconnected') setFirmwareWarningDismissed(false);
  }, [midiDevice.status]);

  // Send the whole preset to the device for live preview (no flash write).
  // Aborts any push still in flight so two loads never interleave on the wire.
  const sendPresetToDevice = useCallback(async (decoded: GP200Preset) => {
    if (midiDevice.status !== 'connected') return;
    pushAbortRef.current?.abort();
    const ac = new AbortController();
    pushAbortRef.current = ac;
    setPushProgress({ completed: 0, total: decoded.effects.length * 2, phase: 'configuring' });
    try {
      await pushPresetToDevice(
        decoded,
        {
          sendEffectChange: midiDevice.sendEffectChange,
          sendParamChange: midiDevice.sendParamChange,
          sendToggle: midiDevice.sendToggle,
          sendReorder: midiDevice.sendReorder,
          sendAuthor: midiDevice.sendAuthor,
        },
        {
          signal: ac.signal,
          onProgress: (p) => { if (!ac.signal.aborted) setPushProgress(p); },
        },
      );
    } finally {
      if (pushAbortRef.current === ac) pushAbortRef.current = null;
    }
    // midiDevice is a fresh object every render (see useMidiDevice/useMidiSend) —
    // depending on midiDevice.status alone avoids re-creating this callback (and
    // therefore re-triggering effects that depend on it) on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  // Clear the "done" push indicator a moment after it finishes.
  useEffect(() => {
    if (pushProgress?.phase !== 'done') return;
    const id = setTimeout(() => setPushProgress(null), 2000);
    return () => clearTimeout(id);
  }, [pushProgress]);

  // Abort an in-flight push the moment the device drops.
  useEffect(() => {
    if (midiDevice.status !== 'connected') {
      pushAbortRef.current?.abort();
      pushAbortRef.current = null;
      setPushProgress(null);
    }
  }, [midiDevice.status]);

  // Auto-start background loading of all 256 device preset names after connect.
  useEffect(() => {
    if (midiDevice.status === 'connected' && midiDevice.namesLoadProgress < 256) {
      midiDevice.loadPresetNames();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  // Mirror hardware-initiated changes (knob turns, on-device toggles/effect
  // swaps, slot changes) back into local state — the device is the source of
  // truth for its own editing buffer, which isn't reflected in saved data.
  useEffect(() => {
    if (midiDevice.status !== 'connected') return;
    midiDevice.setOnDeviceToggle((blockIndex, enabled) => toggleEffect(blockIndex, enabled));
    return () => midiDevice.setOnDeviceToggle(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  useEffect(() => {
    if (midiDevice.status !== 'connected') return;
    // Hardware footswitch toggles emit effect-change-shaped frames with the
    // effect id zeroed out (decodes to COMP). Validate before applying: the
    // id must exist, the block's module can't change on hardware, and a
    // same-id "change" is a toggle ack, not a swap — applying it would reset
    // the params to defaults. Return value tells the dispatcher whether to
    // suppress the FX-state messages that follow a real swap.
    midiDevice.setOnDeviceEffectChange((blockIndex, effectId) => {
      const slot = presetRef.current?.effects.find((e) => e.slotIndex === blockIndex);
      const next = EFFECT_MAP[effectId];
      if (!slot || !next) return false;
      if (slot.effectId === effectId) return false;
      const cur = EFFECT_MAP[slot.effectId];
      if (cur && cur.module !== next.module) return false;
      changeEffect(blockIndex, effectId);
      return true;
    });
    return () => midiDevice.setOnDeviceEffectChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  // Once connected, mirror the device's active preset into the editor — the
  // handshake already pulled it (midiDevice.currentPreset); the user shouldn't
  // have to press LOAD to see what their pedal is doing.
  useEffect(() => {
    if (midiDevice.status === 'connected' && midiDevice.currentPreset) {
      loadPreset(midiDevice.currentPreset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  useEffect(() => {
    if (midiDevice.status !== 'connected') return;
    midiDevice.setOnDeviceParamChange((blockIndex, paramIndex, value) => setParam(blockIndex, paramIndex, value));
    return () => midiDevice.setOnDeviceParamChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  useEffect(() => {
    if (midiDevice.status !== 'connected') return;
    midiDevice.setOnDeviceChange(async (slot) => {
      if (slot === null) return;
      try {
        const fresh = await midiDevice.pullPreset(slot);
        loadPreset(fresh);
      } catch {
        // Device slot switched but the read failed — keep showing the last
        // loaded preset rather than clearing the editor.
      }
    });
    return () => midiDevice.setOnDeviceChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [midiDevice.status]);

  const handleFile = useCallback((buffer: Uint8Array, filename: string) => {
    try {
      let decoded: GP200Preset;
      if (filename.toLowerCase().endsWith('.hlx')) {
        const text = new TextDecoder().decode(buffer);
        decoded = convertHLX(JSON.parse(text));
        setImportedFromHLX(true);
      } else {
        decoded = new PRSTDecoder(buffer).decode();
        setImportedFromHLX(false);
      }
      loadPreset(decoded);
      void sendPresetToDevice(decoded);
      setLoadError(null);
    } catch (err) {
      setLoadError(`Error loading file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [loadPreset, sendPresetToDevice]);

  function handleExportConfirm(name: string, author?: string) {
    if (!preset) return;
    setPatchName(name);
    if (author !== undefined) setAuthor(author);
    const encoded = new PRSTEncoder().encode({ ...preset, patchName: name, author });
    const blob = new Blob([encoded], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'preset'}.prst`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportDialog(false);
  }

  async function handlePullConfirm(slot: number) {
    setSlotBrowserMode(null);
    try {
      const pulled = await midiDevice.pullPreset(slot);
      loadPreset(pulled);
      if (midiDevice.status === 'connected') midiDevice.sendSlotChange(slot);
      setLoadError(null);
    } catch {
      setLoadError('Failed to load preset from device');
    }
  }

  async function handlePushConfirm(slot: number) {
    if (!preset) return;
    try {
      await midiDevice.writePresetToSlot(preset, slot);
      setLoadError(null);
    } catch {
      setLoadError('Failed to save to device');
    } finally {
      setSlotBrowserMode(null);
    }
  }

  async function handleSaveToActiveSlot() {
    if (!preset || midiDevice.currentSlot === null) return;
    await midiDevice.saveToSlot(preset.patchName, midiDevice.currentSlot);
  }

  function handleOpenBrowser(mode: 'pull' | 'push') {
    setSlotBrowserMode(mode);
    if (midiDevice.namesLoadProgress < 256) midiDevice.loadPresetNames();
  }

  // Slot mutation handlers shared by the list view and the board view:
  // update local preset state, mirror to the device when connected.
  const handleSlotToggle = useCallback((slotIndex: number, currentlyEnabled: boolean) => {
    toggleEffect(slotIndex);
    if (midiDevice.status === 'connected') midiDevice.sendToggle(slotIndex, !currentlyEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toggleEffect, midiDevice.status]);

  const handleSlotEffectChange = useCallback((slotIndex: number, effectId: number) => {
    changeEffect(slotIndex, effectId);
    if (midiDevice.status === 'connected') midiDevice.sendEffectChange(slotIndex, effectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeEffect, midiDevice.status]);

  const handleSlotParamChange = useCallback((slotIndex: number, effectId: number, paramIndex: number, value: number) => {
    setParam(slotIndex, paramIndex, value);
    if (midiDevice.status === 'connected') midiDevice.sendParamChange(slotIndex, paramIndex, effectId, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParam, midiDevice.status]);

  const handleDragStart = useCallback((index: number) => setDragIndex(index), []);
  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  // Shared by drag-and-drop and keyboard reordering. slotIndex (the immutable
  // PRST block identity) is preserved by reorderEffects — only array order changes.
  const moveSlot = useCallback((fromIndex: number, toIndex: number) => {
    if (!preset) return;
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= preset.effects.length) return;
    reorderEffects(fromIndex, toIndex);
    if (midiDevice.status === 'connected') {
      const order = preset.effects.map((e) => e.slotIndex);
      const [moved] = order.splice(fromIndex, 1);
      order.splice(toIndex, 0, moved);
      midiDevice.sendReorder(order, preset.fxLoopSend, preset.fxLoopReturn);
    }
  }, [preset, reorderEffects, midiDevice]);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragIndex !== null) moveSlot(dragIndex, toIndex);
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, moveSlot]);

  const firmwareOk = midiDevice.deviceInfo?.versionAccepted ?? false;
  const showFirmwareDialog =
    midiDevice.status === 'connected' &&
    midiDevice.deviceInfo !== null &&
    !firmwareOk &&
    !firmwareWarningDismissed;

  if (!preset) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8 p-4 rounded-lg border border-accent-amber/20 bg-accent-amber/[0.03]">
          <DeviceStatusBar
            midiDevice={midiDevice}
            currentPresetName={null}
            hasPreset={false}
            onPullRequest={() => handleOpenBrowser('pull')}
            onPushRequest={() => {}}
          />
          {midiDevice.status === 'disconnected' && (
            <p className="text-caption mt-2 text-text-muted">
              Connect your GP-200 over USB, or load a preset file below.
            </p>
          )}
        </div>

        <h1 className="font-mono-display text-2xl font-bold tracking-tight text-text-primary mb-8">
          Preset Forge Editor
        </h1>

        <FileUpload onFile={handleFile} />

        {loadError && (
          <div className="mt-4 px-4 py-3 rounded-lg font-mono-display text-sm flex items-center justify-between bg-accent-red/10 border border-accent-red/30 text-accent-red">
            <span>{loadError}</span>
            <button onClick={() => setLoadError(null)} className="ml-3 font-bold">✕</button>
          </div>
        )}

        {slotBrowserMode && (
          <DeviceSlotBrowser
            mode={slotBrowserMode}
            presetNames={midiDevice.presetNames}
            namesLoadProgress={midiDevice.namesLoadProgress}
            currentSlot={midiDevice.currentSlot}
            onConfirm={handlePullConfirm}
            onCancel={() => setSlotBrowserMode(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="sticky top-0 z-30 px-4 pt-3 pb-2 bg-bg-primary">
        <DeviceStatusBar
          midiDevice={midiDevice}
          currentPresetName={preset.patchName}
          hasPreset
          onPullRequest={() => handleOpenBrowser('pull')}
          onPushRequest={() => handleOpenBrowser('push')}
          onSaveToActiveSlot={midiDevice.status === 'connected' ? handleSaveToActiveSlot : undefined}
          onPresetNameChange={setPatchName}
          pushProgress={pushProgress}
        />
      </div>

      {importedFromHLX && (
        <div className="mx-4 mb-2 px-3 py-1.5 rounded-lg font-mono-display text-caption tracking-wider uppercase inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 text-purple-400">
          EXPERIMENTAL — imported from Line6 HX Stomp (.hlx)
        </div>
      )}

      {/* THE view: full-bleed pedalboard */}
      <div onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}>
        <PedalBoard
          preset={preset}
          onToggle={handleSlotToggle}
          onChangeEffect={handleSlotEffectChange}
          onParamChange={handleSlotParamChange}
          onMove={moveSlot}
          dragIndex={dragIndex}
          dragOverIndex={dragOverIndex}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          patchVolume={patchVolume}
          patchPan={patchPan}
          patchTempo={patchTempo}
          currentSlot={midiDevice.currentSlot}
          connected={midiDevice.status === 'connected'}
          onLoadRequest={() => handleOpenBrowser('pull')}
          onSaveToActiveSlot={midiDevice.status === 'connected' ? handleSaveToActiveSlot : undefined}
        />
      </div>

      {/* everything else lives below the board */}
      <div className="max-w-6xl mx-auto p-8 pt-6">
        <div className="flex gap-1 mb-3 flex-wrap items-center">
          <button
            onClick={() => setShowAmpHead((v) => !v)}
            className={`font-mono-display text-label font-bold tracking-wider uppercase px-3 py-1.5 rounded transition-colors border ${
              showAmpHead ? 'bg-accent-amber/[0.12] border-accent-amber/30 text-accent-amber' : 'bg-white/[0.03] border-white/[0.06] text-text-muted'
            }`}
          >
            AMP
          </button>
        </div>

        {showAmpHead && (
          <AmpHeadPanel
            preset={preset}
            onParamChange={(slotIndex, paramIndex, value) => {
              setParam(slotIndex, paramIndex, value);
              if (midiDevice.status === 'connected') {
                const eff = preset.effects.find((e) => e.slotIndex === slotIndex);
                if (eff) midiDevice.sendParamChange(slotIndex, paramIndex, eff.effectId, value);
              }
            }}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl p-4 flex flex-col gap-3 border border-white/[0.06] bg-white/[0.02]">
            <label className="text-label uppercase tracking-wider text-text-secondary" htmlFor="patch-name">
              Patch Name
            </label>
            <input
              id="patch-name"
              value={preset.patchName}
              onChange={(e) => setPatchName(e.target.value.slice(0, 16))}
              maxLength={16}
              className="w-full rounded px-3 py-2 text-sm bg-bg-input border border-border-active text-text-primary focus:outline-none"
            />
            <label className="text-label uppercase tracking-wider text-text-secondary" htmlFor="patch-author">
              Author
            </label>
            <input
              id="patch-author"
              value={preset.author ?? ''}
              onChange={(e) => setAuthor(e.target.value.slice(0, 16))}
              maxLength={16}
              className="w-full rounded px-3 py-2 text-sm bg-bg-input border border-border-active text-text-primary focus:outline-none"
            />
          </div>
          <PatchSettingsCard
            volume={patchVolume}
            pan={patchPan}
            tempo={patchTempo}
            connected={midiDevice.status === 'connected'}
            onVolumeChange={(v) => { setPatchVolume(v); if (midiDevice.status === 'connected') midiDevice.sendPatchVolume(v); }}
            onPanChange={(v) => { setPatchPan(v); if (midiDevice.status === 'connected') midiDevice.sendPatchPan(v); }}
            onTempoChange={(v) => { setPatchTempo(v); if (midiDevice.status === 'connected') midiDevice.sendPatchTempo(v); }}
          />
        </div>

        <p role="note" className="md:hidden text-xs rounded-lg px-3 py-2 mb-3 text-text-secondary bg-bg-surface border border-border-subtle">
          The editor works best on a desktop or large tablet — drag-and-drop reordering and the fine parameter sliders are tricky on small touch screens.
        </p>

        <FxLoopArrows
          send={preset.fxLoopSend}
          ret={preset.fxLoopReturn}
          onSendChange={(pos) => {
            const clamped = Math.max(1, Math.min(10, pos));
            const nextReturn = Math.max(clamped, preset.fxLoopReturn);
            const sendChanged = clamped !== preset.fxLoopSend;
            const returnPushed = nextReturn !== preset.fxLoopReturn;
            setFxLoopSend(clamped);
            if (midiDevice.status === 'connected') {
              const order = preset.effects.map((e) => e.slotIndex);
              if (sendChanged) midiDevice.sendFxLoopMove(order, clamped, nextReturn, 'send');
              if (returnPushed) midiDevice.sendFxLoopMove(order, clamped, nextReturn, 'return');
            }
          }}
          onReturnChange={(pos) => {
            const clamped = Math.max(1, Math.min(10, pos));
            const nextSend = Math.min(clamped, preset.fxLoopSend);
            const returnChanged = clamped !== preset.fxLoopReturn;
            const sendPushed = nextSend !== preset.fxLoopSend;
            setFxLoopReturn(clamped);
            if (midiDevice.status === 'connected') {
              const order = preset.effects.map((e) => e.slotIndex);
              if (returnChanged) midiDevice.sendFxLoopMove(order, nextSend, clamped, 'return');
              if (sendPushed) midiDevice.sendFxLoopMove(order, nextSend, clamped, 'send');
            }
          }}
        />

        <div className="flex items-center gap-2 flex-wrap mb-8">
          <Button variant="primary" onClick={() => setShowExportDialog(true)}>
            Export .prst
          </Button>
          <Button variant="ghost" onClick={reset}>
            Close preset
          </Button>
        </div>

        <ControllerPanel
          preset={preset}
          connected={midiDevice.status === 'connected'}
          onParamSelect={(page, item, blockIndex, paramIdx) => midiDevice.sendExpParamSelect(page, item, blockIndex, paramIdx)}
          onMinMax={(page, item, min, max) => midiDevice.sendExpMinMax(page, item, min, max)}
        />

        {loadError && (
          <div className="mt-4 px-4 py-3 rounded-lg font-mono-display text-sm flex items-center justify-between bg-accent-red/10 border border-accent-red/30 text-accent-red">
            <span>{loadError}</span>
            <button onClick={() => setLoadError(null)} className="ml-3 font-bold">✕</button>
          </div>
        )}
      </div>

      {slotBrowserMode && (
        <DeviceSlotBrowser
          mode={slotBrowserMode}
          presetNames={midiDevice.presetNames}
          namesLoadProgress={midiDevice.namesLoadProgress}
          currentSlot={midiDevice.currentSlot}
          onConfirm={slotBrowserMode === 'pull' ? handlePullConfirm : handlePushConfirm}
          onCancel={() => setSlotBrowserMode(null)}
        />
      )}

      {showFirmwareDialog && midiDevice.deviceInfo && (
        <FirmwareCompatDialog
          detectedVersion={midiDevice.deviceInfo.firmwareValues.join('.') || 'unknown'}
          onContinue={() => setFirmwareWarningDismissed(true)}
          onDisconnect={() => { midiDevice.disconnect(); setFirmwareWarningDismissed(true); }}
        />
      )}

      <ExportPresetDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        initialName={preset.patchName}
        initialAuthor={preset.author}
        onConfirm={handleExportConfirm}
      />
    </div>
  );
}

export default App;
