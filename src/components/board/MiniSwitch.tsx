import type { ComboxParam, SwitchParam } from '@/core/effectParams';

interface MiniSwitchProps {
  param: SwitchParam;
  value: number;
  onChange: (value: number) => void;
  /** for the accessible label */
  pedalName: string;
}

/** Two-state pill toggle styled in the pedal's ink/led colors. */
export function MiniSwitch({ param, value, onChange, pedalName }: MiniSwitchProps) {
  const on = value !== 0;
  const next = param.options.find((o) => o.id !== value) ?? param.options[0];
  return (
    <div className="mini-switch">
      <button
        type="button"
        className={`sw${on ? ' on' : ''}`}
        role="switch"
        aria-checked={on}
        aria-label={`${pedalName} ${param.name}`}
        onClick={() => onChange(next ? next.id : on ? 0 : 1)}
      />
      <span className="k-label">{param.name}</span>
    </div>
  );
}

interface ComboSelectProps {
  param: ComboxParam;
  value: number;
  onChange: (value: number) => void;
  pedalName: string;
}

/** Compact option selector for multi-choice params (the mockup omits these). */
export function ComboSelect({ param, value, onChange, pedalName }: ComboSelectProps) {
  return (
    <div className="combo-select">
      <select
        value={value}
        aria-label={`${pedalName} ${param.name}`}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {param.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <span className="k-label">{param.name}</span>
    </div>
  );
}
