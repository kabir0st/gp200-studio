import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { SysExCodec } from '@/core/SysExCodec';
import { PatchPicker } from './PatchPicker';

interface DeviceSlotBrowserProps {
  mode: 'pull' | 'push';
  presetNames: (string | null)[];
  namesLoadProgress: number;
  currentSlot: number | null;
  onConfirm: (slot: number) => void;
  onCancel: () => void;
}

function confirmLabelFor(mode: DeviceSlotBrowserProps['mode'], selected: number | null): string {
  if (selected === null) {
    if (mode === 'pull') return 'Load';
    return 'Save';
  }
  const label = SysExCodec.slotToLabel(selected);
  if (mode === 'pull') return `Load from ${label}`;
  return `Save to ${label}`;
}

/** Modal preset browser for device LOAD (pull) / SAVE AS (push). */
export function DeviceSlotBrowser({
  mode,
  presetNames,
  namesLoadProgress,
  currentSlot,
  onConfirm,
  onCancel,
}: DeviceSlotBrowserProps) {
  const [selected, setSelected] = useState<number | null>(currentSlot);

  const namesLoading = namesLoadProgress < 256;

  function handleConfirm() {
    if (selected !== null) onConfirm(selected);
  }

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Select preset"
      maxWidth="max-w-4xl"
      className="flex flex-col h-[72vh]"
    >
      <header className="flex items-center gap-3 mb-3">
        <span
          className="font-mono-display font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          Select preset
        </span>
        {namesLoading && (
          <div className="flex-1 flex items-center gap-2">
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
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="ml-auto font-mono-display"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </header>

      <PatchPicker
        presetNames={presetNames}
        namesLoadProgress={namesLoadProgress}
        currentSlot={currentSlot}
        selected={selected}
        onSelect={setSelected}
        onActivate={onConfirm}
      />

      <footer className="flex justify-end gap-2 mt-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={selected === null} onClick={handleConfirm}>
          {confirmLabelFor(mode, selected)}
        </Button>
      </footer>
    </Dialog>
  );
}
