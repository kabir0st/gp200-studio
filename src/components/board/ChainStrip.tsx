import { Fragment, type CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getModuleName } from '@/core/effectNames';
import { getBodySpec } from './boardPalette';

interface ChainStripProps {
  effects: EffectSlot[];
}

/**
 * Slim chip-per-slot signal-chain readout above the board. Chips are
 * numbered to match the #n on each pedal, bracketed by IN and OUT so the
 * signal direction is explicit.
 */
export function ChainStrip({ effects }: ChainStripProps) {
  return (
    <div className="chain-strip">
      <span className="strip-lbl">Signal Chain</span>
      <div className="chain">
        <span className="chain-end">IN</span>
        <span className="chain-arrow" aria-hidden="true">›</span>
        {effects.map((slot, i) => {
          const moduleName = getModuleName(slot.effectId);
          const spec = getBodySpec(moduleName);
          const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
          return (
            <Fragment key={slot.slotIndex}>
              {i > 0 && <span className="chain-arrow" aria-hidden="true">›</span>}
              <span className={`chain-node${slot.enabled ? '' : ' off'}`} style={vars}>
                <span className="cn-num">{i + 1}</span>
                {moduleName}
                <span className="sr-only">{slot.enabled ? ' on' : ' bypassed'}</span>
              </span>
            </Fragment>
          );
        })}
        <span className="chain-arrow" aria-hidden="true">›</span>
        <span className="chain-end">OUT</span>
      </div>
    </div>
  );
}
