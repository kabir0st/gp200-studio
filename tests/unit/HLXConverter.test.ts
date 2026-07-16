import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { convertHLX } from '@/core/HLXConverter';
import { PRSTEncoder } from '@/core/PRSTEncoder';
import { PRSTDecoder } from '@/core/PRSTDecoder';
import { GP200PresetSchema } from '@/core/types';
import { getModuleName } from '@/core/effectNames';

const HLX_DIR = join(process.cwd(), 'others/line6 helix stomp');

const HLX_FILES = [
  '+#StickPiuPiu.hlx',
  '1.hlx',
  '1984 New.hlx',
  '2.hlx',
  '_ GEKI _ HIZUMI.hlx',
];

function loadHLX(filename: string) {
  const path = join(HLX_DIR, filename);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('HLXConverter', () => {
  it('converts a minimal HLX to valid GP200Preset', () => {
    const hlx = {
      schema: 'L6Preset',
      data: {
        tone: { dsp0: {} },
        meta: { name: 'Test', author: 'Me' },
      },
    };
    const preset = convertHLX(hlx);
    expect(preset.patchName).toBe('Test');
    expect(preset.author).toBe('Me');
    expect(preset.effects).toHaveLength(11);
    expect(() => GP200PresetSchema.parse(preset)).not.toThrow();
  });

  it('handles missing meta gracefully', () => {
    const hlx = { data: { tone: { dsp0: {} } } };
    const preset = convertHLX(hlx);
    expect(preset.patchName).toBe('HLX Import');
    expect(preset.author).toBeUndefined();
  });

  it('truncates long names to 16 chars', () => {
    const hlx = {
      data: {
        tone: { dsp0: {} },
        meta: { name: 'This Is A Very Long Preset Name That Exceeds Limit' },
      },
    };
    const preset = convertHLX(hlx);
    expect(preset.patchName.length).toBeLessThanOrEqual(16);
  });

  it('maps AMP blocks to AMP module', () => {
    const hlx = {
      data: {
        tone: {
          dsp0: {
            block0: {
              '@model': 'HD2_AmpBritPlexiBrt',
              '@type': 1,
              '@position': 0,
              '@enabled': true,
              Drive: 0.8,
              Bass: 0.5,
              Mid: 0.6,
              Treble: 0.7,
              Presence: 0.5,
              ChVol: 0.6,
            },
          },
        },
        meta: { name: 'AmpTest' },
      },
    };
    const preset = convertHLX(hlx);
    // AMP is slot 3 (index in GP200_MODULES)
    const ampSlot = preset.effects[3];
    expect(ampSlot.enabled).toBe(true);
    expect(getModuleName(ampSlot.effectId)).toBe('AMP');
    expect(ampSlot.params[0]).toBeGreaterThan(0); // Gain from Drive=0.8
  });

  it('maps Delay blocks to DLY module', () => {
    const hlx = {
      data: {
        tone: {
          dsp0: {
            block0: {
              '@model': 'HD2_DelayVintageDigitalV2',
              '@type': 7,
              '@position': 0,
              '@enabled': true,
              Mix: 0.35,
              Time: 0.5,
              Feedback: 0.45,
            },
          },
        },
        meta: { name: 'DlyTest' },
      },
    };
    const preset = convertHLX(hlx);
    // DLY is slot 8
    const dlySlot = preset.effects[8];
    expect(dlySlot.enabled).toBe(true);
    expect(getModuleName(dlySlot.effectId)).toBe('DLY');
  });

  it('maps Reverb blocks to RVB module', () => {
    const hlx = {
      data: {
        tone: {
          dsp0: {
            block0: {
              '@model': 'HD2_ReverbPlate',
              '@type': 7,
              '@position': 0,
              '@enabled': true,
              Mix: 0.2,
              Decay: 3.0,
            },
          },
        },
        meta: { name: 'RvbTest' },
      },
    };
    const preset = convertHLX(hlx);
    const rvbSlot = preset.effects[9];
    expect(rvbSlot.enabled).toBe(true);
    expect(getModuleName(rvbSlot.effectId)).toBe('RVB');
  });

  it('maps Distortion blocks to DST module', () => {
    const hlx = {
      data: {
        tone: {
          dsp0: {
            block0: {
              '@model': 'HD2_DistCompulsiveDrive',
              '@type': 0,
              '@position': 0,
              '@enabled': true,
            },
          },
        },
        meta: { name: 'DstTest' },
      },
    };
    const preset = convertHLX(hlx);
    const dstSlot = preset.effects[2];
    expect(dstSlot.enabled).toBe(true);
    expect(getModuleName(dstSlot.effectId)).toBe('DST');
  });

  it('disables unmatched modules', () => {
    const hlx = {
      data: {
        tone: {
          dsp0: {
            block0: {
              '@model': 'HD2_AmpBritPlexiBrt',
              '@type': 1,
              '@position': 0,
              '@enabled': true,
            },
          },
        },
        meta: { name: 'Sparse' },
      },
    };
    const preset = convertHLX(hlx);
    // Only AMP should be enabled, rest disabled
    const enabledCount = preset.effects.filter(e => e.enabled).length;
    expect(enabledCount).toBe(1);
    expect(preset.effects[3].enabled).toBe(true); // AMP
  });
});

describe('HLXConverter with real .hlx files', () => {
  for (const filename of HLX_FILES) {
    const hlx = loadHLX(filename);

    it.skipIf(!hlx)(`converts "${filename}" to valid GP200Preset`, () => {
      const preset = convertHLX(hlx!);
      expect(() => GP200PresetSchema.parse(preset)).not.toThrow();
      expect(preset.effects).toHaveLength(11);
      expect(preset.patchName.length).toBeGreaterThan(0);
      expect(preset.patchName.length).toBeLessThanOrEqual(16);
    });

    it.skipIf(!hlx)(`"${filename}" roundtrips through PRST encode/decode`, () => {
      const preset = convertHLX(hlx!);
      const encoder = new PRSTEncoder();
      const buf = new Uint8Array(encoder.encode(preset));
      expect(buf.length).toBe(1224);
      const decoded = new PRSTDecoder(buf).decode();
      expect(decoded.patchName).toBe(preset.patchName);
      expect(decoded.effects).toHaveLength(11);
    });

    it.skipIf(!hlx)(`"${filename}" has at least one enabled effect`, () => {
      const preset = convertHLX(hlx!);
      const enabledCount = preset.effects.filter(e => e.enabled).length;
      expect(enabledCount).toBeGreaterThan(0);
    });
  }
});
