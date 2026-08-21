import { useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PatchPicker } from './PatchPicker';
import { SysExCodec } from '@/core/SysExCodec';
import {
  EMPTY_SELECTION,
  collapseToAnchor,
  selectAll,
  selectSlot,
  selectedSlots as slotsOf,
  type SlotSelection,
} from '@/core/slotSelection';

export interface BulkExportProgress {
  done: number;
  total: number;
}

export interface PatchManagerSheetProps {
  open: boolean;
  onClose: () => void;
  connected: boolean;
  presetNames: (string | null)[];
  namesLoadProgress: number;
  /** True while the background pass is re-verifying cache-seeded names. */
  namesSyncing?: boolean;
  currentSlot: number | null;
  onActivate: (slot: number) => Promise<void>;
  onOpenInEditor: (slot: number) => Promise<void>;
  onExportSlot: (slot: number) => Promise<void>;
  onExportSlots: (slots: number[]) => Promise<void>;
  bulkProgress: BulkExportProgress | null;
  onCancelBulk: () => void;
  onImportToSlot: (slot: number, bytes: Uint8Array) => Promise<void>;
  /** Read a slot into the in-app clipboard. */
  onCopySlot: (slot: number) => Promise<void>;
  /** Write the clipboard into a slot. */
  onPasteToSlot: (slot: number) => Promise<void>;
  /** Exchange the contents of two slots. */
  onSwapSlots: (first: number, second: number) => Promise<void>;
  /** Label of whatever is on the clipboard, or null when it is empty. */
  clipboardLabel: string | null;
  onRenameSlot: (slot: number, name: string) => Promise<void>;
  onRefreshNames: () => void;
  /** Load a .prst into the editor buffer (pushes + saves when connected). */
  onImportFile: (bytes: Uint8Array) => void;
  /** Open the editor's export-preset dialog for the current patch. */
  onExportRequest: () => void;
  /** User-IR slot names enumerated at connect (30 entries; empty offline). */
  userIrNames: string[];
}

function bankSlotsOf(slot: number): number[] {
  const base = Math.floor(slot / 4) * 4;
  return [base, base + 1, base + 2, base + 3];
}


/**
 * Right-anchored side sheet listing all 256 device slots (64 banks × A–D)
 * with search, activate, open-in-editor, rename, per-slot .prst export /
 * import, and bulk export (bank / all → single .zip). Also hosts the
 * editor-buffer FILE row (import/export the current patch as .prst), which
 * works without a connected device. The pedalboard stays visible so slot
 * browsing is audible/visible in context.
 */
export function PatchManagerSheet({
  open,
  onClose,
  connected,
  presetNames,
  namesLoadProgress,
  namesSyncing = false,
  currentSlot,
  onActivate,
  onOpenInEditor,
  onExportSlot,
  onExportSlots,
  bulkProgress,
  onCancelBulk,
  onImportToSlot,
  onCopySlot,
  onPasteToSlot,
  onSwapSlots,
  clipboardLabel,
  onRenameSlot,
  onRefreshNames,
  onImportFile,
  onExportRequest,
  userIrNames,
}: PatchManagerSheetProps) {
  // Anchor + extras. The anchor is what every single-slot action acts on, so
  // multi-select sits on top of those buttons without changing them.
  const [selection, setSelection] = useState<SlotSelection>(EMPTY_SELECTION);
  const selected = selection.anchor;
  const [irListOpen, setIrListOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmImportSlot, setConfirmImportSlot] = useState<number | null>(null);
  const pendingImportRef = useRef<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorFileInputRef = useRef<HTMLInputElement>(null);

  const namesLoading = namesLoadProgress < 256;
  const bulkRunning = bulkProgress !== null;
  const actionsDisabled = !connected || selected === null || busy || bulkRunning;

  let selectedLabel = '';
  if (selected !== null) selectedLabel = SysExCodec.slotToLabel(selected);
  let currentLabel = '-';
  if (currentSlot !== null) currentLabel = SysExCodec.slotToLabel(currentSlot);

  const selectedSlots = slotsOf(selection);

  function handleSelect(slot: number, modifiers?: { shift: boolean; toggle: boolean }) {
    setRenaming(false);
    setSelection((prev) => selectSlot(prev, slot, modifiers));
  }

  function selectBank() {
    if (selected === null) return;
    setSelection((prev) => selectAll(prev, bankSlotsOf(selected)));
  }

  function clearSelection() {
    setSelection(collapseToAnchor);
  }

  function handleActivateFromPicker(slot: number) {
    if (connected) void runBusy(() => onActivate(slot));
  }

  async function runBusy(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function startRename() {
    if (selected === null) return;
    setRenameValue(presetNames[selected] ?? '');
    setRenaming(true);
  }

  async function commitRename() {
    if (selected === null || !renameValue.trim()) {
      setRenaming(false);
      return;
    }
    const name = renameValue.trim().slice(0, 16);
    setRenaming(false);
    await runBusy(() => onRenameSlot(selected, name));
  }

  function handleImportPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || selected === null) return;
    const targetSlot = selected;
    const reader = new FileReader();
    reader.onload = (ev) => {
      pendingImportRef.current = new Uint8Array(ev.target!.result as ArrayBuffer);
      setConfirmImportSlot(targetSlot);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  async function confirmImport() {
    const slot = confirmImportSlot;
    const bytes = pendingImportRef.current;
    setConfirmImportSlot(null);
    pendingImportRef.current = null;
    if (slot === null || !bytes) return;
    await runBusy(() => onImportToSlot(slot, bytes));
  }

  function handleEditorFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onImportFile(new Uint8Array(ev.target!.result as ArrayBuffer));
      onClose();
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  }

  function handleEditorExport() {
    // Close before opening ExportPresetDialog: a stacked Dialog would
    // double-bind the document Escape handler and fight this focus trap.
    onClose();
    onExportRequest();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Patch Manager"
      placement="right"
      maxWidth="max-w-2xl"
      padding="p-0"
      className="flex flex-col"
      closeOnOverlayClick={!busy && !bulkRunning}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-active)' }}
      >
        <span className="font-mono-display font-bold" style={{ color: 'var(--text-primary)' }}>
          PATCHES
        </span>
        <span
          className="font-mono-display text-caption"
          style={{ color: 'var(--text-muted)' }}
        >
          now: {currentLabel}
        </span>
        {namesSyncing && !namesLoading && (
          <span
            className="font-mono-display text-caption"
            style={{ color: 'var(--text-muted)' }}
            title="Verifying cached names against the device"
          >
            syncing…
          </span>
        )}
        <button
          type="button"
          onClick={onRefreshNames}
          disabled={!connected || namesLoading || namesSyncing || bulkRunning}
          className="font-mono-display text-caption px-2 py-0.5 rounded disabled:opacity-40"
          style={{ border: '1px solid rgba(0,0,0,0.20)', color: 'var(--text-muted)' }}
          title="Re-read all slot names from the device"
        >
          REFRESH
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto"
          aria-label="Close patch manager"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Editor-buffer file I/O: works offline, unlike the per-slot actions */}
      <div
        className="flex items-center gap-2 px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-active)' }}
      >
        <span
          className="font-mono-display text-caption"
          style={{ color: 'var(--text-muted)' }}
        >
          FILE
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => editorFileInputRef.current?.click()}
          title="Load a .prst file into the editor (pushes + saves to the pedal when connected)"
        >
          IMPORT .PRST
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleEditorExport}
          title="Name and download the editor's current patch as a .prst file"
        >
          EXPORT .PRST
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => window.print()}
          title="Print a rig sheet: this patch, its footswitches, and the slot list"
        >
          PRINT
        </Button>
        <input
          ref={editorFileInputRef}
          type="file"
          accept=".prst"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleEditorFilePick}
        />
      </div>

      {/* User-IR slots, enumerated once per connect. Read-only: the IR
          import/rename/delete write side is pending its protocol decode
          (docs/protocol-capture.md §3). */}
      {connected && userIrNames.length > 0 && (
        <div
          className="px-4 py-2 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-active)' }}
        >
          <button
            type="button"
            onClick={() => setIrListOpen(!irListOpen)}
            aria-expanded={irListOpen}
            className="font-mono-display text-caption flex items-center gap-2"
            style={{ color: 'var(--text-muted)' }}
            title="Cabinet impulse responses stored on the device"
          >
            {irListOpen && <span aria-hidden="true">▾</span>}
            {!irListOpen && <span aria-hidden="true">▸</span>}
            USER IRS ({userIrNames.length})
          </button>
          {irListOpen && (
            <ol
              className="mt-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-x-4
                font-mono-display text-caption"
              style={{ color: 'var(--text-secondary)' }}
            >
              {userIrNames.map((irName, slotPosition) => (
                // index IS the identity here: User-IR slots are positional on
                // the device, and duplicate default names are expected
                <li key={slotPosition} className="flex gap-2 py-0.5">
                  <span style={{ color: 'var(--text-muted)' }}>
                    {String(slotPosition + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate">{irName || '—'}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Name-loading progress */}
      {connected && namesLoading && (
        <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0">
          <span
            className="font-mono-display shrink-0"
            style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}
          >
            Loading names… {namesLoadProgress}/256
          </span>
          <div
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.12)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(namesLoadProgress / 256) * 100}%`,
                background: 'var(--accent)',
              }}
            />
          </div>
        </div>
      )}

      {!connected && (
        <p
          className="font-mono-display text-caption px-4 py-2 flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
        >
          Connect the GP-200 to browse and manage its patches. The FILE row
          above works offline on the editor’s current patch.
        </p>
      )}

      {/* Patch browser */}
      <div className="flex-1 min-h-0 flex flex-col px-2 pb-2">
        <PatchPicker
          presetNames={presetNames}
          namesLoadProgress={namesLoadProgress}
          currentSlot={currentSlot}
          selected={selected}
          multiSelected={selection.extra}
          onSelect={handleSelect}
          onActivate={handleActivateFromPicker}
        />
      </div>

      {/* Selected-slot actions */}
      <div
        className="px-4 py-3 space-y-2 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border-active)' }}
      >
        {renaming && selected !== null && (
          <div className="flex items-center gap-2">
            <span
              className="font-mono-display text-caption flex-shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              {selectedLabel}
            </span>
            <input
              value={renameValue}
              maxLength={16}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value.slice(0, 16))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className="flex-1 font-mono-display text-sm rounded px-2 py-1"
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.12)',
                color: 'var(--text-primary)',
              }}
            />
            <Button size="sm" onClick={() => void commitRename()}>OK</Button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onActivate(selected));
            }}
            title="Switch the device to this slot"
          >
            ACTIVATE
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onOpenInEditor(selected));
            }}
            title="Pull this slot into the editor"
          >
            OPEN
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onExportSlot(selected));
            }}
            title="Download this slot as a .prst file"
          >
            EXPORT
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={() => fileInputRef.current?.click()}
            title="Import a .prst file into this slot"
          >
            IMPORT→{selectedLabel || 'SLOT'}
          </Button>
          <Button
            size="sm"
            disabled={actionsDisabled}
            onClick={startRename}
            title="Rename this slot (briefly switches patches)"
          >
            RENAME
          </Button>
        </div>

        {/* Selection + arrange. Shift-click a second row for a range,
            ctrl/cmd-click to pick slots one at a time. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="font-mono-display text-caption"
            style={{ color: 'var(--text-muted)' }}
            role="status"
            aria-live="polite"
          >
            {selectedSlots.length > 1 ? `${selectedSlots.length} selected` : 'shift/ctrl-click to select more'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={selected === null || busy || bulkRunning}
            onClick={selectBank}
            title="Select all four slots in this bank"
          >
            SELECT BANK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedSlots.length < 2 || busy || bulkRunning}
            onClick={clearSelection}
            title="Reduce the selection back to one slot"
          >
            CLEAR
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void runBusy(() => onCopySlot(selected));
            }}
            title="Copy this patch into the app clipboard"
          >
            COPY
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || clipboardLabel === null}
            onClick={() => {
              if (selected !== null) void runBusy(() => onPasteToSlot(selected));
            }}
            title={clipboardLabel
              ? `Overwrite ${selectedLabel} with the copied patch (${clipboardLabel})`
              : 'Copy a patch first'}
          >
            PASTE{clipboardLabel ? ` (${clipboardLabel})` : ''}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedSlots.length !== 2 || !connected || busy || bulkRunning}
            onClick={() => {
              if (selectedSlots.length === 2) {
                void runBusy(() => onSwapSlots(selectedSlots[0], selectedSlots[1]));
              }
            }}
            title="Exchange the two selected patches"
          >
            SWAP
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || selectedSlots.length !== 1 || selected === 0}
            onClick={() => {
              if (selected !== null && selected > 0) {
                const target = selected - 1;
                void runBusy(async () => {
                  await onSwapSlots(target, selected);
                  setSelection({ anchor: target, extra: new Set() });
                });
              }
            }}
            title="Swap this patch with the slot above it"
          >
            ▲ UP
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled || selectedSlots.length !== 1 || selected === 255}
            onClick={() => {
              if (selected !== null && selected < 255) {
                const target = selected + 1;
                void runBusy(async () => {
                  await onSwapSlots(selected, target);
                  setSelection({ anchor: target, extra: new Set() });
                });
              }
            }}
            title="Swap this patch with the slot below it"
          >
            ▼ DOWN
          </Button>
        </div>

        {/* Bulk actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={selectedSlots.length < 2 || !connected || busy || bulkRunning}
            onClick={() => void onExportSlots(selectedSlots)}
            title="Download every selected slot as .prst files in a ZIP"
          >
            EXPORT SELECTED
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void onExportSlots(bankSlotsOf(selected));
            }}
            title="Download this bank (4 slots) as .prst files in a ZIP"
          >
            EXPORT BANK
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!connected || busy || bulkRunning}
            onClick={() => {
              void onExportSlots(Array.from({ length: 256 }, (_, slot) => slot));
            }}
            title="Download all 256 slots as .prst files in a ZIP"
          >
            EXPORT ALL
          </Button>
          {bulkRunning && (
            <span
              className="font-mono-display text-caption flex items-center gap-2"
              style={{ color: 'var(--text-muted)' }}
              role="status"
              aria-live="polite"
            >
              {bulkProgress.done}/{bulkProgress.total}
              <button
                type="button"
                onClick={onCancelBulk}
                className="underline"
                style={{ color: 'var(--accent-red, #c05050)' }}
              >
                cancel
              </button>
            </span>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".prst"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleImportPick}
        />
      </div>

      {/* Overwrite confirmation, inline (a nested Dialog would double-bind
          the document Escape handler and close the whole sheet) */}
      {confirmImportSlot !== null && (
        <div
          role="alertdialog"
          aria-label="Confirm overwrite"
          className="px-4 py-3 flex-shrink-0"
          style={{
            borderTop: '1px solid var(--accent-red, #c05050)',
            background: 'rgba(192,80,80,0.06)',
          }}
        >
          <p className="font-mono-display text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
            Overwrite {SysExCodec.slotToLabel(confirmImportSlot)}
            {' '}“{presetNames[confirmImportSlot] ?? '-'}” on the device?
            This cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmImportSlot(null)}
            >
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={() => void confirmImport()}>
              Overwrite
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
