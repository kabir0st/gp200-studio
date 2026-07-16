import { describe, it, expect } from 'vitest';
import { BOARD_BODY, KNOB_STYLES, getBodySpec } from '@/components/board/boardPalette';
import { EFFECT_MAP } from '@/core/effectNames';

describe('BOARD_BODY', () => {
  it('covers every module that appears in EFFECT_MAP', () => {
    const modules = new Set(Object.values(EFFECT_MAP).map((e) => e.module));
    for (const module of modules) {
      expect(BOARD_BODY[module], `missing body spec for module ${module}`).toBeDefined();
    }
  });

  it('every spec uses a valid knob style and hex colors', () => {
    for (const [module, spec] of Object.entries(BOARD_BODY)) {
      expect(KNOB_STYLES[spec.knob], `bad knob style on ${module}`).toBeDefined();
      for (const color of [spec.body, spec.bodyDeep, spec.ink, spec.led]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('getBodySpec', () => {
  it('falls back to the VOL spec for unknown modules', () => {
    expect(getBodySpec('Unknown')).toBe(BOARD_BODY.VOL);
    expect(getBodySpec('AMP')).toBe(BOARD_BODY.AMP);
  });
});
