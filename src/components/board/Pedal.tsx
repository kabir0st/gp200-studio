import { useState, type CSSProperties, type DragEvent } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getModuleName, getEffectsByModule } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { getEffectParams } from '@/core/effectParams';
import { getBodySpec } from './boardPalette';
import { type PedalArtEntry } from './pedalManifest';
import { PedalKnob } from './PedalKnob';
import { PedalFader } from './PedalFader';
import { ComboSelect, MiniSwitch } from './MiniSwitch';

export interface PedalProps {
  slot: EffectSlot;
  /** array position in the chain (0-based) */
  index: number;
  art?: PedalArtEntry;
  onToggle: () => void;
  onChangeEffect: (effectId: number) => void;
  onParamChange: (paramIdx: number, value: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (e: DragEvent, index: number) => void;
  onDrop: (index: number) => void;
  isDragOver: boolean;
  /** keyboard reorder (grip button arrows) */
  onMove: (from: number, to: number) => void;
  /** hover/focus inspection for the info bar */
  onInspect: (inspecting: boolean) => void;
  /** ⓘ click — pin in the info bar */
  onPin: () => void;
  isPinned: boolean;
}

/** One effect slot rendered as a physical pedal (docs/board-design-system.md). */
export function Pedal({
  slot,
  index,
  art,
  onToggle,
  onChangeEffect,
  onParamChange,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
  onMove,
  onInspect,
  onPin,
  isPinned,
}: PedalProps) {
  const [dragging, setDragging] = useState(false);

  const effectName = getEffectName(slot.effectId);
  const moduleName = getModuleName(slot.effectId);
  // authentic per-effect colors from the artwork spec; module palette as fallback
  const spec = art?.colors ?? getBodySpec(moduleName);
  const defs = getEffectParams(slot.effectId);
  const wide = defs.filter((d) => d.type === 'knob').length >= 5;
  const effects = getEffectsByModule(moduleName);
  const caption = art?.basedOn ?? EFFECT_DESCRIPTIONS[effectName] ?? '';

  // amps get a control-panel strip (knobs live on the panel, like the hardware)
  const panel = art?.colors?.panel;
  const panelText = art?.colors?.panelText ?? spec.ink;
  // graphic EQs get faders, not knobs
  const isEq = moduleName === 'EQ';

  const bodyVars = {
    '--body': spec.body,
    '--body-deep': spec.bodyDeep,
    '--ink': spec.ink,
    '--led': spec.led,
    ...(panel ? { '--panel': panel, '--panel-text': panelText } : {}),
  } as CSSProperties;

  const classes = ['pedal'];
  if (wide) classes.push('wide');
  if (dragging) classes.push('dragging');
  if (isDragOver) classes.push('drag-over');

  const footswitch = (
    <button
      type="button"
      className={wide ? 'stomp-round' : 'treadle'}
      aria-pressed={slot.enabled}
      aria-label={`Toggle ${effectName}`}
      onClick={onToggle}
    />
  );

  return (
    <article
      className={classes.join(' ')}
      style={bodyVars}
      data-chain={index}
      data-row={index < 6 ? 'front' : 'back'}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
        onDragStart(index);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      onMouseEnter={() => onInspect(true)}
      onMouseLeave={() => onInspect(false)}
      onFocusCapture={() => onInspect(true)}
      onBlurCapture={() => onInspect(false)}
    >
      <span className="jack in" data-jack="in" />
      <span className="jack out" data-jack="out" />
      <span className="screw tl" /><span className="screw tr" />
      <span className="screw bl" /><span className="screw br" />
      <span className="module-chip">{moduleName}</span>
      <button
        type="button"
        className={`info-chip${isPinned ? ' pinned' : ''}`}
        aria-label={`About ${effectName}`}
        aria-pressed={isPinned}
        onClick={onPin}
      >
        i
      </button>
      <span
        className="chain-num"
        role="button"
        tabIndex={0}
        aria-label={`Reorder ${effectName}, position ${index + 1} of 11. Use arrow keys.`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' && index > 0) {
            e.preventDefault();
            onMove(index, index - 1);
          } else if (e.key === 'ArrowRight' && index < 10) {
            e.preventDefault();
            onMove(index, index + 1);
          }
        }}
      >
        #{index + 1}
      </span>

      {/* knob/switch drags must never start a pedal drag */}
      <div
        className={`controls${panel ? ' amp-panel' : ''}`}
        draggable
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {defs.map((def) => {
          const value = slot.params[def.idx] ?? def.default;
          if (def.type === 'knob') {
            if (isEq) {
              return (
                <PedalFader
                  key={def.idx}
                  param={def}
                  value={value}
                  onChange={(v) => onParamChange(def.idx, v)}
                  pedalName={effectName}
                />
              );
            }
            return (
              <PedalKnob
                key={def.idx}
                param={def}
                value={value}
                onChange={(v) => onParamChange(def.idx, v)}
                knobStyle={spec.knob}
                ink={panel ? panelText : spec.ink}
                pedalName={effectName}
              />
            );
          }
          if (def.type === 'switch') {
            return (
              <MiniSwitch key={def.idx} param={def} value={value} onChange={(v) => onParamChange(def.idx, v)} pedalName={effectName} />
            );
          }
          return (
            <ComboSelect key={def.idx} param={def} value={value} onChange={(v) => onParamChange(def.idx, v)} pedalName={effectName} />
          );
        })}
      </div>

      <span className={`p-led${slot.enabled ? ' on' : ''}`} />

      <div className="p-name">
        <select
          value={slot.effectId}
          aria-label={`${moduleName} effect`}
          onChange={(e) => onChangeEffect(Number(e.target.value))}
        >
          {effects.map((eff) => (
            <option key={eff.effectId} value={eff.effectId}>
              {eff.name}
            </option>
          ))}
          {!effects.some((e) => e.effectId === slot.effectId) && (
            <option value={slot.effectId}>{effectName}</option>
          )}
        </select>
      </div>
      <p className="p-desc" title={caption}>
        {caption}
      </p>

      {wide ? <div className="fs-row">{footswitch}</div> : footswitch}
      <div className="brand-strip">Preset Forge</div>
    </article>
  );
}
