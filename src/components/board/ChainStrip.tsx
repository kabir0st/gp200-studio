import { Fragment, type CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getModuleName } from '@/core/effectNames';
import { getBodySpec } from './boardPalette';

interface ChainStripProps {
  effects: EffectSlot[];
  patchVolume: number;
  patchPan: number;
  patchTempo: number;
}

/** Slim chip-per-slot signal-chain readout above the board. */
export function ChainStrip({ effects, patchVolume, patchPan, patchTempo }: ChainStripProps) {
  const panDisplay = patchPan === 0 ? 'C' : patchPan < 0 ? `L${Math.abs(patchPan)}` : `R${patchPan}`;
  return (
    <div className="chain-strip">
      <span className="strip-lbl">Signal Chain</span>
      <div className="chain">
        {effects.map((slot, i) => {
          const moduleName = getModuleName(slot.effectId);
          const spec = getBodySpec(moduleName);
          const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
          return (
            <Fragment key={slot.slotIndex}>
              {i > 0 && <span className="chain-arrow" aria-hidden="true">›</span>}
              <span className={`chain-node${slot.enabled ? '' : ' off'}`} style={vars}>
                {moduleName}
                <span className="sr-only">{slot.enabled ? ' on' : ' bypassed'}</span>
              </span>
            </Fragment>
          );
        })}
      </div>
      <div className="patch-meta">
        <span>VOL <b>{patchVolume}</b></span>
        <span>PAN <b>{panDisplay}</b></span>
        <span>TEMPO <b>{patchTempo} BPM</b></span>
      </div>
    </div>
  );
}
