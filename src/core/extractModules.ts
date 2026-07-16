import type { GP200Preset } from '@/core/types';
import { getModuleName, getEffectName } from '@/core/effectNames';

/** Extract unique module names from active effects in a preset. */
export function extractModules(preset: GP200Preset): string[] {
  const modules = new Set<string>();
  for (const slot of preset.effects) {
    if (!slot.enabled) continue;
    const mod = getModuleName(slot.effectId);
    if (mod !== 'Unknown') modules.add(mod);
  }
  return Array.from(modules);
}

/** Extract unique effect names from active effects in a preset. */
export function extractEffects(preset: GP200Preset): string[] {
  const effects = new Set<string>();
  for (const slot of preset.effects) {
    if (!slot.enabled) continue;
    const name = getEffectName(slot.effectId);
    if (!name.startsWith('Unknown')) effects.add(name);
  }
  return Array.from(effects);
}
