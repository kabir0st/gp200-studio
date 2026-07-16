import { useMemo } from 'react';
import { getEffectParams, type EffectParam } from '@/core/effectParams';

interface EffectParamsProps {
  effectId: number;
  params: number[];
  onParamChange: (idx: number, value: number) => void;
  maxColumns?: number;
  layout?: 'default' | 'eq';
  slotIndex?: number;
}

function KnobControl({ param, value, onChange, idPrefix }: {
  param: Extract<EffectParam, { type: 'knob' }>;
  value: number;
  onChange: (value: number) => void;
  idPrefix: string;
}) {
  const pct = param.max > param.min
    ? ((value - param.min) / (param.max - param.min)) * 100
    : 0;

  return (
    <div className="flex flex-col gap-1.5 px-1">
      <div className="flex items-center justify-between">
        <label className="text-caption font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
          htmlFor={`${idPrefix}-${param.idx}`}>
          {param.name}
        </label>
        <span className="font-mono-display text-xs tabular-nums"
          style={{ color: 'var(--accent-amber)' }}>
          {Math.round(value)}
        </span>
      </div>
      <div className="relative">
        <div className="absolute top-[12px] left-0 right-0 h-[4px] rounded-full"
          style={{ background: 'var(--knob-track)' }}>
          <div className="h-full rounded-full transition-all duration-75"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, var(--accent-amber-dim), var(--accent-amber))` }} />
        </div>
        <input
          id={`${idPrefix}-${param.idx}`}
          type="range"
          min={param.min}
          max={param.max}
          step={param.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="relative w-full z-10"
          data-testid={`param-knob-${param.idx}`}
        />
      </div>
    </div>
  );
}

function SwitchControl({ param, value, onChange }: {
  param: Extract<EffectParam, { type: 'switch' }>;
  value: number;
  onChange: (value: number) => void;
}) {
  const isOn = value !== 0;
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <span className="text-caption font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}>
        {param.name}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isOn}
        onClick={() => onChange(isOn ? 0 : 1)}
        className="h-8 rounded text-xs font-medium transition-all duration-150 border"
        style={{
          background: isOn ? 'var(--glow-green)' : 'var(--bg-primary)',
          borderColor: isOn ? 'var(--accent-green)' : 'var(--border-subtle)',
          color: isOn ? 'var(--accent-green)' : 'var(--text-muted)',
          boxShadow: isOn ? '0 0 12px var(--glow-green)' : 'none',
        }}
        data-testid={`param-switch-${param.idx}`}
      >
        {isOn ? param.options.find(o => o.id !== 0)?.name ?? 'ON' : param.options.find(o => o.id === 0)?.name ?? 'OFF'}
      </button>
    </div>
  );
}

function ComboxControl({ param, value, onChange, idPrefix }: {
  param: Extract<EffectParam, { type: 'combox' }>;
  value: number;
  onChange: (value: number) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-1">
      <label className="text-caption font-medium uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
        htmlFor={`${idPrefix}-${param.idx}`}>
        {param.name}
      </label>
      <select
        id={`${idPrefix}-${param.idx}`}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="h-8 text-sm rounded px-2 border cursor-pointer transition-colors focus:outline-none"
        style={{
          background: 'var(--bg-primary)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-primary)',
        }}
        data-testid={`param-combox-${param.idx}`}
      >
        {param.options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function VerticalFader({ param, value, onChange, idPrefix }: {
  param: Extract<EffectParam, { type: 'knob' }>;
  value: number;
  onChange: (value: number) => void;
  idPrefix: string;
}) {
  const pct = param.max > param.min
    ? ((value - param.min) / (param.max - param.min)) * 100
    : 0;

  return (
    <div className="flex flex-col items-center gap-1" style={{ minWidth: 32 }}>
      {/* Label */}
      <label
        className="text-micro font-bold uppercase tracking-wider whitespace-nowrap font-mono-display"
        style={{ color: 'var(--text-muted)' }}
        htmlFor={`${idPrefix}-eq-${param.idx}`}
      >
        {param.name}
      </label>

      {/* Vertical slider track */}
      <div className="relative flex items-center justify-center" style={{ height: 100, width: 20 }}>
        {/* Track background */}
        <div
          className="absolute rounded-full"
          style={{
            width: 4,
            height: '100%',
            background: 'rgba(40,40,40,1)',
            border: '1px solid rgba(60,60,60,0.5)',
          }}
        />
        {/* Fill from center (for bipolar -12 to +12) or from bottom */}
        <div
          className="absolute rounded-full transition-all duration-75"
          style={{
            width: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            ...(param.min < 0 ? {
              // Bipolar: fill from center
              bottom: pct > 50 ? '50%' : `${pct}%`,
              height: `${Math.abs(pct - 50)}%`,
            } : {
              // Unipolar: fill from bottom
              bottom: 0,
              height: `${pct}%`,
            }),
            background: 'var(--accent-amber)',
            boxShadow: '0 0 6px var(--glow-amber, rgba(212,162,78,0.3))',
          }}
        />
        {/* Center line for bipolar */}
        {param.min < 0 && (
          <div
            className="absolute"
            style={{
              width: 10,
              height: 1,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(100,100,100,0.5)',
            }}
          />
        )}
        {/* Input — rotated vertical */}
        <input
          id={`${idPrefix}-eq-${param.idx}`}
          type="range"
          min={param.min}
          max={param.max}
          step={param.step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute z-10"
          style={{
            width: 100,
            height: 20,
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            opacity: 0,
            cursor: 'pointer',
          }}
          data-testid={`param-knob-${param.idx}`}
        />
        {/* Thumb indicator */}
        <div
          className="absolute rounded-sm transition-all duration-75"
          style={{
            width: 14,
            height: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: `calc(${pct}% - 3px)`,
            background: 'linear-gradient(180deg, rgba(80,80,80,1), rgba(50,50,50,1))',
            border: '1px solid rgba(100,100,100,0.5)',
            boxShadow: `0 0 8px var(--glow-amber, rgba(212,162,78,0.2)), inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}
        />
      </div>

      {/* Value */}
      <span className="font-mono-display text-micro tabular-nums"
        style={{ color: 'var(--accent-amber)' }}>
        {Math.round(value)}
      </span>
    </div>
  );
}

export function EffectParams({ effectId, params, onParamChange, maxColumns, layout, slotIndex }: EffectParamsProps) {
  // getEffectParams is a static lookup by id. Caching here prevents redoing
  // the object lookup on every parent re-render (slider dragging / live edits).
  const paramDefs = useMemo(() => getEffectParams(effectId), [effectId]);
  const idPrefix = `slot${slotIndex ?? 0}-param`;

  if (paramDefs.length === 0) {
    return (
      <p className="text-xs italic py-3" style={{ color: 'var(--text-muted)' }}>No parameters available</p>
    );
  }

  // EQ layout: vertical faders side by side (like MXR Ten Band EQ)
  if (layout === 'eq') {
    return (
      <div
        className="flex items-end justify-center gap-1 pt-4 mt-3 overflow-x-auto"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
        data-testid="effect-params"
      >
        {paramDefs.map((param) => {
          const raw = params[param.idx] ?? param.default;
        const value = (param.type === 'knob' && raw < param.min) ? param.default : raw;
          const handleChange = (v: number) => onParamChange(param.idx, v);
          if (param.type === 'knob') {
            return <VerticalFader key={param.idx} param={param} value={value} onChange={handleChange} idPrefix={idPrefix} />;
          }
          // Fallback for non-knob params in EQ
          if (param.type === 'switch') {
            return <SwitchControl key={param.idx} param={param} value={value} onChange={handleChange} />;
          }
          if (param.type === 'combox') {
            return <ComboxControl key={param.idx} param={param} value={value} onChange={handleChange} idPrefix={idPrefix} />;
          }
        })}
      </div>
    );
  }

  return (
    <div
      className={`grid gap-x-4 gap-y-3 pt-4 mt-3 ${maxColumns === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}
      style={{ borderTop: '1px solid var(--border-subtle)' }}
      data-testid="effect-params"
    >
      {paramDefs.map((param) => {
        const raw = params[param.idx] ?? param.default;
        const value = (param.type === 'knob' && raw < param.min) ? param.default : raw;
        const handleChange = (v: number) => onParamChange(param.idx, v);

        switch (param.type) {
          case 'knob':
            return <KnobControl key={param.idx} param={param} value={value} onChange={handleChange} idPrefix={idPrefix} />;
          case 'switch':
            return <SwitchControl key={param.idx} param={param} value={value} onChange={handleChange} />;
          case 'combox':
            return <ComboxControl key={param.idx} param={param} value={value} onChange={handleChange} idPrefix={idPrefix} />;
        }
      })}
    </div>
  );
}
