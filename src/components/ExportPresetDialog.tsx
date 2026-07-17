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
  /** Caller encodes the preset (PRSTEncoder) and triggers the file download. */
  onConfirm: (name: string, author?: string) => void;
}

/** Minimal "name this preset, then download" dialog that replaces the old gallery-publish
 *  flow (style/note/audio-snippet/publish checkbox), which has no equivalent in this
 *  backend-less app. See docs/design-system.md "Components > Dialog". */
export function ExportPresetDialog({ open, onClose, initialName, initialAuthor, onConfirm }: ExportPresetDialogProps) {
  const [name, setName] = useState(initialName ?? '');
  const [author, setAuthor] = useState(initialAuthor ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedAuthor = author.trim();
    onConfirm(trimmedName, trimmedAuthor || undefined);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Export Preset">
      <h2
        className="font-mono-display text-lg font-bold tracking-tight mb-5"
        style={{ color: 'var(--accent-amber)' }}
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
