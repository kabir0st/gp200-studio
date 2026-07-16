/**
 * Tiny monochrome module glyph shown beside a pedal's name (docs/pedal-icons.md
 * Tier 1). One simple line-art mark per fixed module, stroked in `currentColor`
 * so it inherits the pedal ink. Kept deliberately minimal so it reads at ~16px.
 */

// each entry is the inner SVG markup for a 16×16 viewBox, stroked by the <svg>
const GLYPHS: Record<string, string> = {
  // compressor/preamp — bars squeezing together
  PRE: '<path d="M3 5h10M4.5 8h7M6 11h4" />',
  // wah — a rocking treadle arc
  WAH: '<path d="M2.5 11.5Q8 2.5 13.5 11.5" />',
  // distortion — a clipped, spiky waveform
  DST: '<path d="M2 8h2l1.5-4 2 8 2-8 1.5 4h3" />',
  // amp — cabinet with a control line
  AMP: '<rect x="3" y="3.5" width="10" height="9" rx="1" /><path d="M3 6.5h10" />',
  // noise gate — two posts with an opening
  NR: '<path d="M4 3.5v9M12 3.5v9M4 8h2.5M9.5 8h2.5" />',
  // cabinet — a speaker cone in a box
  CAB: '<rect x="3" y="3" width="10" height="10" rx="1" /><circle cx="8" cy="8" r="2.4" />',
  // EQ — three faders
  EQ: '<path d="M4 3v10M8 3v10M12 3v10M2.5 6h3M6.5 9.5h3M10.5 5h3" />',
  // modulation — a sine wave
  MOD: '<path d="M2 8C3.6 4 5 4 6.5 8S9.4 12 11 8s2.4-4 3-0" />',
  // delay — decaying repeats
  DLY: '<path d="M3 4v8M7 5.5v5M11 7v2" />',
  // reverb — expanding arcs
  RVB: '<path d="M5 4a5 5 0 0 1 0 8M7.5 2.5a7 7 0 0 1 0 11" />',
  // volume — a rising wedge
  VOL: '<path d="M3 11.5 13 4v7.5Z" />',
};

export function ModuleGlyph({ module, className }: { module: string; className?: string }) {
  const inner = GLYPHS[module] ?? GLYPHS.VOL;
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
