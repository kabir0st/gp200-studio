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

// jsdom has no ResizeObserver; useDialogAnchor observes the dialog panel to
// re-measure when its content swaps. Stub it as inert (jsdom reports zero
// geometry anyway, so there is nothing for it to observe).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
