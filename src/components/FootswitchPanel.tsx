import { useState, type CSSProperties } from 'react';
import type { GP200Preset, CtrlAssignment } from '@/core/types';
import { getSlotModule, getEffectName, MODULE_COLORS } from '@/core/effectNames';
import { defaultCtrlAssignments } from '@/core/controlRecords';
import {
  DEVICE_MODELS,
  DEFAULT_DEVICE_MODEL,
  ctrlCountFor,
  type DeviceModelId,
} from '@/core/deviceModel';

interface FootswitchPanelProps {
  preset: GP200Preset;
  connected: boolean;
  onCtrlBlockToggle: (ctrlIndex: number, blockIndex: number, on: boolean) => void;
  /** Clear every block off one CTRL footswitch (whole-mask reset). */
  onCtrlClear?: (ctrlIndex: number) => void;
  /** Which variant the user has: the LT has 4 CTRL switches, the rest 8. */
  deviceModel?: DeviceModelId;
  onDeviceModelChange?: (id: DeviceModelId) => void;
}

// The file always carries 8 CTRL records; this is only how many the panel
// draws, which depends on the hardware in front of the user.
// The 11 chain effect blocks (bits 0-10) plus the FX LOOP insert (bit 11), which
// a CTRL footswitch can toggle like any block. FX LOOP is a routing element, not
// an effect module, so it has no SLOT_MODULES / getSlotModule entry of its own.
const FX_LOOP_BLOCK = 11;
const FX_LOOP_LABEL = 'FX LOOP';
const BLOCK_COUNT = 12;

const ctrlIndices = (count: number) => Array.from({ length: count }, (_, ctrlIndex) => ctrlIndex);
const BLOCK_INDICES = Array.from({ length: BLOCK_COUNT }, (_, blockIndex) => blockIndex);

// Blocks 0-10 map to a real effect module; block 11 is the FX loop insert. Its
// color lives in MODULE_COLORS under FX_LOOP_LABEL (the sanctioned data-driven
// color source), so no hex is hardcoded here.
function blockLabel(blockIndex: number): string {
  if (blockIndex === FX_LOOP_BLOCK) return FX_LOOP_LABEL;
  return getSlotModule(blockIndex);
}

function blockEffectName(blockIndex: number, effectName: string | undefined): string {
  if (blockIndex === FX_LOOP_BLOCK) return 'Effects loop send/return';
  return effectName ?? '';
}

function assignmentsOf(preset: GP200Preset): CtrlAssignment[] {
  return preset.ctrlAssignments ?? defaultCtrlAssignments();
}

function blockBit(blockIndex: number): number {
  return 1 << blockIndex;
}

function assignedModules(mask: number): string[] {
  return BLOCK_INDICES
    .filter((blockIndex) => (mask & blockBit(blockIndex)) !== 0)
    .map((blockIndex) => blockLabel(blockIndex));
}

interface FootswitchButtonProps {
  ctrlIndex: number;
  mask: number;
  selected: boolean;
  onSelect: (ctrlIndex: number) => void;
}

/**
 * One selectable footswitch, drawn like the hardware stomp: round cap on top,
 * CTRL label below, and one colored dot per assigned pedal so the whole bank
 * is scannable without opening each switch.
 */
function FootswitchButton({ ctrlIndex, mask, selected, onSelect }: FootswitchButtonProps) {
  const modules = assignedModules(mask);
  const buttonStyle: CSSProperties = {
    border: '1px solid rgba(0,0,0,0.14)',
    background: 'rgba(0,0,0,0.03)',
  };
  if (selected) {
    buttonStyle.border = '1px solid var(--accent)';
    buttonStyle.background = 'rgba(212,162,78,0.10)';
    buttonStyle.boxShadow = '0 0 0 2px rgba(212,162,78,0.18)';
  }
  const capStyle: CSSProperties = {
    border: '2px solid rgba(0,0,0,0.25)',
    background: 'linear-gradient(180deg, #f2f2ee, #d8d8d2)',
  };
  if (selected) {
    capStyle.border = '2px solid var(--accent)';
  }
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      title={`Edit CTRL ${ctrlIndex + 1} (${modules.length} pedals assigned)`}
      onClick={() => onSelect(ctrlIndex)}
      className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg flex-1 min-w-16"
      style={buttonStyle}
    >
      <span className="w-7 h-7 rounded-full flex items-center justify-center" style={capStyle}>
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.22)' }}
          aria-hidden="true"
        />
      </span>
      <span
        className="font-mono-display text-label font-bold tracking-wider"
        style={{ color: 'var(--text-primary)' }}
      >
        {`CTRL ${ctrlIndex + 1}`}
      </span>
      <span className="flex gap-1 h-1.5 items-center" aria-hidden="true">
        {modules.map((moduleName) => (
          <span
            key={moduleName}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: MODULE_COLORS[moduleName]?.accent ?? 'rgba(0,0,0,0.3)' }}
          />
        ))}
        {modules.length === 0 && (
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(0,0,0,0.10)' }} />
        )}
      </span>
    </button>
  );
}

interface PedalCardProps {
  blockIndex: number;
  effectName: string;
  bypassed: boolean;
  active: boolean;
  ctrlIndex: number;
  onToggle: (ctrlIndex: number, blockIndex: number, on: boolean) => void;
}

/**
 * One assignable pedal as a full-size touch target: module color, the actual
 * effect loaded in the block, and an LED that lights when the selected CTRL
 * toggles this pedal.
 */
function PedalCard({
  blockIndex,
  effectName,
  bypassed,
  active,
  ctrlIndex,
  onToggle,
}: PedalCardProps) {
  const moduleName = blockLabel(blockIndex);
  const colors = MODULE_COLORS[moduleName];
  // Data-driven per-module tint via inline style: the sanctioned second
  // color source (see docs/design-system.md).
  const cardStyle: CSSProperties = {
    border: '1px solid rgba(0,0,0,0.12)',
    background: 'rgba(0,0,0,0.02)',
  };
  const ledStyle: CSSProperties = {
    background: 'rgba(0,0,0,0.10)',
    boxShadow: 'none',
  };
  if (active && colors) {
    cardStyle.border = `1px solid ${colors.accent}`;
    cardStyle.background = colors.glow;
    ledStyle.background = colors.accent;
    ledStyle.boxShadow = `0 0 6px ${colors.accent}`;
  }
  const moduleColor = colors?.accentDim ?? 'var(--text-primary)';
  let stateLabel = 'tap to add';
  if (active) stateLabel = 'toggled by this switch';
  return (
    <button
      type="button"
      aria-pressed={active}
      title={`CTRL ${ctrlIndex + 1} → ${moduleName}: ${effectName}`}
      onClick={() => onToggle(ctrlIndex, blockIndex, !active)}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left min-w-0"
      style={cardStyle}
    >
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={ledStyle}
        aria-hidden="true"
      />
      <span className="flex flex-col min-w-0">
        <span
          className="font-mono-display text-label font-bold tracking-wider uppercase"
          style={{ color: moduleColor }}
        >
          {moduleName}
          {bypassed && (
            <span className="ml-1.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
              · bypassed
            </span>
          )}
        </span>
        <span className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
          {effectName}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {stateLabel}
        </span>
      </span>
    </button>
  );
}

/**
 * Per-patch CTRL footswitch assignment: each of the GP-200's 8 assignable
 * CTRL footswitches toggles any subset of the 11 effect blocks plus the FX
 * loop insert (bit 11). Stored in the preset's controls tail
 * (controlRecords.ts) and saved with the patch.
 *
 * UX model mirrors the hardware: pick a footswitch from the bank on top,
 * then tap the pedals below that the switch should stomp on/off together.
 */
export function FootswitchPanel({
  preset,
  connected,
  onCtrlBlockToggle,
  onCtrlClear,
  deviceModel = DEFAULT_DEVICE_MODEL,
  onDeviceModelChange,
}: FootswitchPanelProps) {
  const [selectedCtrl, setSelectedCtrl] = useState(0);
  // Switching to a model with fewer switches must not leave the editor
  // pointing at a switch that is no longer drawn.
  const ctrlCount = ctrlCountFor(deviceModel);
  const activeCtrl = Math.min(selectedCtrl, ctrlCount - 1);

  const assignments = assignmentsOf(preset);
  const maskByCtrl = new Map<number, number>();
  for (const assignment of assignments) {
    maskByCtrl.set(assignment.ctrlIndex, assignment.blockMask);
  }
  const selectedMask = maskByCtrl.get(activeCtrl) ?? 0;
  const selectedModules = assignedModules(selectedMask);

  const slotByBlock = new Map<number, { effectName: string; bypassed: boolean }>();
  for (const slot of preset.effects) {
    slotByBlock.set(slot.slotIndex, {
      effectName: getEffectName(slot.effectId),
      bypassed: !slot.enabled,
    });
  }

  let summary = 'Nothing assigned yet. Tap the pedals this switch should toggle.';
  if (selectedModules.length === 1) {
    summary = `Stomping it toggles 1 pedal: ${selectedModules[0]}.`;
  }
  if (selectedModules.length > 1) {
    summary =
      `Stomping it toggles ${selectedModules.length} pedals together: ` +
      `${selectedModules.join(', ')}.`;
  }

  let deviceHint = '';
  if (connected) {
    deviceHint = ' Changes are sent to the connected GP-200 straight away.';
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="CTRL footswitch to edit"
        className="flex flex-wrap gap-2"
      >
        {ctrlIndices(ctrlCount).map((ctrlIndex) => (
          <FootswitchButton
            key={ctrlIndex}
            ctrlIndex={ctrlIndex}
            mask={maskByCtrl.get(ctrlIndex) ?? 0}
            selected={ctrlIndex === activeCtrl}
            onSelect={setSelectedCtrl}
          />
        ))}
      </div>

      {onDeviceModelChange && (
        <label className="flex items-center gap-2 mt-3 font-mono-display text-caption"
          style={{ color: 'var(--text-muted)' }}
        >
          <span>Pedal</span>
          <select
            value={deviceModel}
            onChange={(e) => onDeviceModelChange(e.target.value as DeviceModelId)}
            className="rounded px-1.5 py-0.5 bg-transparent"
            style={{ border: '1px solid rgba(128,128,128,0.30)', color: 'inherit' }}
          >
            {Object.values(DEVICE_MODELS).map((model) => (
              <option key={model.id} value={model.id}>{model.name}</option>
            ))}
          </select>
          <span>
            {`${ctrlCount} footswitches. Assignments for any switch
              your pedal lacks are kept in the patch, not erased.`}
          </span>
        </label>
      )}

      <div className="flex items-center justify-between gap-3 mt-4 mb-2">
        <p className="text-xs min-w-0" style={{ color: 'var(--text-secondary)' }}>
          <span
            className="font-mono-display text-label font-bold tracking-wider mr-2"
            style={{ color: 'var(--accent)' }}
          >
            {`CTRL ${activeCtrl + 1}`}
          </span>
          {summary}
        </p>
        {onCtrlClear && (
          <button
            type="button"
            disabled={selectedModules.length === 0}
            onClick={() => onCtrlClear(activeCtrl)}
            className="font-mono-display text-label font-bold tracking-wider uppercase
              px-2.5 py-1.5 rounded flex-shrink-0 disabled:opacity-40"
            style={{
              border: '1px solid rgba(0,0,0,0.14)',
              color: 'var(--text-primary)',
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {BLOCK_INDICES.map((blockIndex) => {
          const slotInfo = slotByBlock.get(blockIndex);
          return (
            <PedalCard
              key={blockIndex}
              blockIndex={blockIndex}
              effectName={blockEffectName(blockIndex, slotInfo?.effectName)}
              bypassed={slotInfo?.bypassed ?? false}
              active={(selectedMask & blockBit(blockIndex)) !== 0}
              ctrlIndex={activeCtrl}
              onToggle={onCtrlBlockToggle}
            />
          );
        })}
      </div>

      <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
        Assignments are kept with the patch and included in exported .prst
        files.{deviceHint} To trigger a CTRL from the pedal, map a footswitch
        to it in the device&apos;s footswitch settings (Settings → Footswitch).
      </p>
    </div>
  );
}
