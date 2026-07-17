import '@testing-library/jest-dom/vitest'

// jsdom has no window.matchMedia; GSAP's gsap.matchMedia() (used by
// useGsapTimeline) and prefersReducedMotion() both call it. Provide a minimal
// stub that reports "no match" so animation code runs its full-motion branch.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}
