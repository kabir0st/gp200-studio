import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { buildManifestIndex, lookupPedalArt, type PedalArtEntry } from '@/components/board/pedalManifest';

const entries: PedalArtEntry[] = [
  { name: 'COMP', module: 'PRE', slug: 'comp', file: 'comp.svg', type: 'Compressor', basedOn: 'Ross™ Compressor', blurb: 'Evens out dynamics.' },
  { name: 'Tube', module: 'DST', slug: 'tube', file: 'tube--dst.svg', type: 'Overdrive', basedOn: 'BK Butler® Tube Driver', blurb: 'Tube drive.' },
  { name: 'Tube', module: 'DLY', slug: 'tube', file: 'tube--dly.svg', type: 'Delay', basedOn: 'Binson® Echorec', blurb: 'Drum echo.' },
];

describe('buildManifestIndex', () => {
  it('indexes by module + name so same-name effects stay distinct', () => {
    const index = buildManifestIndex(entries);
    expect(index.size).toBe(3);
    expect(index.get('DST::Tube')?.file).toBe('tube--dst.svg');
    expect(index.get('DLY::Tube')?.file).toBe('tube--dly.svg');
  });
});

describe('lookupPedalArt', () => {
  const index = buildManifestIndex(entries);

  it('finds art via the effect id (module + name join)', () => {
    // effectId 0 = COMP / PRE in EFFECT_MAP
    expect(lookupPedalArt(index, 0)?.file).toBe('comp.svg');
  });

  it('disambiguates the DST/DLY "Tube" collision', () => {
    expect(lookupPedalArt(index, 50331659)?.file).toBe('tube--dst.svg'); // DST Tube
    expect(lookupPedalArt(index, 184549387)?.file).toBe('tube--dly.svg'); // DLY Tube
  });

  it('returns undefined for effects without artwork and for a null index', () => {
    expect(lookupPedalArt(index, 26)).toBeUndefined(); // PRE Boost, not in fixture
    expect(lookupPedalArt(null, 0)).toBeUndefined();
  });
});

describe('generated manifest.json (public/pedals/)', () => {
  const manifest: PedalArtEntry[] = JSON.parse(
    readFileSync(join(process.cwd(), 'public/pedals/manifest.json'), 'utf8'),
  );

  it('every entry carries a full body-colors block with valid values', () => {
    const hex = /^#[0-9a-f]{6}$/i;
    expect(manifest.length).toBeGreaterThan(250);
    for (const entry of manifest) {
      const c = entry.colors;
      expect(c, `${entry.module}::${entry.name} has no colors`).toBeDefined();
      expect(c!.body).toMatch(hex);
      expect(c!.bodyDeep).toMatch(hex);
      expect(c!.ink).toMatch(hex);
      expect(c!.led).toMatch(hex);
      expect(['dark', 'cream', 'gold']).toContain(c!.knob);
      if (c!.panel !== undefined) {
        expect(c!.panel).toMatch(hex);
        expect(c!.panelText).toMatch(hex);
      }
    }
  });

  it('amp-head effects carry a control-panel color, others never do', () => {
    // not all AMP-module effects are drawn as amp heads (bass preamps are
    // racks/stomps), but the bulk are, and only AMP entries may have a panel
    const withPanel = manifest.filter((e) => e.colors?.panel !== undefined);
    expect(withPanel.length).toBeGreaterThan(40);
    expect(withPanel.every((e) => e.module === 'AMP')).toBe(true);
    expect(manifest.find((e) => e.name === 'UK 800')?.colors?.panel).toBeDefined();
  });
});
