import type { CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getEffectName, getModuleName } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import { getBodySpec } from './boardPalette';
import type { PedalArtEntry } from './pedalManifest';

interface InfoBarProps {
  /** the slot being inspected (pinned wins over hover) — null shows the hint */
  slot: EffectSlot | null;
  art?: PedalArtEntry;
  pinned: boolean;
  onUnpin: () => void;
}

/** Persistent strip under the chain strip: what the pedal is based on + what it does. */
export function InfoBar({ slot, art, pinned, onUnpin }: InfoBarProps) {
  if (!slot) {
    return (
      <div className="info-bar" role="status" aria-live="polite">
        <span className="i-glyph" aria-hidden="true">i</span>
        <span className="i-empty">Hover a pedal — or click its ⓘ — to see what it's based on.</span>
      </div>
    );
  }

  const effectName = getEffectName(slot.effectId);
  const moduleName = getModuleName(slot.effectId);
  const spec = getBodySpec(moduleName);
  const chipVars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
  const basedOn = art?.basedOn ?? EFFECT_DESCRIPTIONS[effectName];
  const blurb = art?.blurb;

  return (
    <div className={`info-bar${pinned ? ' pinned' : ''}`} role="status" aria-live="polite">
      <span className="i-glyph" aria-hidden="true">i</span>
      <span className="i-name">{effectName}</span>
      <span className="i-chip" style={chipVars}>{moduleName}</span>
      {art?.type && <span className="i-type">{art.type}</span>}
      {basedOn && (
        <span className="i-based"><b>BASED ON</b> {basedOn}</span>
      )}
      {blurb && <span className="i-blurb">{blurb}</span>}
      {pinned && (
        <button type="button" className="i-unpin" aria-label="Unpin info" onClick={onUnpin}>
          ✕
        </button>
      )}
    </div>
  );
}
