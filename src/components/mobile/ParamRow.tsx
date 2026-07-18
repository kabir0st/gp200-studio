import type { EffectParam } from '@/core/effectParams';
import { ParamSlider } from './ParamSlider';

interface ParamRowProps {
  param: EffectParam;
  value: number;
  onChange: (value: number) => void;
  /** for the accessible label on switch/select rows */
  effectName: string;
}

/**
 * Dispatches one param definition to its control. Knobs become sliders; switch
 * and combo params keep native controls, sized up for touch by mobile.css.
 */
export function ParamRow({ param, value, onChange, effectName }: ParamRowProps) {
  if (param.type === 'knob') {
    return <ParamSlider param={param} value={value} onChange={onChange} />;
  }

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
