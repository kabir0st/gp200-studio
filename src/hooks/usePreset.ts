import { useState, useCallback } from 'react';
import type { GP200Preset } from '@/core/types';
import { getEffectParams } from '@/core/effectParams';

interface PresetActions {
  preset: GP200Preset | null;
  loadPreset: (preset: GP200Preset) => void;
  setPatchName: (name: string) => void;
  setAuthor: (author: string) => void;
  toggleEffect: (slotIndex: number, forcedState?: boolean) => void;
  changeEffect: (slotIndex: number, effectId: number) => void;
  reorderEffects: (fromIndex: number, toIndex: number) => void;
  setParam: (slotIndex: number, paramIdx: number, value: number) => void;
  setFxLoopSend: (pos: number) => void;
  setFxLoopReturn: (pos: number) => void;
  reset: () => void;
}

export function usePreset(): PresetActions {
  const [preset, setPreset] = useState<GP200Preset | null>(null);

  const loadPreset = useCallback((p: GP200Preset) => {
    setPreset(p);
  }, []);

  const setPatchName = useCallback((name: string) => {
    setPreset((prev) => prev ? { ...prev, patchName: name } : null);
  }, []);

  const setAuthor = useCallback((author: string) => {
    setPreset((prev) => prev ? { ...prev, author: author || undefined } : null);
  }, []);

  const toggleEffect = useCallback((slotIndex: number, forcedState?: boolean) => {
    setPreset((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        effects: prev.effects.map((slot) =>
          slot.slotIndex === slotIndex
            ? { ...slot, enabled: forcedState !== undefined ? forcedState : !slot.enabled }
            : slot
        ),
      };
    });
  }, []);

  const changeEffect = useCallback((slotIndex: number, effectId: number) => {
    setPreset((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        effects: prev.effects.map((slot) => {
          if (slot.slotIndex !== slotIndex) return slot;
          // Fresh 15-float params array — don't leak values from the previous
          // effect (different effects have different param counts; stale
          // floats in unused slots confuse the device).
          const params = Array<number>(15).fill(0);
          for (const def of getEffectParams(effectId)) {
            if (def.idx >= 0 && def.idx < 15) params[def.idx] = def.default;
          }
          return { ...slot, effectId, params };
        }),
      };
    });
  }, []);

  const reorderEffects = useCallback((fromIndex: number, toIndex: number) => {
    setPreset((prev) => {
      if (!prev || fromIndex === toIndex) return prev;
      const effects = [...prev.effects];
      const [moved] = effects.splice(fromIndex, 1);
      effects.splice(toIndex, 0, moved);
      // slotIndex is the PRST block identity (0..10 = PRE..VOL) and MUST stay
      // constant per slot. Only array order changes — the encoder reads
      // slotIndex to place each block at its canonical byte offset.
      return { ...prev, effects };
    });
  }, []);

  const setParam = useCallback((slotIndex: number, paramIdx: number, value: number) => {
    if (paramIdx < 0 || paramIdx >= 15) return;
    setPreset((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        effects: prev.effects.map((slot) => {
          if (slot.slotIndex !== slotIndex) return slot;
          const params = [...slot.params];
          params[paramIdx] = value;
          return { ...slot, params };
        }),
      };
    });
  }, []);

  const setFxLoopSend = useCallback((pos: number) => {
    const clamped = Math.max(1, Math.min(10, pos));
    setPreset((prev) => {
      if (!prev) return null;
      const nextReturn = Math.max(clamped, prev.fxLoopReturn);
      return { ...prev, fxLoopSend: clamped, fxLoopReturn: nextReturn };
    });
  }, []);

  const setFxLoopReturn = useCallback((pos: number) => {
    const clamped = Math.max(1, Math.min(10, pos));
    setPreset((prev) => {
      if (!prev) return null;
      const nextSend = Math.min(clamped, prev.fxLoopSend);
      return { ...prev, fxLoopSend: nextSend, fxLoopReturn: clamped };
    });
  }, []);

  const reset = useCallback(() => {
    setPreset(null);
  }, []);

  return {
    preset, loadPreset, setPatchName, setAuthor,
    toggleEffect, changeEffect, reorderEffects, setParam,
    setFxLoopSend, setFxLoopReturn,
    reset,
  };
}
