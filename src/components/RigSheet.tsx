import { getEffectName, SLOT_MODULES } from '@/core/effectNames';
import { patchStyleName } from '@/core/patchStyles';
import { SysExCodec } from '@/core/SysExCodec';
import type { GP200Preset } from '@/core/types';

interface RigSheetProps {
  preset: GP200Preset;
  currentSlot: number | null;
  presetNames: (string | null)[];
}

/** "L30" / "C" / "R12" — the same reading the deck shows. */
function panLabel(pan: number): string {
  if (pan === 0) return 'C';
  return pan < 0 ? `L${-pan}` : `R${pan}`;
}

/** Which blocks a CTRL footswitch toggles, e.g. "DST, DLY, FX LOOP". */
function ctrlTargets(blockMask: number): string {
  const names: string[] = [];
  for (let block = 0; block < 11; block++) {
    if (blockMask & (1 << block)) names.push(SLOT_MODULES[block]);
  }
  if (blockMask & (1 << 11)) names.push('FX LOOP');
  return names.length > 0 ? names.join(', ') : '—';
}

/**
 * The printable version of the rig: what is in the current patch, what each
 * footswitch does, and the full slot list — on paper, for the music stand.
 *
 * Hidden on screen and revealed by the print stylesheet in index.css, so it
 * never has to fight the board's layout, scroll containers or dialogs. Any
 * PRINT button anywhere in the app is just window.print().
 */
export function RigSheet({ preset, currentSlot, presetNames }: RigSheetProps) {
  const namedSlots = presetNames
    .map((name, slot) => ({ slot, name }))
    .filter((entry) => entry.name !== null && entry.name !== '');

  return (
    <div className="rig-sheet" aria-hidden="true">
      <header className="rs-head">
        <h1>{preset.patchName || 'Untitled patch'}</h1>
        <p>
          {currentSlot !== null ? `Slot ${SysExCodec.slotToLabel(currentSlot)} · ` : ''}
          GP200 Studio rig sheet
        </p>
      </header>

      <section className="rs-block">
        <h2>Patch</h2>
        <dl className="rs-facts">
          <div><dt>Author</dt><dd>{preset.author || '—'}</dd></div>
          <div><dt>Style</dt><dd>{patchStyleName(preset.patchStyle)}</dd></div>
          <div><dt>Tempo</dt><dd>{preset.patchTempo} BPM</dd></div>
          <div><dt>Volume</dt><dd>{preset.patchVolume}</dd></div>
          <div><dt>Pan</dt><dd>{panLabel(preset.patchPan)}</dd></div>
          <div>
            <dt>FX loop</dt>
            <dd>
              {preset.fxLoopSend === preset.fxLoopReturn
                ? 'bypassed'
                : `${preset.fxLoopSend} → ${preset.fxLoopReturn}, ${preset.fxLoopMode === 1 ? 'serial' : 'parallel'}`}
            </dd>
          </div>
        </dl>
        {preset.patchNote && <p className="rs-note">{preset.patchNote}</p>}
      </section>

      <section className="rs-block">
        <h2>Signal chain</h2>
        <ol className="rs-chain">
          {preset.effects.map((slot, position) => (
            <li key={slot.slotIndex} className={slot.enabled ? '' : 'rs-off'}>
              <span className="rs-pos">{position + 1}</span>
              <span className="rs-mod">{SLOT_MODULES[slot.slotIndex]}</span>
              <span className="rs-fx">{getEffectName(slot.effectId) || '—'}</span>
              <span className="rs-state">{slot.enabled ? 'ON' : 'off'}</span>
              <span className="rs-loop">
                {preset.fxLoopSend === position + 1 ? '↗ send' : ''}
                {preset.fxLoopReturn === position + 1 ? ' ↘ return' : ''}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {preset.ctrlAssignments && preset.ctrlAssignments.length > 0 && (
        <section className="rs-block">
          <h2>Footswitches</h2>
          <ol className="rs-ctrl">
            {preset.ctrlAssignments.map((assignment) => (
              <li key={assignment.ctrlIndex}>
                <span className="rs-pos">CTRL {assignment.ctrlIndex + 1}</span>
                <span>{ctrlTargets(assignment.blockMask)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {namedSlots.length > 0 && (
        <section className="rs-block rs-break">
          <h2>Patches ({namedSlots.length})</h2>
          <ul className="rs-slots">
            {namedSlots.map((entry) => (
              <li key={entry.slot} className={entry.slot === currentSlot ? 'rs-now' : ''}>
                <span className="rs-pos">{SysExCodec.slotToLabel(entry.slot)}</span>
                <span>{entry.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
