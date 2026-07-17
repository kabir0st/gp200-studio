import { useEffect, useRef, useState } from 'react';
import type { LooperApi } from './useLooper';
import type { UseMidiDeviceReturn } from './useMidiDevice';
import { dispatchLooperAction, type LooperBindings } from '@/core/looperBindings';
import {
  fingerprintKey,
  hexOfBytes,
  loadLooperStore,
  processLooperFrame,
  type LooperTriggerMap,
} from '@/core/looperTriggers';

const LEARN_NOTICE_MS = 3000;

export interface LearnNotice {
  fs: number;
  duplicateOfFs: number;
}

interface UseLooperTriggersOpts {
  midiDevice: UseMidiDeviceReturn;
  /** Ref mirrors (App.tsx pattern) so the once-per-connection tap closure
   *  always reads current values without re-registering. */
  looperRef: React.MutableRefObject<LooperApi>;
  bindingsRef: React.MutableRefObject<LooperBindings>;
  panelOpenRef: React.MutableRefObject<boolean>;
}

export interface UseLooperTriggersReturn {
  /** Learned fingerprints per footswitch row, for UI badges + persistence. */
  triggers: LooperTriggerMap;
  /** Row currently armed for MIDI-learn, or null. */
  armedFs: number | null;
  /** Arm a row (stomp binds the next frame); arming the armed row cancels. */
  armLearn: (fs: number) => void;
  cancelLearn: () => void;
  clearTrigger: (fs: number) => void;
  /** Transient "same frame already bound to FS n" feedback for the panel. */
  learnNotice: LearnNotice | null;
}

/**
 * React glue for the looper's MIDI-learn/hijack path: owns the learned-trigger
 * map and the armed-row state, registers the raw-frame tap on the MIDI
 * dispatcher, and applies the side effects the pure decision engine
 * (src/core/looperTriggers.ts) returns — dispatching looper actions, sending
 * the revert toggle, and console logging.
 */
export function useLooperTriggers(opts: UseLooperTriggersOpts): UseLooperTriggersReturn {
  const { midiDevice, looperRef, bindingsRef, panelOpenRef } = opts;
  const { status } = midiDevice;

  const [triggers, setTriggers] = useState<LooperTriggerMap>(() => {
    return loadLooperStore()?.triggers ?? {};
  });
  const [armedFs, setArmedFs] = useState<number | null>(null);
  const [learnNotice, setLearnNotice] = useState<LearnNotice | null>(null);

  const triggersRef = useRef(triggers);
  triggersRef.current = triggers;
  const armedFsRef = useRef(armedFs);
  armedFsRef.current = armedFs;
  const midiRef = useRef(midiDevice);
  midiRef.current = midiDevice;

  /** fingerprintKey → timestamp of the last consumed match (debounce clock). */
  const lastMatchAtRef = useRef(new Map<string, number>());
  const noticeTimerRef = useRef<number | null>(null);

  // Register the tap once per connection; the closure only touches refs.
  useEffect(() => {
    if (status !== 'connected') return;
    const setTap = midiRef.current.setOnLooperFrameTap;

    const showNotice = (notice: LearnNotice) => {
      setLearnNotice(notice);
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => setLearnNotice(null), LEARN_NOTICE_MS);
    };

    setTap((data, ctx) => {
      const decision = processLooperFrame({
        data,
        currentSlot: ctx.currentSlot,
        suppressed: ctx.suppressed,
        panelOpen: panelOpenRef.current,
        armedFs: armedFsRef.current,
        triggers: triggersRef.current,
        bindings: bindingsRef.current,
        lastMatchAt: lastMatchAtRef.current,
        now: Date.now(),
      });

      switch (decision.type) {
        case 'pass':
          return false;
        case 'learned': {
          lastMatchAtRef.current.set(decision.key, Date.now());
          setTriggers((prev) => ({ ...prev, [decision.fs]: decision.fp }));
          setArmedFs(null);
          // Always log the raw frame so the user can diff two switches whose
          // sysex08 signatures might collide (docs/protocol-capture.md §4).
          console.log(
            `[GP-200] looper learn: FS${decision.fs} ← ${fingerprintKey(decision.fp)}` +
              ` raw: ${hexOfBytes(data)}`,
          );
          if (decision.revertToggle) {
            midiRef.current.sendToggle(decision.revertToggle.block, decision.revertToggle.enabled);
          }
          return true;
        }
        case 'learnRejected': {
          setArmedFs(null);
          showNotice({ fs: decision.fs, duplicateOfFs: decision.duplicateOfFs });
          console.warn(
            `[GP-200] looper learn rejected: FS${decision.fs} frame already bound to` +
              ` FS${decision.duplicateOfFs} raw: ${hexOfBytes(data)}`,
          );
          return true;
        }
        case 'hijacked': {
          lastMatchAtRef.current.set(decision.key, Date.now());
          // Revert even when the looper isn't ready: while the panel is open
          // these switches belong to the looper, so the pedal's effect state
          // must stay untouched either way.
          if (decision.revertToggle) {
            midiRef.current.sendToggle(decision.revertToggle.block, decision.revertToggle.enabled);
          }
          if (looperRef.current.ready) {
            dispatchLooperAction(looperRef.current, decision.action);
          }
          return true;
        }
        case 'debounced':
          return true;
      }
    });
    return () => setTap(null);
  }, [status, looperRef, bindingsRef, panelOpenRef]);

  // Disarm when the device goes away; a stranded arm would otherwise bind the
  // first frame of the next session.
  useEffect(() => {
    if (status !== 'connected') setArmedFs(null);
  }, [status]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const armLearn = (fs: number) => {
    setLearnNotice(null);
    setArmedFs((prev) => {
      if (prev === fs) return null;
      return fs;
    });
  };

  const cancelLearn = () => setArmedFs(null);

  const clearTrigger = (fs: number) => {
    setTriggers((prev) => {
      const next = { ...prev };
      delete next[fs];
      return next;
    });
  };

  return { triggers, armedFs, armLearn, cancelLearn, clearTrigger, learnNotice };
}
