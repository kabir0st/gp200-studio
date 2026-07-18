import { useState, type CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { getEffectParams } from '@/core/effectParams';
import { getBodySpec } from '@/components/board/boardPalette';
import { EffectPicker } from '@/components/board/EffectPicker';
import {
  lookupPedalArt,
  pedalArtUrl,
  type ManifestIndex,
} from '@/components/board/pedalManifest';
import { ParamRow } from './ParamRow';

interface PedalEditorScreenProps {
  slot: EffectSlot;
  /** array position in the chain, for the "3 of 11" readout */
  index: number;
  chainLength: number;
  artIndex: ManifestIndex | null;
  onBack: () => void;
  onToggle: () => void;
  onChangeEffect: (effectId: number) => void;
  onParamChange: (paramIdx: number, value: number) => void;
}

/**
 * Full-screen editor for one chain block: identity, effect swap, every param,
 * and the bypass control parked in the thumb zone.
 *
 * The desktop packs these onto a 172px enclosure face because the whole chain
 * is visible at once. On a phone only one block is on screen anyway, so the
 * space goes to legible labels and reachable controls instead.
 */
export function PedalEditorScreen({
  slot,
  index,
  chainLength,
  artIndex,
  onBack,
  onToggle,
  onChangeEffect,
  onParamChange,
}: PedalEditorScreenProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const effectName = getEffectName(slot.effectId);
  const moduleName = getSlotModule(slot.slotIndex);
  const art = lookupPedalArt(artIndex, slot.effectId);
  const spec = art?.colors ?? getBodySpec(moduleName);
  const defs = getEffectParams(slot.effectId);
  const basedOn = art?.basedOn ?? EFFECT_DESCRIPTIONS[effectName] ?? '';

  const vars = {
    '--body': spec.body,
    '--body-deep': spec.bodyDeep,
    '--ink': spec.ink,
    '--led': spec.led,
  } as CSSProperties;

  return (
    <div className="m-screen editor" style={vars}>
      <div className="m-editor-head">
        <button type="button" className="m-back" onClick={onBack}>
          ‹ CHAIN
        </button>
        <span className="m-editor-pos">
          {moduleName} · {index + 1}/{chainLength}
        </span>
      </div>

      <button type="button" className="m-identity" onClick={() => setPickerOpen(true)}>
        {art && <img className="m-identity-art" src={pedalArtUrl(art)} alt="" />}
        <span className="m-identity-text">
          <span className="m-identity-name">{effectName}</span>
          {basedOn && <span className="m-identity-based">based on {basedOn}</span>}
        </span>
        <span className="m-identity-swap">SWAP</span>
      </button>

      <div className="m-params">
        {defs.length === 0 && <p className="m-empty">This block has no editable parameters.</p>}
        {defs.map((param) => (
          <ParamRow
            key={param.idx}
            param={param}
            value={slot.params[param.idx] ?? param.default}
            onChange={(value) => onParamChange(param.idx, value)}
            effectName={effectName}
          />
        ))}
      </div>

      <div className="m-editor-foot">
        <button
          type="button"
          className={`m-bypass${slot.enabled ? ' on' : ''}`}
          aria-pressed={slot.enabled}
          onClick={onToggle}
        >
          <span className="m-bypass-led" aria-hidden="true" />
          {slot.enabled ? 'ON' : 'BYPASSED'}
        </button>
      </div>

      <EffectPicker
        open={pickerOpen}
        module={moduleName}
        currentEffectId={slot.effectId}
        artIndex={artIndex}
        onSelect={(effectId) => {
          onChangeEffect(effectId);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
