import {
  FS_MODES,
  HOLD_MENU,
  TAP_MENU,
  fsActionLabel,
  type DeviceSettings,
} from '@/core/deviceSettings';
import { Button } from '@/components/ui/Button';

interface DevicePanelProps {
  connected: boolean;
  settings: DeviceSettings;
  onModeChange: (mode: number) => void;
  onTargetChange: (fs: number, kind: 'tap' | 'hold', actionId: number) => void;
  onComboChange: (comboIndex: number, actionId: number) => void;
  onAutoCabChange: (on: boolean) => void;
}

const FS_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
const COMBO_LABELS = ['FS 1+5', 'FS 2+6', 'FS 3+7', 'FS 4+8'];

const SELECT_CLASS =
  'bg-bg-primary border border-border-active rounded px-2 py-1 ' +
  'font-mono-display text-caption text-text-secondary';

function autoCabVariant(on: boolean): 'primary' | 'ghost' {
  if (on) return 'primary';
  return 'ghost';
}

function autoCabLabel(on: boolean): string {
  if (on) return 'ON';
  return 'OFF';
}

interface ActionSelectProps {
  menu: readonly number[];
  value: number;
  ariaLabel: string;
  onChange: (actionId: number) => void;
}

function ActionSelect({ menu, value, ariaLabel, onChange }: ActionSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`flex-1 min-w-0 ${SELECT_CLASS}`}
      aria-label={ariaLabel}
    >
      {menu.map((actionId) => (
        <option key={actionId} value={actionId}>{fsActionLabel(actionId)}</option>
      ))}
    </select>
  );
}

/**
 * Device-global settings editor (SETTINGS → Footswitch on the pedal, plus
 * Auto Cab Match): FS mode, per-switch TAP/HOLD targets, and the four
 * two-switch combos. Every change writes live over SysEx when connected
 * (docs/protocol-capture.md §0.2/§0.3). The protocol is write-only, so the
 * values shown are what the app last set, not read back from the pedal.
 */
export function DevicePanel({
  connected,
  settings,
  onModeChange,
  onTargetChange,
  onComboChange,
  onAutoCabChange,
}: DevicePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="font-mono-display text-caption text-text-muted">
        Writes apply to the pedal instantly while connected. The GP-200 cannot
        be read back, so this panel shows the values the app last set.
        {!connected && ' Currently offline: edits are saved and apply manually.'}
      </p>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="font-mono-display text-label text-text-secondary">FS MODE</span>
          <select
            value={settings.fsMode}
            onChange={(e) => onModeChange(Number(e.target.value))}
            className={SELECT_CLASS}
            aria-label="Footswitch mode"
          >
            {FS_MODES.map((modeName) => (
              <option key={modeName} value={FS_MODES.indexOf(modeName)}>{modeName}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-display text-label text-text-secondary">
            AUTO CAB MATCH
          </span>
          <Button
            variant={autoCabVariant(settings.autoCabMatch)}
            size="sm"
            onClick={() => onAutoCabChange(!settings.autoCabMatch)}
          >
            {autoCabLabel(settings.autoCabMatch)}
          </Button>
        </div>
      </div>

      <div>
        <p className="font-mono-display text-label text-text-muted uppercase tracking-widest mb-2">
          Footswitch targets <span className="normal-case tracking-normal">(User mode)</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {FS_NUMBERS.map((fs) => (
            <div key={fs} className="flex items-center gap-2">
              <span className="font-mono-display text-label text-text-secondary w-10">
                FS{fs}
              </span>
              <ActionSelect
                menu={TAP_MENU}
                value={settings.taps[fs - 1]}
                ariaLabel={`FS${fs} tap target`}
                onChange={(actionId) => onTargetChange(fs, 'tap', actionId)}
              />
              <ActionSelect
                menu={HOLD_MENU}
                value={settings.holds[fs - 1]}
                ariaLabel={`FS${fs} hold target`}
                onChange={(actionId) => onTargetChange(fs, 'hold', actionId)}
              />
            </div>
          ))}
        </div>
        <p className="font-mono-display text-micro text-text-secondary mt-1">
          left = TAP, right = HOLD
        </p>
      </div>

      <div>
        <p className="font-mono-display text-label text-text-muted uppercase tracking-widest mb-2">
          Combos <span className="normal-case tracking-normal">(press two switches together)</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          {COMBO_LABELS.map((comboLabel) => {
            const comboIndex = COMBO_LABELS.indexOf(comboLabel);
            return (
              <div key={comboLabel} className="flex items-center gap-2">
                <span className="font-mono-display text-label text-text-secondary w-14">
                  {comboLabel}
                </span>
                <ActionSelect
                  menu={HOLD_MENU}
                  value={settings.combos[comboIndex]}
                  ariaLabel={`${comboLabel} combo target`}
                  onChange={(actionId) => onComboChange(comboIndex, actionId)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
