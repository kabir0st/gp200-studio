import { useRef } from 'react';
import type { PushProgress } from '@/core/devicePush';
import { SysExCodec } from '@/core/SysExCodec';
import { PRST_FILE_IO_DISABLED } from '@/components/prstFileIo';

interface BoardTopBarProps {
  connected: boolean;
  currentSlot: number | null;
  firmware: string | null;
  pushProgress: PushProgress | null;
  onImportFile: (buffer: Uint8Array) => void;
  onExportRequest: () => void;
  onLoadRequest: () => void;
  onPushRequest: () => void;
  onOpenPatchManager: () => void;
  onConnectRequest: () => void;
  onDisconnect: () => void;
  onCloseRequest: () => void;
  onOpenGuide: () => void;
}

function connectionLabel(connected: boolean, firmware: string | null): string {
  if (!connected) return 'OFFLINE';
  if (firmware) return `USB-MIDI · FW ${firmware}`;
  return 'USB-MIDI';
}

function syncLabel(pushProgress: PushProgress): string {
  if (pushProgress.phase === 'done') return '✓ SENT';
  return `SYNC ${pushProgress.completed}/${pushProgress.total}`;
}

/**
 * Sticky top bar owning the non-patch file + device actions (import/export,
 * device load/save-as, patch manager, connect/close) and the session status
 * readout, split out of the deck so the bottom deck holds only patch edits.
 */
export function BoardTopBar({
  connected,
  currentSlot,
  firmware,
  pushProgress,
  onImportFile,
  onExportRequest,
  onLoadRequest,
  onPushRequest,
  onOpenPatchManager,
  onConnectRequest,
  onDisconnect,
  onCloseRequest,
  onOpenGuide,
}: BoardTopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  let slotLabel = '-';
  if (currentSlot !== null) slotLabel = SysExCodec.slotToLabel(currentSlot);
  let firmwareTitle: string | undefined;
  if (firmware) firmwareTitle = `GP-200 firmware ${firmware}`;
  let dotClass = 'deck-dot';
  if (connected) dotClass = 'deck-dot on';

  function handleFilePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loaded) => {
      onImportFile(new Uint8Array(loaded.target!.result as ArrayBuffer));
    };
    reader.readAsArrayBuffer(file);
    event.target.value = ''; // allow re-importing the same file
  }

  let syncClass = 'deck-sync';
  if (pushProgress && pushProgress.phase === 'done') syncClass = 'deck-sync done';

  return (
    <div className="board-topbar">
      <div className="board-topbar-status">
        <span className={dotClass} aria-hidden="true" />
        <span className="deck-slot">{slotLabel}</span>
        <span className="deck-conn" title={firmwareTitle}>
          {connectionLabel(connected, firmware)}
        </span>
        {pushProgress && (
          <span className={syncClass} role="status" aria-live="polite">
            {syncLabel(pushProgress)}
          </span>
        )}
      </div>

      <div className="board-topbar-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept=".prst"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFilePick}
        />
        <button
          type="button"
          className="deck-btn"
          disabled={PRST_FILE_IO_DISABLED}
          title="Temporarily disabled"
          onClick={() => fileInputRef.current?.click()}
        >
          IMPORT
        </button>
        <button
          type="button"
          className="deck-btn"
          disabled={PRST_FILE_IO_DISABLED}
          title="Temporarily disabled"
          onClick={onExportRequest}
        >
          EXPORT
        </button>
        {connected && (
          <>
            <button
              type="button"
              className="deck-btn"
              title="Browse and manage all device patches"
              onClick={onOpenPatchManager}
            >
              PATCHES
            </button>
            <button type="button" className="deck-btn" onClick={onLoadRequest}>
              LOAD
            </button>
            <button
              type="button"
              className="deck-btn"
              title="Save to another slot"
              onClick={onPushRequest}
            >
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
        )}
        {!connected && (
          <button type="button" className="deck-btn primary" onClick={onConnectRequest}>
            CONNECT GP-200
          </button>
        )}
        <button
          type="button"
          className="deck-btn quiet"
          title="Open the guide"
          aria-label="Open guide"
          onClick={onOpenGuide}
        >
          ?
        </button>
        <button
          type="button"
          className="deck-btn quiet"
          title="Close preset"
          onClick={onCloseRequest}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
