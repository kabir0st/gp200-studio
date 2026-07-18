import type { KnobParam } from '@/core/effectParams';
import { clampSnap, formatValue } from '@/components/board/paramValue';

interface ParamSliderProps {
  param: KnobParam;
  value: number;
  onChange: (value: number) => void;
}

/**
 * One knob param as a full-width slider with −/+ steppers.
 *
 * Deliberately a native <input type="range"> rather than a scaled-up
 * PedalKnob: the platform handles touch, scroll-vs-drag disambiguation and
 * slider semantics for assistive tech, whereas the knob's manual pointer
 * capture plus `touch-action: none` is exactly what fights a scrolling parent —
 * and this list scrolls. The slider's axis is horizontal and the list's is
 * vertical, so the two never compete.
 *
 * The steppers exist because a ~340px track cannot resolve a 0..100 param to
 * single units; they move by exactly one `param.step`.
 */
export function ParamSlider({ param, value, onChange }: ParamSliderProps) {
  const step = param.step > 0 ? param.step : 1;

  function nudge(direction: -1 | 1) {
    onChange(clampSnap(value + direction * step, param));
  }

  return (
    <div className="m-param">
      <div className="m-param-head">
        <span className="m-param-name">{param.name}</span>
        <span className="m-param-value">{formatValue(value, param)}</span>
      </div>
      <div className="m-param-control">
        <button
          type="button"
          className="m-nudge"
          aria-label={`Decrease ${param.name}`}
          disabled={value <= param.min}
          onClick={() => nudge(-1)}
        >
          −
        </button>
        <input
          type="range"
          className="m-slider"
          min={param.min}
          max={param.max}
          step={step}
          value={value}
          aria-label={param.name}
          aria-valuetext={formatValue(value, param)}
          onChange={(e) => onChange(clampSnap(Number(e.target.value), param))}
        />
        <button
          type="button"
          className="m-nudge"
          aria-label={`Increase ${param.name}`}
          disabled={value >= param.max}
          onClick={() => nudge(1)}
        >
          +
        </button>
      </div>
    </div>
  );
}
