import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mute preference is the only part of src/lib/uiSound.ts that is testable
 * in jsdom — there is no Web Audio there, so playback is exercised by hand in
 * the browser. What matters here is that a blocked or empty store stays
 * audible and that the flag survives a reload.
 *
 * The module caches the flag, so every case re-imports it fresh.
 */
async function freshModule() {
  vi.resetModules();
  return import('@/lib/uiSound');
}

describe('uiSound preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to on when nothing is stored', async () => {
    const { isUiSoundEnabled } = await freshModule();
    expect(isUiSoundEnabled()).toBe(true);
  });

  it('persists a mute and reads it back on the next load', async () => {
    const first = await freshModule();
    first.setUiSoundEnabled(false);
    expect(first.isUiSoundEnabled()).toBe(false);
    expect(localStorage.getItem('gp200:ui-sound')).toBe('off');

    const reloaded = await freshModule();
    expect(reloaded.isUiSoundEnabled()).toBe(false);
  });

  it('unmutes again', async () => {
    localStorage.setItem('gp200:ui-sound', 'off');
    const mod = await freshModule();
    expect(mod.isUiSoundEnabled()).toBe(false);
    mod.setUiSoundEnabled(true);
    expect(mod.isUiSoundEnabled()).toBe(true);
    expect(localStorage.getItem('gp200:ui-sound')).toBe('on');
  });

  it('stays audible when the store is unreadable, and never throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const mod = await freshModule();
      expect(mod.isUiSoundEnabled()).toBe(true);
      expect(() => mod.setUiSoundEnabled(false)).not.toThrow();
      expect(mod.isUiSoundEnabled()).toBe(false);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('playSwitchClick is inert without Web Audio rather than throwing', async () => {
    const mod = await freshModule();
    expect(() => mod.playSwitchClick(true)).not.toThrow();
    expect(() => mod.preloadSwitchClicks()).not.toThrow();
  });
});
