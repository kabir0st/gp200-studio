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
