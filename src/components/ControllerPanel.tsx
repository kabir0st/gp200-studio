import { useState, useCallback } from 'react';
import type { GP200Preset } from '@/core/types';
import { getSlotModule, getEffectName } from '@/core/effectNames';
import { getEffectParams } from '@/core/effectParams';

/** EXP page indices matching the SysEx protocol */
const EXP_PAGES = [
  { page: 0, label: 'EXP 1 – Mode A' },
  { page: 1, label: 'EXP 1 – Mode B' },
  { page: 2, label: 'EXP 2' },
] as const;

const ITEMS_PER_PAGE = 3; // Para 1, 2, 3

/** Assignable parameter option with block/param indices for SysEx. */
interface ParamOption {
  label: string;       // "WAH-V-Wah-Range"
  value: string;       // "1-0" (blockIndex-paramIndex)
  blockIndex: number;  // 0-10
  paramIdx: number;    // 0-14
}

/** Build a flat list of assignable parameters from the current preset's active effects. */
function buildParamOptions(preset: GP200Preset | null): ParamOption[] {
  if (!preset) return [];
  const options: ParamOption[] = [];
  for (const slot of preset.effects) {
    // SysEx targets the physical block, not the playback position — the
    // effects array is in playback order, so the array index is wrong for
    // reordered chains. slotIndex is the block identity.
    const blockIndex = slot.slotIndex;
    const moduleName = getSlotModule(slot.slotIndex);
    const effectName = getEffectName(slot.effectId);
    const params = getEffectParams(slot.effectId);
    for (let pi = 0; pi < params.length; pi++) {
      options.push({
        label: `${moduleName}-${effectName}-${params[pi].name}`,
        value: `${blockIndex}-${pi}`,
        blockIndex,
        paramIdx: pi,
      });
    }
  }
  return options;
}

interface ControllerPanelProps {
  preset: GP200Preset | null;
  connected: boolean;
  onParamSelect: (page: number, item: number, blockIndex: number, paramIdx: number) => void;
  onMinMax: (page: number, item: number, min: number, max: number) => void;
}

interface ExpSlotState {
  paramValue: string; // "blockIndex-paramIndex" or "" for unassigned
  min: number;
  max: number;
}

type ExpState = Record<string, ExpSlotState>; // key: "page-item"

function slotKey(page: number, item: number): string {
  return `${page}-${item}`;
}

export function ControllerPanel({ preset, connected, onParamSelect, onMinMax }: ControllerPanelProps) {
  // expanded by default — this panel now lives inside the deck's EXP drawer,
  // which the user explicitly opened
  const [collapsed, setCollapsed] = useState(false);
  const [expState, setExpState] = useState<ExpState>({});

  const paramOptions = buildParamOptions(preset);

  const getSlot = useCallback((page: number, item: number): ExpSlotState => {
    return expState[slotKey(page, item)] ?? { paramValue: '', min: 0, max: 100 };
  }, [expState]);

  const handleParamChange = useCallback((page: number, item: number, paramValue: string) => {
    setExpState(prev => {
      const key = slotKey(page, item);
      const current = prev[key] ?? { paramValue: '', min: 0, max: 100 };
      return { ...prev, [key]: { ...current, paramValue } };
    });
    if (paramValue) {
      const [bi, pi] = paramValue.split('-').map(Number);
      onParamSelect(page, item, bi, pi);
    }
  }, [onParamSelect]);

  const handleMinMaxChange = useCallback((page: number, item: number, updates: { min?: number; max?: number }) => {
    setExpState(prev => {
      const key = slotKey(page, item);
      const current = prev[key] ?? { paramValue: '', min: 0, max: 100 };
      const next = { ...current, ...updates };
      onMinMax(page, item, next.min, next.max);
      return { ...prev, [key]: next };
    });
  }, [onMinMax]);

  return (
    <div className="rounded-lg mb-4"
      style={{ border: '1px solid rgba(0,0,0,0.10)', background: 'rgba(0,0,0,0.03)', opacity: connected ? 1 : 0.5 }}>
      {/* Header / collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left"
        aria-expanded={!collapsed}
        aria-label="Toggle controllers panel"
      >
        <span className="font-mono-display text-xs font-bold tracking-wider uppercase"
          style={{ color: 'var(--text-muted)' }}>
          Controllers
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {EXP_PAGES.map(({ page, label }) => (
            <div key={page}>
              <h3 className="font-mono-display text-label font-bold tracking-wider uppercase mb-2"
                style={{ color: 'var(--accent-amber)' }}>
                {label}
              </h3>
              <div className="space-y-1">
                {Array.from({ length: ITEMS_PER_PAGE }, (_, item) => {
                  const slot = getSlot(page, item);
                  return (
                    <div key={item}
                      className="flex items-center gap-2 py-1 px-2 rounded"
                      style={{ background: 'rgba(0,0,0,0.03)' }}>
                      {/* Para label */}
                      <span className="font-mono-display text-label font-medium w-12 flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}>
                        {`Para ${item + 1}`}
                      </span>

                      {/* Parameter dropdown — sends blockIndex<<4 + paramIdx<<4 via navigation */}
                      <select
                        value={slot.paramValue}
                        onChange={e => handleParamChange(page, item, e.target.value)}
                        className="flex-1 text-xs rounded px-1.5 py-1 min-w-0"
                        style={{
                          background: 'rgba(0,0,0,0.05)',
                          border: '1px solid rgba(0,0,0,0.12)',
                          color: !slot.paramValue ? 'var(--text-muted)' : 'var(--text-primary)',
                        }}
                      >
                        <option value="">Not assigned</option>
                        {paramOptions.map(o => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>

                      {/* Min */}
                      <label className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-mono-display text-micro uppercase"
                          style={{ color: 'var(--text-muted)' }}>Min</span>
                        <input
                          type="number"
                          min={0}
                          max={slot.max}
                          value={slot.min}
                          onChange={e => handleMinMaxChange(page, item, { min: Number(e.target.value) })}
                          disabled={!slot.paramValue}
                          className="w-12 text-xs text-center rounded px-1 py-0.5"
                          style={{
                            background: 'rgba(0,0,0,0.05)',
                            border: '1px solid rgba(0,0,0,0.12)',
                            color: !slot.paramValue ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}
                        />
                      </label>

                      {/* Max */}
                      <label className="flex items-center gap-1 flex-shrink-0">
                        <span className="font-mono-display text-micro uppercase"
                          style={{ color: 'var(--text-muted)' }}>Max</span>
                        <input
                          type="number"
                          min={slot.min}
                          max={100}
                          value={slot.max}
                          onChange={e => handleMinMaxChange(page, item, { max: Number(e.target.value) })}
                          disabled={!slot.paramValue}
                          className="w-12 text-xs text-center rounded px-1 py-0.5"
                          style={{
                            background: 'rgba(0,0,0,0.05)',
                            border: '1px solid rgba(0,0,0,0.12)',
                            color: !slot.paramValue ? 'var(--text-muted)' : 'var(--text-primary)',
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
