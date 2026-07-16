import { useState, useEffect, useRef, useMemo } from 'react';
import { SysExCodec } from '@/core/SysExCodec';

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
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set(initialSelected ?? []));
  const isMulti = mode === 'multiselect';
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);

  // Close on Escape
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

  // Filter: build a Set of visible slots
  const visible = useMemo((): Set<number> => {
    if (!search.trim()) return new Set(Array.from({ length: 256 }, (_, i) => i));
    const q = search.toLowerCase();
    const result = new Set<number>();
    for (let s = 0; s < 256; s++) {
      const name = presetNames[s] ?? '';
      const label = SysExCodec.slotToLabel(s);
      if (name.toLowerCase().includes(q) || label.toLowerCase().includes(q)) result.add(s);
    }
    return result;
  }, [search, presetNames]);
  const confirmLabel = isMulti
    ? multiSelected.size > 0
      ? `${multiSelected.size} slots selected`
      : 'Select slots'
    : selected !== null
      ? mode === 'pull'
        ? `Load from ${SysExCodec.slotToLabel(selected)}`
        : `Save to ${SysExCodec.slotToLabel(selected)}`
      : mode === 'pull' ? 'Load' : 'Save';

  // 64 banks, each with A/B/C/D
  const banks = Array.from({ length: 64 }, (_, bank) =>
    Array.from({ length: 4 }, (__, letter) => bank * 4 + letter)
  ).filter(row => row.some(s => visible.has(s)));

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
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border-active)' }}>
          <span className="font-mono-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Select Preset
          </span>
          {namesLoadProgress < 256 && (
            <div className="flex-1 flex items-center gap-2 ml-4">
              <span className="font-mono-display shrink-0" style={{ fontSize: '0.7em', color: 'var(--text-muted)' }}>
                Loading preset names…
              </span>
              <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.12)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${(namesLoadProgress / 256) * 100}%`, background: 'var(--accent-amber)' }}
                />
              </div>
            </div>
          )}
          <button onClick={onCancel} className="ml-auto" style={{ color: 'var(--text-muted)' }}>✕</button>
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

        {/* Slot grid */}
        <div className="overflow-y-auto flex-1 p-2">
          {banks.map((row) => {
            const bankNum = Math.floor(row[0] / 4) + 1;
            return (
              <div
                key={bankNum}
                className="grid grid-cols-4 rounded mb-1 overflow-hidden"
                style={{ border: '1px solid rgba(0,0,0,0.10)' }}
              >
                {row.map((slot) => {
                  const isSelected = selected === slot;
                  const isCurrent  = currentSlot === slot;
                  const isVisible  = visible.has(slot);
                  const name = presetNames[slot];
                  const label = SysExCodec.slotToLabel(slot);
                  if (!isVisible) return (
                    <div key={slot} style={{ opacity: 0.15, padding: '6px 8px' }}>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.65em', color: 'var(--text-muted)' }}>{label}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.7em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {name ?? '…'}
                      </div>
                    </div>
                  );
                  return (
                    <button
                      key={slot}
                      onClick={() => {
                        if (isMulti) {
                          setMultiSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(slot)) next.delete(slot);
                            else next.add(slot);
                            return next;
                          });
                        } else {
                          setSelected(slot);
                        }
                      }}
                      onDoubleClick={() => { if (!isMulti) onConfirm(slot); }}
                      style={{
                        padding: '6px 8px',
                        textAlign: 'left',
                        background: (isMulti ? multiSelected.has(slot) : isSelected)
                          ? 'rgba(212,162,78,0.18)'
                          : isCurrent ? 'rgba(212,162,78,0.07)' : 'transparent',
                        borderRight: '1px solid rgba(0,0,0,0.10)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{
                        fontFamily: 'monospace', fontSize: '0.65em',
                        color: (isMulti ? multiSelected.has(slot) : isSelected) ? 'var(--accent-amber)' : 'var(--text-muted)',
                        marginBottom: 2,
                      }}>
                        {isMulti && multiSelected.has(slot) ? '✓ ' : ''}{label}{isCurrent ? ' ◀' : ''}
                      </div>
                      <div style={{
                        fontFamily: 'monospace', fontSize: '0.7em',
                        color: (isMulti ? multiSelected.has(slot) : isSelected) ? 'var(--accent-amber)' : 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {name ?? (namesLoadProgress < 256 ? '…' : '—')}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--border-active)' }}>
          <button
            onClick={onCancel}
            className="font-mono-display text-sm px-4 py-2 rounded"
            style={{ border: '1px solid rgba(0,0,0,0.20)', color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (isMulti && onConfirmMulti) {
                onConfirmMulti(Array.from(multiSelected).sort((a, b) => a - b));
              } else if (selected !== null) {
                onConfirm(selected);
              }
            }}
            disabled={isMulti ? multiSelected.size === 0 : selected === null}
            className="font-mono-display text-sm font-bold px-4 py-2 rounded disabled:opacity-40"
            style={{
              border: '1px solid var(--accent-amber)',
              color: 'var(--accent-amber)',
              background: 'rgba(212,162,78,0.1)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
