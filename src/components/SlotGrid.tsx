import { useMemo } from 'react';
import { SysExCodec } from '@/core/SysExCodec';

export interface SlotGridProps {
  presetNames: (string | null)[];
  namesLoadProgress: number;
  currentSlot: number | null;
  /** single-select highlight (ignored when multiSelected is provided) */
  selected: number | null;
  /** when provided, the grid renders in multi-select mode */
  multiSelected?: Set<number>;
  search: string;
  onSelect: (slot: number) => void;
  /** double-click confirm (single-select mode only) */
  onActivate?: (slot: number) => void;
}

/** Filter to the set of slots whose name or "63-B" label matches the query. */
function filterSlots(search: string, presetNames: (string | null)[]): Set<number> {
  if (!search.trim()) return new Set(Array.from({ length: 256 }, (_, slot) => slot));
  const query = search.toLowerCase();
  const result = new Set<number>();
  for (let slot = 0; slot < 256; slot++) {
    const name = presetNames[slot] ?? '';
    const label = SysExCodec.slotToLabel(slot);
    if (name.toLowerCase().includes(query) || label.toLowerCase().includes(query)) {
      result.add(slot);
    }
  }
  return result;
}

function slotPlaceholder(name: string | null, namesLoadProgress: number): string {
  if (name !== null) return name;
  if (namesLoadProgress < 256) return '…';
  return '—';
}

/**
 * The 64-bank × A/B/C/D slot grid shared by DeviceSlotBrowser (modal picker)
 * and PatchManagerSheet (side sheet). Purely presentational — selection state
 * lives in the host.
 */
export function SlotGrid({
  presetNames,
  namesLoadProgress,
  currentSlot,
  selected,
  multiSelected,
  search,
  onSelect,
  onActivate,
}: SlotGridProps) {
  const visible = useMemo(
    () => filterSlots(search, presetNames),
    [search, presetNames],
  );
  const isMulti = multiSelected !== undefined;

  const banks = Array.from({ length: 64 }, (_, bankIndex) =>
    Array.from({ length: 4 }, (__, letterIndex) => bankIndex * 4 + letterIndex)
  ).filter((bankRow) => bankRow.some((slot) => visible.has(slot)));

  function isHighlighted(slot: number): boolean {
    if (isMulti) return multiSelected.has(slot);
    return selected === slot;
  }

  const renderCell = (slot: number) => {
    const highlighted = isHighlighted(slot);
    const isCurrent = currentSlot === slot;
    const name = presetNames[slot];
    const label = SysExCodec.slotToLabel(slot);
    if (!visible.has(slot)) {
      return (
        <div key={slot} style={{ opacity: 0.15, padding: '6px 8px' }}>
          <div
            style={{ fontFamily: 'monospace', fontSize: '0.65em', color: 'var(--text-muted)' }}
          >
            {label}
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '0.7em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name ?? '…'}
          </div>
        </div>
      );
    }
    let background = 'transparent';
    if (highlighted) background = 'rgba(212,162,78,0.18)';
    else if (isCurrent) background = 'rgba(212,162,78,0.07)';
    let labelColor = 'var(--text-muted)';
    let nameColor = 'var(--text-primary)';
    if (highlighted) {
      labelColor = 'var(--accent-amber)';
      nameColor = 'var(--accent-amber)';
    }
    let check = '';
    if (isMulti && highlighted) check = '✓ ';
    let currentMark = '';
    if (isCurrent) currentMark = ' ◀';
    return (
      <button
        key={slot}
        onClick={() => onSelect(slot)}
        onDoubleClick={() => {
          if (!isMulti) onActivate?.(slot);
        }}
        style={{
          padding: '6px 8px',
          textAlign: 'left',
          background,
          borderRight: '1px solid rgba(0,0,0,0.10)',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '0.65em',
            color: labelColor,
            marginBottom: 2,
          }}
        >
          {check}{label}{currentMark}
        </div>
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: '0.7em',
            color: nameColor,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {slotPlaceholder(name, namesLoadProgress)}
        </div>
      </button>
    );
  };

  return (
    <div className="overflow-y-auto flex-1 p-2">
      {banks.map((bankRow) => {
        const bankNum = Math.floor(bankRow[0] / 4) + 1;
        return (
          <div
            key={bankNum}
            className="grid grid-cols-4 rounded mb-1 overflow-hidden"
            style={{ border: '1px solid rgba(0,0,0,0.10)' }}
          >
            {bankRow.map(renderCell)}
          </div>
        );
      })}
    </div>
  );
}
