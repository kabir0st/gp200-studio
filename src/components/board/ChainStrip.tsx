import { Fragment, type CSSProperties } from 'react';
import type { EffectSlot } from '@/core/types';
import { getSlotModule } from '@/core/effectNames';
import { getBodySpec } from './boardPalette';

interface ChainStripProps {
  effects: EffectSlot[];
  /** scroll the board to that chain position , the strip doubles as board nav */
  onJump: (index: number) => void;
}

/**
 * Slim chip-per-slot signal-chain readout above the board. Chips are
 * numbered to match the #n on each pedal, bracketed by IN and OUT so the
 * signal direction is explicit.
 *
 * The chips are also the board's navigation: tapping one scrolls that pedal
 * into view. That's the primary way to reach a distant pedal on a phone, where
 * the chain scrolls horizontally and only two or three pedals are on screen.
 */
export function ChainStrip({ effects, onJump }: ChainStripProps) {
  return (
    <div className="chain-strip">
      <span className="strip-lbl">Signal Chain</span>
      <div className="chain">
        <span className="chain-end">IN</span>
        <span className="chain-arrow" aria-hidden="true">›</span>
        {effects.map((slot, i) => {
          const moduleName = getSlotModule(slot.slotIndex);
          const spec = getBodySpec(moduleName);
          const vars = { '--body': spec.body, '--ink': spec.ink } as CSSProperties;
          return (
            <Fragment key={slot.slotIndex}>
              {i > 0 && <span className="chain-arrow" aria-hidden="true">›</span>}
              <button
                type="button"
                className={`chain-node${slot.enabled ? '' : ' off'}`}
                style={vars}
                aria-label={`Scroll to ${moduleName}, position ${i + 1}`}
                onClick={() => onJump(i)}
              >
                <span className="cn-num">{i + 1}</span>
                {moduleName}
                <span className="sr-only">{slot.enabled ? ' on' : ' bypassed'}</span>
              </button>
            </Fragment>
          );
        })}
        <span className="chain-arrow" aria-hidden="true">›</span>
        <span className="chain-end">OUT</span>
      </div>
    </div>
  );
}
