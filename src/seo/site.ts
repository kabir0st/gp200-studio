/** Canonical identity of the site. Every URL in the build derives from here. */

export const ORIGIN = 'https://gp200studio.com';
export const SITE_NAME = 'GP200 Studio';
export const OG_IMAGE = `${ORIGIN}/og-image.png`;
export const OG_IMAGE_ALT =
  'GP200 Studio: edit and push Valeton GP-200 presets live from your browser.';

export const AUTHOR = {
  name: 'Kabir Tamari',
  url: 'https://kabirtamari.com',
  sameAs: ['https://github.com/kabir0st', 'https://www.linkedin.com/in/kabirtamari/'],
} as const;

export const REPO = 'https://github.com/kabir0st/gp200-studio';
export const LICENSE = 'https://www.gnu.org/licenses/gpl-3.0.html';

/** Stable @id fragments so the JSON-LD graph nodes can cross-reference. */
export const ID = {
  author: `${ORIGIN}/#kabir`,
  website: `${ORIGIN}/#website`,
  app: `${ORIGIN}/#app`,
} as const;

export const APP_DESCRIPTION =
  "Free, open-source browser editor and multi-layer loop station for the Valeton GP-200 guitar multi-effects pedal. Load, edit and export .prst files, push changes live over USB-MIDI, and stack unlimited loops over the pedal's USB audio, all client-side, no backend.";

export const APP_FEATURES = [
  "Multi-layer loop station over the GP-200's USB audio with footswitch MIDI-learn",
  'Edit Valeton GP-200 .prst preset files in the browser',
  'Push preset changes live to the pedal over USB-MIDI (SysEx)',
  'Export edited presets and bulk-export device patches',
  'Assign EXP pedal and CTRL footswitches per patch',
] as const;

/** Absolute URL for a site-root-relative path. */
export function abs(path: string): string {
  return `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}
