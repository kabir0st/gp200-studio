import { useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { SlotGrid } from './SlotGrid';
import { SysExCodec } from '@/core/SysExCodec';

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
  currentSlot: number | null;
  onActivate: (slot: number) => void;
  onOpenInEditor: (slot: number) => Promise<void>;
  onExportSlot: (slot: number) => Promise<void>;
  onExportSlots: (slots: number[]) => Promise<void>;
  bulkProgress: BulkExportProgress | null;
  onCancelBulk: () => void;
  onImportToSlot: (slot: number, bytes: Uint8Array) => Promise<void>;
  onRenameSlot: (slot: number, name: string) => Promise<void>;
  onRefreshNames: () => void;
}

function bankSlotsOf(slot: number): number[] {
  const base = Math.floor(slot / 4) * 4;
  return [base, base + 1, base + 2, base + 3];
}

/**
 * Right-anchored side sheet listing all 256 device slots (64 banks × A–D)
 * with search, activate, open-in-editor, rename, per-slot .prst export /
 * import, and bulk export (bank / all → single .zip). The pedalboard stays
 * visible so slot browsing is audible/visible in context.
 */
export function PatchManagerSheet({
  open,
  onClose,
  connected,
  presetNames,
  namesLoadProgress,
  currentSlot,
  onActivate,
  onOpenInEditor,
  onExportSlot,
  onExportSlots,
  bulkProgress,
  onCancelBulk,
  onImportToSlot,
  onRenameSlot,
  onRefreshNames,
}: PatchManagerSheetProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmImportSlot, setConfirmImportSlot] = useState<number | null>(null);
  const pendingImportRef = useRef<Uint8Array | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const namesLoading = namesLoadProgress < 256;
  const bulkRunning = bulkProgress !== null;
  const actionsDisabled = !connected || selected === null || busy || bulkRunning;

  let selectedLabel = '';
  if (selected !== null) selectedLabel = SysExCodec.slotToLabel(selected);
  let currentLabel = '—';
  if (currentSlot !== null) currentLabel = SysExCodec.slotToLabel(currentSlot);

  function handleSelect(slot: number) {
    setSelected(slot);
    setRenaming(false);
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Patch Manager"
      placement="right"
      className="flex flex-col p-0"
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
        <button
          type="button"
          onClick={onRefreshNames}
          disabled={!connected || namesLoading || bulkRunning}
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
                background: 'var(--accent-amber)',
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
          Connect the GP-200 to browse and manage its patches.
        </p>
      )}

      {/* Search */}
      <div
        className="px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-active)' }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patches…"
          className="w-full bg-transparent font-mono-display text-sm outline-none"
          style={{ color: 'var(--text-primary)' }}
        />
      </div>

      {/* Slot grid */}
      <div className="flex-1 min-h-0 flex flex-col">
        <SlotGrid
          presetNames={presetNames}
          namesLoadProgress={namesLoadProgress}
          currentSlot={currentSlot}
          selected={selected}
          search={search}
          onSelect={handleSelect}
          onActivate={(slot) => {
            if (connected) onActivate(slot);
          }}
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
              if (selected !== null) onActivate(selected);
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
            title="Write a .prst file into this slot"
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

        {/* Bulk actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={actionsDisabled}
            onClick={() => {
              if (selected !== null) void onExportSlots(bankSlotsOf(selected));
            }}
            title="Download the selected slot's bank (4 patches) as a .zip"
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
            title="Download all 256 patches as a .zip (takes a few minutes)"
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

      {/* Overwrite confirmation — inline (a nested Dialog would double-bind
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
            {' '}“{presetNames[confirmImportSlot] ?? '—'}” on the device?
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
