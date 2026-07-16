/**
 * HLX → GP200Preset Converter (Experimental)
 *
 * Converts Line6 HX Stomp .hlx presets (JSON) to GP-200 .prst format.
 * Best-effort mapping — different devices, different effects, approximate results.
 */

import type { GP200Preset, EffectSlot } from './types';
import { EFFECT_MAP } from './effectNames';

// ── GP-200 module slot order (fixed signal chain) ──────────────────────
const GP200_MODULES = ['PRE', 'WAH', 'DST', 'AMP', 'NR', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'] as const;

// ── Default effect per GP-200 module (used when no better match found) ─
const MODULE_DEFAULTS: Record<string, number> = {
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

// ── HLX model → GP-200 module classification ──────────────────────────
interface HLXBlock {
  '@model': string;
  '@type': number;
  '@position': number;
  '@enabled': boolean;
  '@path'?: number;
  [key: string]: unknown;
}

function classifyHLXBlock(block: HLXBlock): string | null {
  const model = block['@model'] ?? '';
  const type = block['@type'];
  const m = model.toLowerCase();

  // Type-based classification (reliable)
  if (type === 1 || type === 3) return 'AMP';
  if (type === 2 || type === 4) return 'CAB';

  // Type 7: Delay or Reverb — distinguish by model name
  if (type === 7) {
    if (m.includes('delay') || m.includes('echo') || m.includes('dl4')) return 'DLY';
    return 'RVB';
  }

  // Type 0: Everything else — classify by model name keywords
  // Check dist/drive BEFORE comp (e.g. "CompulsiveDrive" contains "comp" but is a distortion)
  if (m.includes('dist') || m.includes('drive') || m.includes('boost') || m.includes('fuzz') || m.includes('scream') || m.includes('rat')) return 'DST';
  if (m.includes('compressor') || m.includes('squeeze') || m.includes('lacomp') || m.includes('redcomp') || /\bcomp\b/.test(m)) return 'PRE';
  if (m.includes('eq') || m.includes('graphic') || m.includes('parametric')) return 'EQ';
  if (m.includes('chorus') || m.includes('flanger') || m.includes('phaser') || m.includes('trem') || m.includes('vibe') || m.includes('vibrato') || m.includes('roto')) return 'MOD';
  if (m.includes('wah') || m.includes('filter') || m.includes('mutant')) return 'WAH';
  if (m.includes('pitch') || m.includes('octav') || m.includes('harmony') || m.includes('swell')) return 'PRE';
  if (m.includes('gate') || m.includes('noise')) return 'NR';
  if (m.includes('vol')) return 'VOL';

  // Fallback: put unknowns in MOD
  return 'MOD';
}

// ── Find closest GP-200 effect by module + keyword matching ────────────
function findBestEffect(module: string, hlxModel: string): number {
  const m = hlxModel.toLowerCase();
  const candidates = Object.entries(EFFECT_MAP)
    .filter(([, info]) => info.module === module)
    .map(([id, info]) => ({ id: Number(id), name: info.name.toLowerCase() }));

  if (candidates.length === 0) return MODULE_DEFAULTS[module] ?? 0;

  // Try keyword matching
  const keywords = m.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(k => k.length > 2);
  let bestScore = 0;
  let bestId = candidates[0].id;

  for (const c of candidates) {
    let score = 0;
    for (const kw of keywords) {
      if (c.name.includes(kw)) score += kw.length;
    }
    // Bonus for specific well-known mappings
    if (m.includes('plexi') && c.name.includes('uk')) score += 5;
    if (m.includes('marshall') && c.name.includes('uk')) score += 5;
    if (m.includes('fender') && (c.name.includes('dark') || c.name.includes('twin') || c.name.includes('tweedy'))) score += 5;
    if (m.includes('mesa') && c.name.includes('mess')) score += 5;
    if (m.includes('bogner') && c.name.includes('bog')) score += 5;
    if (m.includes('vox') && c.name.includes('match')) score += 5;
    if (m.includes('orange') && c.name.includes('knights')) score += 5;
    if (m.includes('ubersonic') && c.name.includes('dizz')) score += 5;
    if (m.includes('greenback') && c.name.includes('uk gr')) score += 5;
    if (m.includes('caliv30') && c.name.includes('mess')) score += 5;
    if (m.includes('analog') && c.name.includes('analog')) score += 5;
    if (m.includes('tape') && c.name.includes('tape')) score += 5;
    if (m.includes('plate') && c.name.includes('plate')) score += 5;
    if (m.includes('room') && c.name.includes('room')) score += 5;
    if (m.includes('hall') && c.name.includes('hall')) score += 5;
    if (m.includes('spring') && c.name.includes('spring')) score += 5;
    if (m.includes('shimmer') && c.name.includes('shimmer')) score += 5;
    if (m.includes('chorus') && c.name.includes('chorus')) score += 5;
    if (m.includes('flanger') && c.name.includes('jet')) score += 3;
    if (m.includes('phaser') && c.name.includes('phase')) score += 5;
    if (m.includes('tremolo') && c.name.includes('trem')) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestId = c.id;
    }
  }

  return bestId;
}

// ── Normalize HLX parameter value to GP-200 range (0-100) ─────────────
function normalizeParam(value: unknown, hlxMin = 0, hlxMax = 1): number {
  if (typeof value !== 'number') return 50;
  const clamped = Math.max(hlxMin, Math.min(hlxMax, value));
  return Math.round(((clamped - hlxMin) / (hlxMax - hlxMin)) * 100);
}

// ── Extract params from HLX block → 15 float32 array ──────────────────
function extractParams(block: HLXBlock, module: string): number[] {
  const params = new Array(15).fill(0);

  // Common param mapping based on module type
  switch (module) {
    case 'AMP': {
      params[0] = normalizeParam(block['Drive'] ?? block['Gain'], 0, 1);    // Gain
      params[1] = normalizeParam(block['Presence'], 0, 1);                  // Presence
      params[2] = normalizeParam(block['ChVol'] ?? block['Master'], 0, 1);  // Volume
      params[3] = normalizeParam(block['Bass'], 0, 1);                      // Bass
      params[4] = normalizeParam(block['Mid'] ?? block['Middle'], 0, 1);    // Middle
      params[5] = normalizeParam(block['Treble'], 0, 1);                    // Treble
      break;
    }
    case 'DST': {
      params[0] = normalizeParam(block['Gain'] ?? block['Drive'], 0, 1);
      params[1] = normalizeParam(block['Tone'], 0, 1);
      params[2] = normalizeParam(block['Level'] ?? block['Volume'], -60, 0);
      break;
    }
    case 'DLY': {
      params[0] = normalizeParam(block['Mix'], 0, 1);
      // Time: HLX uses seconds (0-2+), GP-200 uses ms or enum
      const time = typeof block['Time'] === 'number' ? block['Time'] : 0.5;
      params[1] = Math.round(Math.min(time * 1000, 2000)); // ms, capped at 2000
      params[2] = normalizeParam(block['Feedback'], 0, 1);
      break;
    }
    case 'RVB': {
      params[0] = normalizeParam(block['Mix'], 0, 1);
      const predelay = typeof block['Predelay'] === 'number' ? block['Predelay'] : 0;
      params[1] = Math.round(predelay * 1000); // ms
      params[2] = normalizeParam(block['Decay'], 0, 10);
      break;
    }
    case 'PRE': {
      params[0] = normalizeParam(block['Threshold'] ?? block['Gain'] ?? block['Range'], 0, 1);
      params[1] = normalizeParam(block['Ratio'] ?? block['Tone'] ?? block['Q'], 0, 1);
      params[2] = normalizeParam(block['Level'] ?? block['Volume'], 0, 1);
      break;
    }
    case 'MOD': {
      params[0] = normalizeParam(block['Depth'], 0, 1);
      params[1] = normalizeParam(block['Rate'] ?? block['Speed'], 0, 10);
      params[2] = normalizeParam(block['Mix'] ?? block['Volume'] ?? block['Level'], 0, 1);
      break;
    }
    case 'CAB': {
      params[0] = normalizeParam(block['Level'] ?? block['Volume'], -60, 0);
      const lowCut = typeof block['LowCut'] === 'number' ? block['LowCut'] : 80;
      params[1] = Math.round(Math.min(lowCut, 500));
      const highCut = typeof block['HighCut'] === 'number' ? block['HighCut'] : 12000;
      params[2] = Math.round(Math.min(highCut, 20000));
      break;
    }
    case 'NR': {
      params[0] = normalizeParam(block['Threshold'], -96, 0);
      break;
    }
    default: {
      // Generic: try common parameter names
      params[0] = normalizeParam(block['Gain'] ?? block['Drive'] ?? block['Level'], 0, 1);
      params[1] = normalizeParam(block['Tone'] ?? block['Rate'], 0, 1);
      params[2] = normalizeParam(block['Mix'] ?? block['Volume'], 0, 1);
    }
  }

  return params;
}

// ── Main converter ─────────────────────────────────────────────────────
export interface HLXPreset {
  schema?: string;
  data?: {
    tone?: {
      dsp0?: Record<string, HLXBlock>;
      dsp1?: Record<string, HLXBlock>;
      global?: Record<string, unknown>;
      [key: string]: unknown;
    };
    meta?: {
      name?: string;
      author?: string;
      band?: string;
      song?: string;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function convertHLX(hlx: HLXPreset): GP200Preset {
  const meta = hlx.data?.meta ?? {};
  const dsp0 = hlx.data?.tone?.dsp0 ?? {};

  // Extract blocks sorted by position
  const blocks: { key: string; block: HLXBlock }[] = [];
  for (const [key, value] of Object.entries(dsp0)) {
    if (key.startsWith('block') && value && typeof value === 'object' && '@model' in value) {
      blocks.push({ key, block: value as HLXBlock });
    }
  }
  blocks.sort((a, b) => (a.block['@position'] ?? 0) - (b.block['@position'] ?? 0));

  // Classify each block → GP-200 module
  const classified = blocks.map(({ block }) => ({
    block,
    module: classifyHLXBlock(block),
  })).filter(({ module }) => module !== null) as { block: HLXBlock; module: string }[];

  // Build 11 GP-200 effect slots — one per module, in fixed order
  const effects: EffectSlot[] = GP200_MODULES.map((module, slotIndex) => {
    // Find first HLX block that maps to this module
    const match = classified.find(c => c.module === module);

    if (match) {
      const effectId = findBestEffect(module, match.block['@model']);
      const enabled = match.block['@enabled'] !== false;
      const params = extractParams(match.block, module);
      return { slotIndex, effectId, enabled, params };
    }

    // No match — use default, disabled
    return {
      slotIndex,
      effectId: MODULE_DEFAULTS[module] ?? 0,
      enabled: false,
      params: new Array(15).fill(0),
    };
  });

  // Build preset name (max 16 chars for GP-200)
  const rawName = meta.name ?? 'HLX Import';
  const patchName = rawName.slice(0, 16);
  const author = (meta.author ?? '').slice(0, 16) || undefined;

  return {
    version: '1',
    patchName,
    author,
    effects,
    checksum: 0,
    fxLoopSend: 4,
    fxLoopReturn: 4,
  };
}
