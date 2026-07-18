import { useState } from 'react';
import type { PushProgress } from '@/core/devicePush';
import { SysExCodec } from '@/core/SysExCodec';
import { tunerShow, type CCCommand } from '@/core/ccControl';
import { ActionIcon } from './ActionIcon';

interface BoardTopBarProps {
  connected: boolean;
  currentSlot: number | null;
  firmware: string | null;
  pushProgress: PushProgress | null;
  onLoadRequest: () => void;
  onPushRequest: () => void;
  onOpenPatchManager: () => void;
  onConnectRequest: () => void;
  onDisconnect: () => void;
  onCloseRequest: () => void;
  onOpenGuide: () => void;
  /* feature drawers + device tuner remote (moved up from the deck) */
  onOpenLooper: () => void;
  onOpenDrums: () => void;
  sendCC: (command: CCCommand | CCCommand[]) => void;
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

function tunerBtnClass(open: boolean): string {
  if (open) return 'deck-btn primary';
  return 'deck-btn';
}

/**
 * Sticky top bar owning the non-patch device actions (device load/save-as,
 * patch manager incl. .prst file import/export, connect/close) and the
 * session status readout, split out of the deck so the bottom deck holds
 * only patch edits.
 */
export function BoardTopBar({
  connected,
  currentSlot,
  firmware,
  pushProgress,
  onLoadRequest,
  onPushRequest,
  onOpenPatchManager,
  onConnectRequest,
  onDisconnect,
  onCloseRequest,
  onOpenGuide,
  onOpenLooper,
  onOpenDrums,
  sendCC,
}: BoardTopBarProps) {
  // Device tuner toggle (CC58). Local best-effort state: the pedal doesn't
  // report tuner visibility, so a front-panel close can drift this until the
  // next click resyncs it.
  const [tunerOpen, setTunerOpen] = useState(false);

  let slotLabel = '-';
  if (currentSlot !== null) slotLabel = SysExCodec.slotToLabel(currentSlot);
  let firmwareTitle: string | undefined;
  if (firmware) firmwareTitle = `GP-200 firmware ${firmware}`;
  let dotClass = 'deck-dot';
  if (connected) dotClass = 'deck-dot on';

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
        <button
          type="button"
          className="deck-btn"
          title="Multi-track loop station (records the GP-200's USB audio)"
          onClick={onOpenLooper}
        >
          <ActionIcon name="loop" />
          <span className="db-label">LOOP</span>
        </button>
        <button
          type="button"
          className="deck-btn"
          title="GP-200 built-in drum machine, looper & tuner (MIDI CC remote)"
          onClick={onOpenDrums}
        >
          <ActionIcon name="drums" />
          <span className="db-label">DRUMS</span>
        </button>
        <button
          type="button"
          className={tunerBtnClass(tunerOpen)}
          disabled={!connected}
          title="Open/close the tuner on the GP-200's screen"
          onClick={() => {
            const next = !tunerOpen;
            setTunerOpen(next);
            sendCC(tunerShow(next));
          }}
        >
          <ActionIcon name="tuner" />
          <span className="db-label">TUNER</span>
        </button>
        <button
          type="button"
          className="deck-btn"
          title="Browse device patches · import/export .prst files"
          onClick={onOpenPatchManager}
        >
          <ActionIcon name="patches" />
          <span className="db-label">PATCHES</span>
        </button>
        {connected && (
          <>
            <button type="button" className="deck-btn" onClick={onLoadRequest}>
              <ActionIcon name="load" />
              <span className="db-label">LOAD</span>
            </button>
            <button
              type="button"
              className="deck-btn"
              title="Save to another slot"
              onClick={onPushRequest}
            >
              <ActionIcon name="save" />
              <span className="db-label">SAVE AS</span>
            </button>
            <button
              type="button"
              className="deck-btn quiet"
              title="Disconnect device"
              aria-label="Disconnect device"
              onClick={onDisconnect}
            >
              <ActionIcon name="disconnect" />
            </button>
          </>
        )}
        {!connected && (
          <button type="button" className="deck-btn primary" onClick={onConnectRequest}>
            <ActionIcon name="connect" />
            <span className="db-label">CONNECT GP-200</span>
          </button>
        )}
        <button
          type="button"
          className="deck-btn quiet"
          title="Open the guide"
          aria-label="Open guide"
          onClick={onOpenGuide}
        >
          <ActionIcon name="guide" />
        </button>
        <button
          type="button"
          className="deck-btn quiet"
          title="Close preset"
          onClick={onCloseRequest}
        >
          <ActionIcon name="close" />
          <span className="db-label">CLOSE</span>
        </button>
      </div>
    </div>
  );
}
