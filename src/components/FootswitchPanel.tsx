import type { CSSProperties } from 'react';
import type { GP200Preset, CtrlAssignment } from '@/core/types';
import { getSlotModule, getEffectName, MODULE_COLORS } from '@/core/effectNames';
import { defaultCtrlAssignments } from '@/core/controlRecords';
import { SysExCodec } from '@/core/SysExCodec';

interface FootswitchPanelProps {
  preset: GP200Preset;
  currentSlot: number | null;
  connected: boolean;
  onCtrlBlockToggle: (ctrlIndex: number, blockIndex: number, on: boolean) => void;
}

const CTRL_COUNT = 8;
const BLOCK_COUNT = 11;

function assignmentsOf(preset: GP200Preset): CtrlAssignment[] {
  return preset.ctrlAssignments ?? defaultCtrlAssignments();
}

interface BlockChipProps {
  ctrlIndex: number;
  blockIndex: number;
  effectName: string;
  active: boolean;
  onToggle: (ctrlIndex: number, blockIndex: number, on: boolean) => void;
}

function BlockChip({ ctrlIndex, blockIndex, effectName, active, onToggle }: BlockChipProps) {
  const moduleName = getSlotModule(blockIndex);
  const colors = MODULE_COLORS[moduleName];
  // Data-driven per-module tint via inline style — the sanctioned second
  // color source (see docs/design-system.md).
  const style: CSSProperties = {
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(0,0,0,0.04)',
    color: 'var(--text-muted)',
  };
  if (active && colors) {
    style.border = `1px solid ${colors.accent}`;
    style.background = colors.glow;
    style.color = colors.accentDim;
  }
  return (
    <button
      type="button"
      aria-pressed={active}
      title={`CTRL ${ctrlIndex + 1} → ${moduleName}: ${effectName}`}
      onClick={() => onToggle(ctrlIndex, blockIndex, !active)}
      className="font-mono-display text-micro font-bold tracking-wider uppercase
        px-1.5 py-1 rounded min-w-0 flex-1 text-center"
      style={style}
    >
      {moduleName}
    </button>
  );
}

/**
 * Per-patch CTRL footswitch assignment: each of the GP-200's 8 assignable
 * CTRL footswitches toggles any subset of the 11 effect blocks. Stored in
 * the preset's controls tail (controlRecords.ts) and saved with the patch.
 */
export function FootswitchPanel({
  preset,
  currentSlot,
  connected,
  onCtrlBlockToggle,
}: FootswitchPanelProps) {
  const assignments = assignmentsOf(preset);
  const maskByCtrl = new Map<number, number>();
  for (const assignment of assignments) {
    maskByCtrl.set(assignment.ctrlIndex, assignment.blockMask);
  }

  const ctrlRows = Array.from({ length: CTRL_COUNT }, (_, ctrlIndex) => ctrlIndex);
  const blockCols = Array.from({ length: BLOCK_COUNT }, (_, blockIndex) => blockIndex);
  const effectNameByBlock = new Map<number, string>();
  for (const slot of preset.effects) {
    effectNameByBlock.set(slot.slotIndex, getEffectName(slot.effectId));
  }

  let saveHint = 'Export the preset to keep them in the .prst file.';
  if (connected && currentSlot !== null) {
    const label = SysExCodec.slotToLabel(currentSlot);
    saveHint = `Press SAVE TO ${label} (or SAVE AS) to persist them on the device.`;
  }

  return (
    <div>
      <div className="space-y-1">
        {ctrlRows.map((ctrlIndex) => {
          const mask = maskByCtrl.get(ctrlIndex) ?? 0;
          return (
            <div
              key={ctrlIndex}
              className="flex items-center gap-2 py-1 px-2 rounded"
              style={{ background: 'rgba(0,0,0,0.03)' }}
            >
              <span
                className="font-mono-display text-label font-bold w-14 flex-shrink-0"
                style={{ color: 'var(--accent-amber)' }}
              >
                {`CTRL ${ctrlIndex + 1}`}
              </span>
              <div className="flex gap-1 flex-1 min-w-0">
                {blockCols.map((blockIndex) => (
                  <BlockChip
                    key={blockIndex}
                    ctrlIndex={ctrlIndex}
                    blockIndex={blockIndex}
                    effectName={effectNameByBlock.get(blockIndex) ?? ''}
                    active={(mask & (1 << blockIndex)) !== 0}
                    onToggle={onCtrlBlockToggle}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-mono-display text-caption mt-3" style={{ color: 'var(--text-muted)' }}>
        Assignments are saved with the patch. {saveHint} To trigger a CTRL
        from the pedal, map a footswitch to it in the device&apos;s footswitch
        settings (Settings → Footswitch).
      </p>
    </div>
  );
}
