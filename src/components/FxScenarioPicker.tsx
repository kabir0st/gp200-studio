import { FX_SCENARIOS, matchFxScenario } from '@/core/fxScenarios';
import type { GP200Preset } from '@/core/types';

interface FxScenarioPickerProps {
  preset: GP200Preset;
  /** Applies a scenario by id. */
  onApply: (scenarioId: string) => void;
  /** Sets the loop's routing mode directly: 0 = parallel, 1 = serial. */
  onModeChange: (mode: number) => void;
}

/**
 * The "what am I plugging into tonight?" control. Each scenario sets the loop
 * mode and the AMP/CAB blocks in one go; the mode toggle underneath stays
 * available for anyone who wants to set it by hand.
 */
export function FxScenarioPicker({ preset, onApply, onModeChange }: FxScenarioPickerProps) {
  const active = matchFxScenario(preset);

  return (
    <div className="font-mono-display">
      <p className="text-label uppercase tracking-wider text-text-muted mb-2">Rig</p>
      <div className="flex flex-col gap-1.5">
        {FX_SCENARIOS.map((scenario) => {
          const selected = active?.id === scenario.id;
          return (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onApply(scenario.id)}
              className="text-left rounded px-2.5 py-2 transition-colors"
              style={{
                border: '1px solid',
                borderColor: selected ? 'var(--accent)' : 'rgba(128,128,128,0.30)',
                background: selected ? 'rgba(255,176,0,0.10)' : 'transparent',
              }}
            >
              <span className="block text-sm font-bold">{scenario.name}</span>
              <span className="block text-caption text-text-muted">{scenario.description}</span>
            </button>
          );
        })}
      </div>

      <p className="text-label uppercase tracking-wider text-text-muted mt-4 mb-2">Loop routing</p>
      <div className="flex gap-1.5" role="group" aria-label="FX loop routing mode">
        {[
          { mode: 0, label: 'Parallel' },
          { mode: 1, label: 'Serial' },
        ].map(({ mode, label }) => (
          <button
            key={label}
            type="button"
            aria-pressed={preset.fxLoopMode === mode}
            onClick={() => onModeChange(mode)}
            className="flex-1 rounded px-2 py-1.5 text-sm transition-colors"
            style={{
              border: '1px solid',
              borderColor: preset.fxLoopMode === mode ? 'var(--accent)' : 'rgba(128,128,128,0.30)',
              background: preset.fxLoopMode === mode ? 'rgba(255,176,0,0.10)' : 'transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
