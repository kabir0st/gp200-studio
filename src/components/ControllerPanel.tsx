import { useState, type CSSProperties } from 'react';
import type { ExpAssignment, GP200Preset } from '@/core/types';
import { getSlotModule, getEffectName, MODULE_COLORS } from '@/core/effectNames';
import { getEffectParams } from '@/core/effectParams';
import { defaultExpAssignments } from '@/core/controlRecords';

/** EXP page indices matching the SysEx protocol */
const EXP_PAGES = [
  { page: 0, label: 'EXP 1 · MODE A', hint: 'Built-in pedal, mode A' },
  { page: 1, label: 'EXP 1 · MODE B', hint: 'Built-in pedal, mode B' },
  { page: 2, label: 'EXP 2', hint: 'External expression pedal' },
] as const;

const ITEMS_PER_PAGE = 3; // Para 1, 2, 3
const PARA_ITEMS = Array.from({ length: ITEMS_PER_PAGE }, (_, paraItem) => paraItem);

interface PedalOption {
  blockIndex: number;
  moduleName: string;
  effectName: string;
}

/** The 11 fixed blocks in block order, with the effect currently loaded in each. */
function buildPedalOptions(preset: GP200Preset): PedalOption[] {
  return [...preset.effects]
    .sort((slotA, slotB) => slotA.slotIndex - slotB.slotIndex)
    .map((slot) => ({
      blockIndex: slot.slotIndex,
      moduleName: getSlotModule(slot.slotIndex),
      effectName: getEffectName(slot.effectId),
    }));
}

function effectIdOfBlock(preset: GP200Preset, blockIndex: number): number | null {
  const slot = preset.effects.find((candidate) => candidate.slotIndex === blockIndex);
  if (!slot) return null;
  return slot.effectId;
}

function assignmentsOf(preset: GP200Preset): ExpAssignment[] {
  return preset.expAssignments ?? defaultExpAssignments();
}

interface ControllerPanelProps {
  preset: GP200Preset | null;
  connected: boolean;
  /** blockIndex null = unassign the Para slot. */
  onParamSelect: (
    page: number,
    item: number,
    blockIndex: number | null,
    paramIdx: number,
  ) => void;
  onMinMax: (page: number, item: number, min: number, max: number) => void;
}

const FIELD_STYLE: CSSProperties = {
  background: 'rgba(0,0,0,0.05)',
  border: '1px solid rgba(0,0,0,0.12)',
  color: 'var(--text-primary)',
};

interface ParaCardProps {
  preset: GP200Preset;
  assignment: ExpAssignment;
  onParamSelect: ControllerPanelProps['onParamSelect'];
  onMinMax: ControllerPanelProps['onMinMax'];
}

/**
 * One assignable "Para" slot: pick the pedal, pick one of its knobs, then
 * set the heel/toe sweep: the values the knob lands on with the expression
 * pedal fully up / fully down.
 */
function ParaCard({ preset, assignment, onParamSelect, onMinMax }: ParaCardProps) {
  const { page, item, blockIndex, paramIndex, min, max } = assignment;
  const pedalOptions = buildPedalOptions(preset);
  const assigned = blockIndex !== null;

  let paramDefs: { name: string }[] = [];
  if (assigned) {
    const effectId = effectIdOfBlock(preset, blockIndex);
    if (effectId !== null) paramDefs = getEffectParams(effectId);
  }
  // Special device targets (e.g. Patch Volume in the official editor) use
  // param indices past the effect's knob list, so keep them selectable.
  const paramBeyondList = assigned && paramIndex >= paramDefs.length;

  const moduleName = assigned ? getSlotModule(blockIndex) : null;
  const accent = moduleName !== null ? MODULE_COLORS[moduleName]?.accent : undefined;

  let summary = 'Not assigned. Pick a pedal to control.';
  if (assigned && moduleName !== null) {
    const paramName = paramDefs[paramIndex]?.name ?? `device target #${paramIndex}`;
    summary = `Sweeps ${moduleName} ${paramName} from ${min} (heel) to ${max} (toe).`;
  }

  function handlePedalChange(rawValue: string) {
    if (rawValue === '') {
      onParamSelect(page, item, null, 0);
      return;
    }
    onParamSelect(page, item, Number(rawValue), 0);
  }

  function handleParamChange(rawValue: string) {
    if (blockIndex === null) return;
    onParamSelect(page, item, blockIndex, Number(rawValue));
  }

  function handleHeelChange(rawValue: string) {
    const heel = Number(rawValue);
    onMinMax(page, item, heel, Math.max(heel, max));
  }

  function handleToeChange(rawValue: string) {
    const toe = Number(rawValue);
    onMinMax(page, item, Math.min(min, toe), toe);
  }

  let pedalValue = '';
  if (assigned) pedalValue = String(blockIndex);

  const cardStyle: CSSProperties = {
    border: '1px solid rgba(0,0,0,0.10)',
    background: 'rgba(0,0,0,0.02)',
  };
  if (accent) cardStyle.borderLeft = `3px solid ${accent}`;

  return (
    <div className="rounded-lg px-3 py-3" style={cardStyle}>
      <div className="flex items-baseline gap-2 mb-2 min-w-0">
        <span
          className="font-mono-display text-label font-bold tracking-wider flex-shrink-0"
          style={{ color: 'var(--accent-amber)' }}
        >
          {`PARA ${item + 1}`}
        </span>
        <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
          {summary}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 min-w-0">
          <span
            className="font-mono-display text-label font-bold tracking-wider uppercase"
            style={{ color: 'var(--text-secondary)' }}
          >
            Pedal
          </span>
          <select
            value={pedalValue}
            onChange={(event) => handlePedalChange(event.target.value)}
            className="text-xs rounded px-2 py-1.5 min-w-0"
            style={FIELD_STYLE}
          >
            <option value="">Not assigned</option>
            {pedalOptions.map((pedalOption) => (
              <option key={pedalOption.blockIndex} value={pedalOption.blockIndex}>
                {`${pedalOption.moduleName} · ${pedalOption.effectName}`}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 min-w-0">
          <span
            className="font-mono-display text-label font-bold tracking-wider uppercase"
            style={{ color: 'var(--text-secondary)' }}
          >
            Parameter
          </span>
          <select
            value={String(paramIndex)}
            onChange={(event) => handleParamChange(event.target.value)}
            disabled={!assigned}
            className="text-xs rounded px-2 py-1.5 min-w-0 disabled:opacity-40"
            style={FIELD_STYLE}
          >
            {paramDefs.map((paramDef, paramIdx) => (
              // paramIdx is the protocol value the device expects for this
              // knob (position in the effect's param list); it IS the data.
              <option key={paramDef.name} value={paramIdx}>
                {paramDef.name}
              </option>
            ))}
            {paramBeyondList && (
              <option value={paramIndex}>{`Device target #${paramIndex}`}</option>
            )}
            {!assigned && <option value="0">-</option>}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-2.5">
        <label className="flex flex-col gap-1">
          <span
            className="font-mono-display text-label font-bold tracking-wider uppercase"
            style={{ color: 'var(--text-secondary)' }}
          >
            Heel <b style={{ color: 'var(--text-primary)' }}>{min}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={min}
            disabled={!assigned}
            onChange={(event) => handleHeelChange(event.target.value)}
            className="disabled:opacity-40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span
            className="font-mono-display text-label font-bold tracking-wider uppercase"
            style={{ color: 'var(--text-secondary)' }}
          >
            Toe <b style={{ color: 'var(--text-primary)' }}>{max}</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={max}
            disabled={!assigned}
            onChange={(event) => handleToeChange(event.target.value)}
            className="disabled:opacity-40"
          />
        </label>
      </div>
    </div>
  );
}

/**
 * EXP pedal assignment, controlled from preset.expAssignments: 3 pages
 * (EXP1 mode A/B, EXP2) × 3 Para slots. Edits persist with the patch; when
 * a device is connected they are also applied live over SysEx.
 */
export function ControllerPanel({
  preset,
  connected,
  onParamSelect,
  onMinMax,
}: ControllerPanelProps) {
  const [selectedPage, setSelectedPage] = useState<number>(0);

  if (!preset) return null;

  const assignments = assignmentsOf(preset);
  const pageInfo = EXP_PAGES.find((expPage) => expPage.page === selectedPage) ?? EXP_PAGES[0];
  const pageAssignments = PARA_ITEMS.map((paraItem) => {
    const found = assignments.find(
      (assignment) => assignment.page === selectedPage && assignment.item === paraItem,
    );
    return found ?? {
      page: selectedPage,
      item: paraItem,
      blockIndex: null,
      paramIndex: 0,
      min: 0,
      max: 100,
    };
  });

  let liveHint = 'Offline: assignments save with the patch; connect to also hear them live.';
  if (connected) {
    liveHint = 'Connected: changes apply to the device immediately; SAVE to persist them.';
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Expression pedal page" className="flex flex-wrap gap-2">
        {EXP_PAGES.map((expPage) => {
          const selected = expPage.page === selectedPage;
          const tabStyle: CSSProperties = {
            border: '1px solid rgba(0,0,0,0.14)',
            background: 'rgba(0,0,0,0.03)',
            color: 'var(--text-primary)',
          };
          if (selected) {
            tabStyle.border = '1px solid var(--accent-amber)';
            tabStyle.background = 'rgba(212,162,78,0.10)';
          }
          return (
            <button
              key={expPage.page}
              type="button"
              role="radio"
              aria-checked={selected}
              title={expPage.hint}
              onClick={() => setSelectedPage(expPage.page)}
              className="font-mono-display text-label font-bold tracking-wider
                px-3 py-2 rounded-lg flex-1 min-w-24"
              style={tabStyle}
            >
              {expPage.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs mt-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
        {pageInfo.hint}. Each Para slot ties the pedal&apos;s travel to one knob.
        Heel is the value with the pedal up, Toe with it pressed down.
      </p>

      <div className="space-y-2">
        {pageAssignments.map((assignment) => (
          <ParaCard
            key={`${assignment.page}-${assignment.item}`}
            preset={preset}
            assignment={assignment}
            onParamSelect={onParamSelect}
            onMinMax={onMinMax}
          />
        ))}
      </div>

      <p className="text-xs mt-3" style={{ color: 'var(--text-secondary)' }}>
        {liveHint}
      </p>
    </div>
  );
}
