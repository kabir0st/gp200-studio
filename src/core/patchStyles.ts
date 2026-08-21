/**
 * Per-patch "style" tag, stored as a u16 LE at .prst offset 0x3C.
 *
 * The GP-200 shows this as the genre label next to a patch in the official
 * editor and on the pedal's own patch list. It is metadata only: nothing in the
 * signal path reads it, but the device preserves it, so dropping it loses a
 * field the user set.
 *
 * Index order matches the official editor's dropdown. Confirmed against real
 * device exports: Rock=5, Funk=6, Blues=8, Clean=12, Nu Metal=14, Grounge=17.
 * "Grounge" is Valeton's own spelling and is kept verbatim so the label matches
 * what the pedal shows.
 */
export const PATCH_STYLES = [
  '—',
  'Metal',
  'World',
  'Indie',
  'Country',
  'Rock',
  'Funk',
  'Pop',
  'Blues',
  'Jazz',
  'Bass',
  'Acoustic',
  'Clean',
  'Punk Rock',
  'Nu Metal',
  'Alt Rock',
  'Rock Lati',
  'Grounge',
  'User7',
  'User8',
] as const;

/** Style index used when a patch carries no style tag. */
export const PATCH_STYLE_NONE = 0;

/**
 * Label for a stored style index. Unknown indices render as `id N` rather than
 * falling back to "—", so an unrecognised value stays visible instead of
 * masquerading as "no style".
 */
export function patchStyleName(index: number): string {
  return PATCH_STYLES[index] ?? `id ${index}`;
}
