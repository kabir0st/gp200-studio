import { GP200PresetSchema, type GP200Preset } from './types';
import { SLOT_MODULES } from './effectNames';
import { getEffectParams } from './effectParams';

// ── Default effect per GP-200 module ────────────────────────────────────
// Used for the blank "INIT" preset and as HLXConverter's fallback when no
// better match is found for an imported block.
export const MODULE_DEFAULTS: Record<string, number> = {
  PRE: 0,           // COMP
  WAH: 0x05000001,  // V-Wah
  DST: 0x03000000,  // Green OD
  AMP: 0x07000001,  // Tweedy
  NR:  27,          // Gate 1
  CAB: 0x0A000000,  // SUP ZEP
  EQ:  0x01000035,  // Guitar EQ 1
  MOD: 0x01000029,  // Detune
  DLY: 0x0B000000,  // Pure
  RVB: 0x0C000000,  // Room
  VOL: 0x06000003,  // Volume
};

// Init-patch behavior: core tone blocks live, everything else armed but off.
const DEFAULT_ENABLED = new Set(['AMP', 'CAB', 'VOL']);

/**
 * A blank "INIT" preset for opening the editor without a device or file:
 * all 11 blocks with their module's default effect at default params.
 * No rawSource — PRSTEncoder builds a full buffer from scratch for these.
 */
export function createDefaultPreset(): GP200Preset {
  const effects = SLOT_MODULES.map((module, slotIndex) => {
    const effectId = MODULE_DEFAULTS[module] ?? 0;
    const params = Array<number>(15).fill(0);
    for (const def of getEffectParams(effectId)) {
      if (def.idx >= 0 && def.idx < 15) params[def.idx] = def.default;
    }
    return { slotIndex, effectId, enabled: DEFAULT_ENABLED.has(module), params };
  });

  return GP200PresetSchema.parse({
    version: '1',
    patchName: 'INIT',
    effects,
    checksum: 0,
    fxLoopSend: 4,
    fxLoopReturn: 4,
  });
}
