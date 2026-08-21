import type { SwitchParam, ComboxParam } from '@/core/effectParams';

interface ParamRowProps {
  param: SwitchParam | ComboxParam;
  value: number;
  onChange: (value: number) => void;
  /** for the accessible label */
  effectName: string;
}

/**
 * A switch or mode param, as a full-width row below the pedal face.
 *
 * Knobs are not routed through here — they live in the face grid as MobileKnob,
 * laid out the way they sit on the hardware. These two keep native controls:
 * a toggle and a `<select>` are what touch and assistive tech already know, and
 * a mode list of a dozen options has no better shape on a 390px screen.
 */
export function ParamRow({ param, value, onChange, effectName }: ParamRowProps) {
  if (param.type === 'switch') {
    const on = value !== 0;
    const next = param.options.find((o) => o.id !== value) ?? param.options[0];
    return (
      <div className="m-param row">
        <span className="m-param-name">{param.name}</span>
        <button
          type="button"
          className={`m-switch${on ? ' on' : ''}`}
          role="switch"
          aria-checked={on}
          aria-label={`${effectName} ${param.name}`}
          onClick={() => onChange(next ? next.id : on ? 0 : 1)}
        >
          <span className="m-switch-knob" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="m-param row">
      <span className="m-param-name">{param.name}</span>
      <select
        className="m-select"
        value={value}
        aria-label={`${effectName} ${param.name}`}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {param.options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
