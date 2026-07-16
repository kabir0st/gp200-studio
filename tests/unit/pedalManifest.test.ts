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
    expect(lookupPedalArt(index, 26)).toBeUndefined(); // PRE Boost — not in fixture
    expect(lookupPedalArt(null, 0)).toBeUndefined();
  });
});
