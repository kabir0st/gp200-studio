import type { UseMidiDeviceReturn } from '@/hooks/useMidiDevice';

/**
 * A frozen, permanently-disconnected device for the prerendered landing page.
 *
 * `Landing` reads six things off `useMidiDevice()` — status, handshakeStep,
 * errorMessage, currentSlot, presetNames and connect — and never calls the
 * other fifty-odd senders during render. Rather than stub every method (fifty
 * no-ops that assert nothing and rot silently as the interface grows), this
 * supplies exactly the read surface and casts.
 *
 * The cast is safe because nothing here ever reaches a browser: it is used
 * only by renderToStaticMarkup, which runs no effects and no event handlers.
 * The moment the real app boots, createRoot replaces this markup with a
 * Landing wired to the live hook.
 */
const DISCONNECTED = {
  status: 'disconnected',
  handshakeStep: null,
  errorMessage: null,
  currentSlot: null,
  presetNames: [],
  connect: async () => {},
} as const;

export const STUB_MIDI_DEVICE = Object.freeze(DISCONNECTED) as unknown as UseMidiDeviceReturn;
