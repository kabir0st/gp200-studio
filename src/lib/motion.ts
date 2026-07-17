/**
 * Motion tokens shared by CSS keyframes (src/index.css) and GSAP timelines
 * (src/hooks/useGsapTimeline.ts), so both feel like one system. See
 * docs/design-system.md "Motion" for the CSS-vs-GSAP decision rule.
 */

export const motionDurations = {
  fast: 0.15, // hover/press micro-interactions; matches Tailwind `duration-150`
  base: 0.2, // matches Tailwind `duration-200`
  slow: 0.3, // matches the `slot-enter` CSS keyframe
  ambient: 2, // matches the `led-pulse` CSS keyframe loop
} as const;

export const motionEase = {
  out: 'power2.out', // GSAP analogue of CSS `ease-out`, used by slot-enter today
  inOut: 'sine.inOut', // GSAP analogue of CSS `ease-in-out`, used by led-pulse today
  emphasized: 'power3.out', // reserved for future orchestrated multi-step sequences
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
