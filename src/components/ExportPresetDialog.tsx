import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

interface ExportPresetDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current patch name to prefill (GP200Preset.patchName, max 16 chars). */
  initialName?: string;
  /** Current author to prefill (GP200Preset.author, max 16 chars, optional). */
  initialAuthor?: string;
  /** Target slot 0..255 to prefill (GP200Preset.slotIndex); defaults to 01-A. */
  initialSlot?: number;
  /** Caller encodes the preset (PRSTEncoder) and triggers the file download. */
  onConfirm: (name: string, author: string | undefined, slot: number) => void;
}

const LETTERS = ['A', 'B', 'C', 'D'];

/** Minimal "name this preset, then download" dialog that replaces the old gallery-publish
 *  flow (style/note/audio-snippet/publish checkbox), which has no equivalent in this
 *  backend-less app. See docs/design-system.md "Components > Dialog". */
export function ExportPresetDialog({ open, onClose, initialName, initialAuthor, initialSlot, onConfirm }: ExportPresetDialogProps) {
  const [name, setName] = useState(initialName ?? '');
  const [author, setAuthor] = useState(initialAuthor ?? '');
  const startSlot = initialSlot ?? 0;
  const [bank, setBank] = useState(Math.floor(startSlot / 4) + 1);
  const [letter, setLetter] = useState(startSlot % 4);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedAuthor = author.trim();
    const slot = (bank - 1) * 4 + letter;
    onConfirm(trimmedName, trimmedAuthor || undefined, slot);
  }

  const selectStyle = {
    background: 'var(--bg-input)',
    border: '1px solid var(--border-active)',
    color: 'var(--text-primary)',
  } as const;

  return (
    <Dialog open={open} onClose={onClose} title="Export Preset">
      <h2
        className="font-mono-display text-lg font-bold tracking-tight mb-5"
        style={{ color: 'var(--accent)' }}
      >
        Export Preset
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Patch name */}
        <div>
          <label
            className="block font-mono-display text-caption font-medium tracking-wider uppercase mb-1.5"
            htmlFor="export-patch-name"
            style={{ color: 'var(--text-secondary)' }}
          >
            Patch Name
          </label>
          <input
            id="export-patch-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            autoFocus
            required
            className="w-full rounded px-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-active)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Author */}
        <div>
          <label
            className="block font-mono-display text-caption font-medium tracking-wider uppercase mb-1.5"
            htmlFor="export-author"
            style={{ color: 'var(--text-secondary)' }}
          >
            Author
          </label>
          <input
            id="export-author"
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            maxLength={16}
            className="w-full rounded px-3 py-2 text-sm focus:outline-none"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border-active)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Target slot , written to the .prst so the Valeton editor lands the
            patch on this slot when syncing to the device (byte 0x34). */}
        <div>
          <label
            className="block font-mono-display text-caption font-medium tracking-wider uppercase mb-1.5"
            htmlFor="export-slot-bank"
            style={{ color: 'var(--text-secondary)' }}
          >
            Target Slot
          </label>
          <div className="flex gap-2 items-center">
            <select
              id="export-slot-bank"
              value={bank}
              onChange={(e) => setBank(Number(e.target.value))}
              className="rounded px-3 py-2 text-sm focus:outline-none"
              style={selectStyle}
            >
              {Array.from({ length: 64 }, (_, i) => i + 1).map((b) => (
                <option key={b} value={b}>{`Bank ${String(b).padStart(2, '0')}`}</option>
              ))}
            </select>
            <select
              aria-label="Slot letter"
              value={letter}
              onChange={(e) => setLetter(Number(e.target.value))}
              className="rounded px-3 py-2 text-sm focus:outline-none"
              style={selectStyle}
            >
              {LETTERS.map((l, i) => (
                <option key={l} value={i}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-2">
          <Button type="submit" variant="primary" className="flex-1">
            Download
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
