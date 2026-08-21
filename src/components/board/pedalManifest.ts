/**
 * Loader + lookup for the generated pedal artwork manifest.
 *
 * `public/pedals/manifest.json` is written by scripts/generate-pedal-art.mjs
 * alongside the per-effect SVGs; it is fetched at runtime (kept out of the JS
 * bundle so the generator output stays the single source of truth). Entries
 * are keyed by display name + module, the same identity as EFFECT_MAP, so a
 * slot's art is found via getEffectName/getModuleName.
 */
import { useEffect, useState } from 'react';
import { getEffectName, getModuleName } from '@/core/effectNames';

export interface PedalArtColors {
  body: string;
  bodyDeep: string;
  ink: string;
  knob: 'dark' | 'cream' | 'gold';
  led: string;
  /** amp control-panel strip color (AMP module only) */
  panel?: string;
  panelText?: string;
}

/**
 * Where the subject actually sits on an artwork's 160×64 canvas.
 *
 * Every template centres its subject and leaves the rest of the canvas empty —
 * a stompbox body is 42 units wide on a 160-wide canvas — so anything that fits
 * the whole canvas into a small box renders the pedal at a fraction of the
 * space it was given. Crop to this instead.
 */
export interface ArtBox {
  /** left edge of the content, in canvas units */
  x: number;
  /** content width, in canvas units */
  w: number;
}

export interface PedalArtEntry {
  name: string;
  module: string;
  slug: string;
  file: string;
  /** effect type, e.g. "Overdrive", "Clean Amp" */
  type: string;
  /** real-world hardware this effect is based on */
  basedOn: string;
  /** one-line "what it does" */
  blurb: string;
  /** authentic body colors derived from the artwork spec (older manifests omit it) */
  colors?: PedalArtColors;
  /** content box of the artwork (older manifests omit it — see artBox) */
  art?: ArtBox;
}

const CANVAS_W = 160;

/**
 * Widest content box per `MODULE::Type`, for manifests written before the
 * generator emitted `art`.
 *
 * Not defensive padding: public/sw.js serves manifest.json
 * stale-while-revalidate, so every returning visitor gets the *previous*
 * manifest on their first load after a deploy and only picks up a newly added
 * field on the load after that.
 *
 * Derived from the generated manifest by taking the **widest** box in each
 * group, and only groups wider than DEFAULT_W are listed. Erring wide is the
 * safe direction: an over-wide box shows a little empty margin, which is merely
 * the old behaviour and less of it, while an over-narrow one clips the pedal.
 */
const FALLBACK_W: Record<string, number> = {
  'AMP::Acoustic Preamp': 148,
  'AMP::Bass Amp': 148,
  'AMP::Clean Amp': 148,
  'AMP::Drive Amp': 148,
  'AMP::Hi-Gain Amp': 148,
  'CAB::Cabinet': 108,
  // delays are drawn with the rack and tape templates as well as the stompbox
  'DLY::Delay': 148,
  'EQ::EQ': 76,
  // treadles: the rocker template spans x 36..124
  'PRE::Pitch': 88,
  'VOL::Volume': 88,
  'WAH::Wah': 88,
};

/** The widest stompbox: a 58-wide body plus its two 3.4-wide side jacks. */
const DEFAULT_W = 64.8;

/** Content box of an entry's artwork, falling back for pre-`art` manifests. */
export function artBox(entry: PedalArtEntry): ArtBox {
  if (entry.art) return entry.art;
  const w = FALLBACK_W[`${entry.module}::${entry.type}`] ?? DEFAULT_W;
  return { x: (CANVAS_W - w) / 2, w };
}

export type ManifestIndex = Map<string, PedalArtEntry>;

export function buildManifestIndex(entries: PedalArtEntry[]): ManifestIndex {
  const index: ManifestIndex = new Map();
  for (const entry of entries) index.set(`${entry.module}::${entry.name}`, entry);
  return index;
}

/** Art entry for an effect, or undefined when no artwork exists for it. */
export function lookupPedalArt(index: ManifestIndex | null, effectId: number): PedalArtEntry | undefined {
  if (!index) return undefined;
  return index.get(`${getModuleName(effectId)}::${getEffectName(effectId)}`);
}

export function pedalArtUrl(entry: PedalArtEntry): string {
  return `${import.meta.env.BASE_URL}pedals/${entry.file}`;
}

let manifestPromise: Promise<PedalArtEntry[]> | null = null;

function fetchManifest(): Promise<PedalArtEntry[]> {
  manifestPromise ??= fetch(`${import.meta.env.BASE_URL}pedals/manifest.json`)
    .then((res) => (res.ok ? (res.json() as Promise<PedalArtEntry[]>) : []))
    .catch(() => []);
  return manifestPromise;
}

/**
 * The manifest index, or null while loading / on failure the board renders
 * placeholder art zones until (unless) it resolves.
 */
export function usePedalManifest(): ManifestIndex | null {
  const [index, setIndex] = useState<ManifestIndex | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchManifest().then((entries) => {
      if (!cancelled && entries.length > 0) setIndex(buildManifestIndex(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return index;
}
