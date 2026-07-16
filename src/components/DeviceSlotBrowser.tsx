import { useState, useEffect, useRef } from 'react';
import { SysExCodec } from '@/core/SysExCodec';
import { SlotGrid } from './SlotGrid';

interface DeviceSlotBrowserProps {
  mode: 'pull' | 'push' | 'multiselect';
  presetNames: (string | null)[];
  namesLoadProgress: number;
  currentSlot: number | null;
  onConfirm: (slot: number) => void;
  onConfirmMulti?: (slots: number[]) => void;
  initialSelected?: number[];
  onCancel: () => void;
}

function confirmLabelFor(
  mode: DeviceSlotBrowserProps['mode'],
  selected: number | null,
  multiSelected: Set<number>,
): string {
  if (mode === 'multiselect') {
    if (multiSelected.size > 0) return `${multiSelected.size} slots selected`;
    return 'Select slots';
  }
  if (selected === null) {
    if (mode === 'pull') return 'Load';
    return 'Save';
  }
  const label = SysExCodec.slotToLabel(selected);
  if (mode === 'pull') return `Load from ${label}`;
  return `Save to ${label}`;
}

export function DeviceSlotBrowser({
  mode,
  presetNames,
  namesLoadProgress,
  currentSlot,
  onConfirm,
  onConfirmMulti,
  initialSelected,
  onCancel,
}: DeviceSlotBrowserProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(currentSlot);
  const [multiSelected, setMultiSelected] = useState<Set<number>>(
    new Set(initialSelected ?? []),
  );
  const isMulti = mode === 'multiselect';
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') {
        if (isMulti && onConfirmMulti) {
          onConfirmMulti(Array.from(multiSelected).sort((a, b) => a - b));
        } else if (selected !== null) {
          onConfirm(selected);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm, onConfirmMulti, selected, multiSelected, isMulti]);

  function handleSelect(slot: number) {
    if (!isMulti) {
      setSelected(slot);
      return;
    }
    setMultiSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  function handleConfirm() {
    if (isMulti && onConfirmMulti) {
      onConfirmMulti(Array.from(multiSelected).sort((a, b) => a - b));
    } else if (selected !== null) {
      onConfirm(selected);
    }
  }

  const confirmDisabled = (() => {
    if (isMulti) return multiSelected.size === 0;
    return selected === null;
  })();

  let gridMulti: Set<number> | undefined;
  if (isMulti) gridMulti = multiSelected;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="flex flex-col rounded-xl overflow-hidden"
        style={{
          width: 'min(600px, 95vw)',
          maxHeight: '80vh',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-active)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-active)' }}
        >
          <span className="font-mono-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Select Preset
          </span>
          {namesLoadProgress < 256 && (
            <div className="flex-1 flex items-center gap-2 ml-4">
              <span
                className="font-mono-display shrink-0"
                style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}
              >
                Loading preset names…
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
          <button onClick={onCancel} className="ml-auto" style={{ color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2" style={{ borderBottom: '1px solid var(--border-active)' }}>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets…"
            className="w-full bg-transparent font-mono-display text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <SlotGrid
          presetNames={presetNames}
          namesLoadProgress={namesLoadProgress}
          currentSlot={currentSlot}
          selected={selected}
          multiSelected={gridMulti}
          search={search}
          onSelect={handleSelect}
          onActivate={onConfirm}
        />

        {/* Footer */}
        <div
          className="flex justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--border-active)' }}
        >
          <button
            onClick={onCancel}
            className="font-mono-display text-sm px-4 py-2 rounded"
            style={{ border: '1px solid rgba(0,0,0,0.20)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="font-mono-display text-sm font-bold px-4 py-2 rounded disabled:opacity-40"
            style={{
              border: '1px solid var(--accent-amber)',
              color: 'var(--accent-amber)',
              background: 'rgba(212,162,78,0.1)',
            }}
          >
            {confirmLabelFor(mode, selected, multiSelected)}
          </button>
        </div>
      </div>
    </div>
  );
}
