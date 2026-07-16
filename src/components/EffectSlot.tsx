import { useState } from 'react';
import type { EffectSlot as EffectSlotType } from '@/core/types';
import { getEffectName, getModuleName, getEffectsByModule, MODULE_COLORS } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { EffectParams } from '@/components/EffectParams';

interface EffectSlotProps {
  slot: EffectSlotType;
  index: number;
  onToggle: (index: number) => void;
  onChangeEffect: (blockIndex: number, effectId: number) => void;
  onParamChange: (blockIndex: number, paramIdx: number, value: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  isDragOver: boolean;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export function EffectSlot({ slot, index, onToggle, onChangeEffect, onParamChange, onDragStart, onDragOver, onDrop, isDragOver, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: EffectSlotProps) {
  const [expanded, setExpanded] = useState(false);
  const effectName = getEffectName(slot.effectId);
  const moduleName = getModuleName(slot.effectId);
  const colors = MODULE_COLORS[moduleName] ?? MODULE_COLORS.VOL;
  const effects = getEffectsByModule(moduleName);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      className="slot-enter rounded-lg transition-all duration-200 active:cursor-grabbing"
      style={{
        animationDelay: `${index * 40}ms`,
        background: 'var(--bg-surface)',
        border: `1px solid ${isDragOver ? colors.accent : slot.enabled ? colors.accentDim : 'var(--border-subtle)'}`,
        boxShadow: slot.enabled
          ? `0 0 20px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.03)`
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
        opacity: isDragOver ? 0.7 : 1,
      }}
      data-testid={`effect-slot-${index}`}
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(!expanded); }
          else if (e.key === 'ArrowUp' && canMoveUp) { e.preventDefault(); onMoveUp(index); }
          else if (e.key === 'ArrowDown' && canMoveDown) { e.preventDefault(); onMoveDown(index); }
        }}
        aria-expanded={expanded}
        aria-keyshortcuts="ArrowUp ArrowDown"
        aria-label={`${effectName} Parameters`}
        data-testid={`effect-slot-header-${index}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Drag handle */}
          <span className="cursor-grab flex-shrink-0 text-sm leading-none"
            style={{ color: 'var(--text-muted)' }}
            aria-hidden="true"
            onMouseDown={(e) => e.stopPropagation()}>
            &#x2630;
          </span>

          {/* Module badge */}
          <span className="font-mono-display text-label font-bold tracking-widest px-2 py-0.5 rounded flex-shrink-0 uppercase"
            style={{
              color: colors.accent,
              background: colors.glow,
              border: `1px solid ${colors.accentDim}`,
            }}>
            {moduleName}
          </span>

          {/* Effect selector */}
          <select
            value={slot.effectId}
            onChange={(e) => onChangeEffect(index, Number(e.target.value))}
            onClick={(e) => e.stopPropagation()}
            data-testid={`effect-select-${index}`}
            className="text-sm font-medium bg-transparent border-none cursor-pointer truncate min-w-0 focus:outline-none rounded"
            style={{ color: 'var(--text-primary)' }}
          >
            {effects.map((eff) => (
              <option key={eff.effectId} value={eff.effectId}>
                {eff.name}
              </option>
            ))}
            {!effects.some(e => e.effectId === slot.effectId) && (
              <option value={slot.effectId}>{effectName}</option>
            )}
          </select>

          {/* Description subtitle */}
          {EFFECT_DESCRIPTIONS[effectName] && (
            <span className="text-micro truncate max-w-[200px] hidden sm:inline"
              style={{ color: colors.accentDim }}
              title={EFFECT_DESCRIPTIONS[effectName]}>
              {EFFECT_DESCRIPTIONS[effectName]}
            </span>
          )}

          {/* Expand arrow */}
          <span className="text-xs transition-transform duration-200"
            style={{
              color: 'var(--text-muted)',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
            aria-hidden="true">
            &#x25BE;
          </span>
        </div>

        {/* LED-style ON/OFF toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(index); }}
          aria-pressed={slot.enabled}
          aria-label={`${effectName} ${slot.enabled ? 'enabled' : 'disabled'}`}
          data-testid={`effect-slot-toggle-${index}`}
          className="font-mono-display text-label font-bold tracking-wider px-3 py-1.5 rounded transition-all duration-150 flex-shrink-0 uppercase"
          style={{
            background: slot.enabled ? colors.glow : 'var(--bg-primary)',
            border: `1px solid ${slot.enabled ? colors.accent : 'var(--border-subtle)'}`,
            color: slot.enabled ? colors.accent : 'var(--text-muted)',
            boxShadow: slot.enabled ? `0 0 10px ${colors.glow}` : 'none',
          }}
        >
          {slot.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Expanded params — stop drag so sliders work */}
      {expanded && (
        <div className="px-4 pb-4" draggable onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <EffectParams
            effectId={slot.effectId}
            params={slot.params}
            onParamChange={(paramIdx, value) => onParamChange(index, paramIdx, value)}
            slotIndex={index}
          />
        </div>
      )}
    </div>
  );
}
