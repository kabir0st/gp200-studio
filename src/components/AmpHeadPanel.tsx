import { getEffectParams, type EffectParam } from '@/core/effectParams';
import { getEffectName, MODULE_COLORS } from '@/core/effectNames';
import { EFFECT_DESCRIPTIONS } from '@/core/effectDescriptions';
import type { GP200Preset } from '@/core/types';
import { Card } from '@/components/ui/Card';

interface AmpHeadPanelProps {
  preset: GP200Preset;
  onParamChange: (blockIndex: number, paramIndex: number, value: number) => void;
}

function AmpSlider({ def, value, onValueChange }: {
  def: Extract<EffectParam, { type: 'knob' }>;
  value: number;
  onValueChange: (value: number) => void;
}) {
  const pct = def.max > def.min
    ? ((value - def.min) / (def.max - def.min)) * 100
    : 0;
  const colors = MODULE_COLORS.AMP;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-label font-medium uppercase tracking-wider"
          style={{ color: colors.accentDim }}>
          {def.name}
        </label>
        <span className="font-mono-display text-caption tabular-nums"
          style={{ color: colors.accent }}>
          {Math.round(value)}
        </span>
      </div>
      <div className="relative">
        <div className="absolute top-[12px] left-0 right-0 h-[4px] rounded-full"
          style={{ background: colors.glow }}>
          <div className="h-full rounded-full transition-all duration-75"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${colors.accentDim}, ${colors.accent})` }} />
        </div>
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          onChange={(e) => onValueChange(parseFloat(e.target.value))}
          className="relative w-full z-10"
        />
      </div>
    </div>
  );
}

export function AmpHeadPanel({ preset, onParamChange }: AmpHeadPanelProps) {
  const colors = MODULE_COLORS.AMP;
  // Find the AMP effect (module high byte 0x07 or 0x08) and its block index
  const ampBlockIndex = preset.effects.findIndex(e => {
    const mod = (e.effectId >>> 24) & 0xFF;
    return mod === 0x07 || mod === 0x08;
  });
  if (ampBlockIndex === -1) return null;
  const ampEffect = preset.effects[ampBlockIndex];

  const paramDefs = getEffectParams(ampEffect.effectId);
  const ampName = getEffectName(ampEffect.effectId) ?? 'AMP';

  // Drawing layout: Left = params 2(Vol), 0(Gain), 1(Pres) — Right = params 3(Bass), 4(Mid), 5(Treb)
  // But param order varies by AMP model, so use actual param defs (first 6 knobs)
  const knobParams = paramDefs
    .filter((p): p is Extract<typeof p, { type: 'knob' }> => p.type === 'knob')
    .slice(0, 6);
  const leftParams = knobParams.slice(0, 3);
  const rightParams = knobParams.slice(3, 6);

  return (
    <Card moduleColor={colors} className="mb-4 overflow-hidden rounded-xl" style={{ background: colors.glow }}>
      <div className="px-4 py-2 flex items-center gap-2"
        style={{ borderBottom: `1px solid ${colors.glow}` }}>
        <span className="font-mono-display text-caption font-bold uppercase tracking-wider"
          style={{ color: colors.accent }}
          title={EFFECT_DESCRIPTIONS[ampName] ?? ''}>
          {ampName}
        </span>
        {EFFECT_DESCRIPTIONS[ampName] && (
          <span className="text-micro truncate" style={{ color: colors.accentDim }}>
            {EFFECT_DESCRIPTIONS[ampName]}
          </span>
        )}
        {!ampEffect.enabled && (
          <span className="text-label uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            (bypass)
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 p-4">
        <div className="flex flex-col gap-2">
          {leftParams.map(p => (
            <AmpSlider
              key={p.idx}
              def={p}
              value={ampEffect.params[p.idx] ?? 0}
              onValueChange={(v) => onParamChange(ampEffect.slotIndex, p.idx, v)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {rightParams.map(p => (
            <AmpSlider
              key={p.idx}
              def={p}
              value={ampEffect.params[p.idx] ?? 0}
              onValueChange={(v) => onParamChange(ampEffect.slotIndex, p.idx, v)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
