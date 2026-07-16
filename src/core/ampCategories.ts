/**
 * Static lookup table for amp category landing pages.
 *
 * The GP-200 has ~80 modelled amps. Each has a Valeton display name (e.g.
 * "UK 800") and a real-world name (e.g. "Marshall® JCM800"). A slug is
 * derived from the real name so we get stable, crawlable URLs like
 * /en/amp/marshall-jcm800.
 *
 * Multiple Valeton models can map to the same real amp (e.g. "Mess DualV"
 * + "Mess DualM" both → Mesa/Boogie® Dual Rectifier® modes), so a slug
 * can resolve to multiple Valeton names — the listing query uses an
 * array-overlap filter against Preset.effects.
 */
import { EFFECT_MAP } from './effectNames';
import { EFFECT_DESCRIPTIONS } from './effectDescriptions';

export type AmpCategory = {
  slug: string;
  realName: string;
  valetonNames: string[];
};

/** Slugify a real-world amp name for URL use.
 *  "Fender® '65 Twin Reverb" → "fender-65-twin-reverb"
 *  "Mesa/Boogie® Dual Rectifier® (Modern mode)" → "mesa-boogie-dual-rectifier-modern-mode"
 */
export function slugifyAmpName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[®™]/g, '')            // strip trademark symbols
    .replace(/[^a-z0-9]+/g, '-')     // collapse everything else to hyphens
    .replace(/^-+|-+$/g, '')         // trim leading/trailing hyphens
    .replace(/-{2,}/g, '-');         // collapse repeated hyphens
}

/** Build the full category table once at module load. */
function buildCategories(): AmpCategory[] {
  // Group Valeton AMP effects by the slug of their real-world name.
  const bySlug = new Map<string, AmpCategory>();

  for (const info of Object.values(EFFECT_MAP)) {
    if (info.module !== 'AMP') continue;
    const realName = EFFECT_DESCRIPTIONS[info.name];
    if (!realName) continue; // skip Valeton amps without a real-world mapping
    const slug = slugifyAmpName(realName);
    if (!slug) continue;

    const existing = bySlug.get(slug);
    if (existing) {
      if (!existing.valetonNames.includes(info.name)) {
        existing.valetonNames.push(info.name);
      }
    } else {
      bySlug.set(slug, { slug, realName, valetonNames: [info.name] });
    }
  }

  // Sort alphabetically by slug for deterministic output
  return Array.from(bySlug.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

// Build once at module load — the data is static (from algorithm.xml).
const CATEGORIES: AmpCategory[] = buildCategories();
const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function listAmpCategories(): AmpCategory[] {
  return CATEGORIES;
}

export function findAmpCategoryBySlug(slug: string): AmpCategory | undefined {
  return BY_SLUG.get(slug);
}
