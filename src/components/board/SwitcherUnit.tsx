import { SysExCodec } from '@/core/SysExCodec';

interface SwitcherUnitProps {
  patchName: string;
  currentSlot: number | null;
  connected: boolean;
  onLoadRequest: () => void;
  onSaveToActiveSlot?: () => void;
}

/** The GP-200 floor unit at the bottom of the board: LCD + LOAD/SAVE. */
export function SwitcherUnit({
  patchName,
  currentSlot,
  connected,
  onLoadRequest,
  onSaveToActiveSlot,
}: SwitcherUnitProps) {
  const slotLabel = currentSlot !== null ? SysExCodec.slotToLabel(currentSlot) : null;
  const canSave = connected && currentSlot !== null && onSaveToActiveSlot !== undefined;

  return (
    <div className="switcher">
      <span className="unit-name">GP-200 · MULTI EFFECTS SWITCHER</span>
      <div className="lcd">
        <div className="row1">{slotLabel ?? '--'} · {patchName.toUpperCase() || 'UNTITLED'}</div>
        <div className="row2">
          {connected ? 'USB-MIDI OK' : 'OFFLINE'} &nbsp;·&nbsp; 11 SLOTS
        </div>
      </div>
      {/* bank stomps are decorative in the editor — switching banks is a floor move */}
      <div className="banks" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`bank${n === 1 ? ' active' : ''}`}>
            <span className="b-led" />
            <button type="button" className="stomp-round" tabIndex={-1} />
            <span className="b-num">{n}</span>
          </div>
        ))}
      </div>
      <div className="sw-actions">
        <button type="button" className="hw-btn" onClick={onLoadRequest}>
          LOAD
        </button>
        <button
          type="button"
          className="hw-btn save"
          disabled={!canSave}
          title={canSave ? undefined : 'Connect the device to save'}
          onClick={onSaveToActiveSlot}
        >
          {slotLabel ? `SAVE TO ${slotLabel}` : 'SAVE'}
        </button>
      </div>
    </div>
  );
}
