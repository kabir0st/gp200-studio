import { useState, type CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getSlotModule } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { getEffectParams, type KnobParam } from '@/core/effectParams';
import { getBodySpec } from '@/components/board/boardPalette';
import { EffectPicker } from '@/components/board/EffectPicker';
import { lookupPedalArt, type ManifestIndex } from '@/components/board/pedalManifest';
import { playSwitchClick } from '@/lib/uiSound';
import { PedalArt } from './PedalArt';
import { MobileKnob } from './MobileKnob';
import { FocusRail } from './FocusRail';
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
 * One chain block, as the pedal it is: the artwork on a lit stage, its knobs
 * laid out on a face, and a footswitch under your thumb.
 *
 * The desktop packs all of this onto a 172px enclosure because the whole chain
 * is visible at once. Here only one block is on screen anyway, so the space
 * goes to artwork you can actually see and controls a thumb can actually hit.
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
  /** param the focus rail is pointed at — the last knob touched */
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  const effectName = getEffectName(slot.effectId);
  const moduleName = getSlotModule(slot.slotIndex);
  const art = lookupPedalArt(artIndex, slot.effectId);
  const spec = art?.colors ?? getBodySpec(moduleName);
  const defs = getEffectParams(slot.effectId);
  const basedOn = art?.basedOn ?? EFFECT_DESCRIPTIONS[effectName] ?? '';

  // Knobs go on the face, in hardware order; everything else reads better as a
  // labelled row underneath than as a control squeezed into the same grid.
  const knobs = defs.filter((def): def is KnobParam => def.type === 'knob');
  const rows = defs.filter((def) => def.type !== 'knob');

  const focus = focusIdx === null ? null : (knobs.find((k) => k.idx === focusIdx) ?? null);
  const focusValue = focus ? (slot.params[focus.idx] ?? focus.default) : 0;

  // amps wear their knobs on a control-panel strip, as the hardware does. Read
  // off the manifest rather than `spec`, which falls back to a BodySpec with no
  // panel at all.
  const panel = art?.colors?.panel;
  const panelText = art?.colors?.panelText ?? spec.ink;
  const vars = {
    '--body': spec.body,
    '--body-deep': spec.bodyDeep,
    '--ink': spec.ink,
    '--led': spec.led,
    ...(panel ? { '--panel': panel, '--panel-text': panelText } : {}),
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

      {/* The whole canvas, not the cropped box: the ground shadow under the
          pedal is what makes it read as an object standing on a stage rather
          than a sticker, and it is drawn outside the content box. */}
      {art && (
        <div className="m-hero">
          <PedalArt art={art} fit="full" />
        </div>
      )}

      <button type="button" className="m-identity" onClick={() => setPickerOpen(true)}>
        <span className="m-identity-text">
          <span className="m-identity-name">{effectName}</span>
          {basedOn && <span className="m-identity-based">based on {basedOn}</span>}
        </span>
        <span className="m-identity-swap">SWAP</span>
      </button>

      {defs.length === 0 && <p className="m-empty">This block has no editable parameters.</p>}

      {knobs.length > 0 && (
        <div className={`m-face${panel ? ' amp-panel' : ''}`}>
          {knobs.map((param) => (
            <MobileKnob
              // two defs can share an idx (generated table quirk: Slapback's
              // Sync + Trail both map param 3), so the key needs the name too
              key={`${param.idx}-${param.name}`}
              param={param}
              value={slot.params[param.idx] ?? param.default}
              onChange={(value) => onParamChange(param.idx, value)}
              knobStyle={spec.knob}
              ink={panel ? panelText : spec.ink}
              pedalName={effectName}
              onFocus={setFocusIdx}
            />
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="m-params">
          {rows.map((param) => (
            <ParamRow
              key={`${param.idx}-${param.name}`}
              param={param}
              value={slot.params[param.idx] ?? param.default}
              onChange={(value) => onParamChange(param.idx, value)}
              effectName={effectName}
            />
          ))}
        </div>
      )}

      <div className="m-editor-foot">
        <FocusRail param={focus} value={focusValue} onChange={onParamChange} />

        <button
          type="button"
          className={`m-stomp${slot.enabled ? ' on' : ''}`}
          aria-pressed={slot.enabled}
          onClick={() => {
            // the chassis clack the board's rocker makes; self-gated on the
            // user's sound preference (src/lib/uiSound.ts)
            playSwitchClick(!slot.enabled);
            onToggle();
          }}
        >
          <span className="m-stomp-led" aria-hidden="true" />
          <span className="m-stomp-tread" aria-hidden="true" />
          <span className="m-stomp-label">{slot.enabled ? 'ON' : 'BYPASSED'}</span>
        </button>
      </div>

      <EffectPicker
        open={pickerOpen}
        module={moduleName}
        currentEffectId={slot.effectId}
        artIndex={artIndex}
        onSelect={(effectId) => {
          onChangeEffect(effectId);
          // the new effect has its own params; the rail must not keep pointing
          // at an index that now means something else
          setFocusIdx(null);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
