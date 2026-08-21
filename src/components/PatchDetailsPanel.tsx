import { PATCH_STYLES } from '@/core/patchStyles';
import type { GP200Preset } from '@/core/types';

interface PatchDetailsPanelProps {
  preset: GP200Preset;
  onStyleChange: (index: number) => void;
  onNoteChange: (note: string) => void;
}

const NOTE_MAX = 40;

/**
 * The two per-patch fields the pedal stores but nothing else in the app showed:
 * the style tag it sorts by and the 40-byte note. Both round-trip through the
 * .prst and, when a pedal is attached, go out live.
 */
export function PatchDetailsPanel({ preset, onStyleChange, onNoteChange }: PatchDetailsPanelProps) {
  const note = preset.patchNote ?? '';

  return (
    <div className="font-mono-display flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-label uppercase tracking-wider text-text-muted">Style</span>
        <select
          value={preset.patchStyle < PATCH_STYLES.length ? preset.patchStyle : 0}
          onChange={(e) => onStyleChange(Number(e.target.value))}
          className="rounded px-2 py-1.5 text-sm bg-transparent"
          style={{ border: '1px solid rgba(128,128,128,0.30)', color: 'inherit' }}
        >
          {PATCH_STYLES.map((style, index) => (
            <option key={style} value={index}>{index === 0 ? 'No style' : style}</option>
          ))}
        </select>
        <span className="text-caption text-text-muted">
          What the pedal shows next to the patch, and what it groups by.
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label uppercase tracking-wider text-text-muted">Note</span>
        <textarea
          value={note}
          maxLength={NOTE_MAX}
          rows={2}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="e.g. 4CM into the Marshall"
          className="rounded px-2 py-1.5 text-sm bg-transparent resize-none"
          style={{ border: '1px solid rgba(128,128,128,0.30)', color: 'inherit' }}
        />
        <span className="text-caption text-text-muted">
          {note.length}/{NOTE_MAX} characters. Saved with the patch.
        </span>
      </label>
    </div>
  );
}
