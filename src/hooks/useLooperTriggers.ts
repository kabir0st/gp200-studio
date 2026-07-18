import { useEffect, useRef, useState } from 'react';
import type { LooperApi } from './useLooper';
import type { UseMidiDeviceReturn } from './useMidiDevice';
import { dispatchLooperAction, type LooperActionKind } from '@/core/looperBindings';
import {
  fingerprintKey,
  hexOfBytes,
  loadLooperStore,
  processLooperFrame,
  type LooperTriggerMap,
} from '@/core/looperTriggers';

const LEARN_NOTICE_MS = 3000;

export interface LearnNotice {
  action: LooperActionKind;
  duplicateOf: LooperActionKind;
}

interface UseLooperTriggersOpts {
  midiDevice: UseMidiDeviceReturn;
  /** Ref mirrors (App.tsx pattern) so the once-per-connection tap closure
   *  always reads current values without re-registering. */
  looperRef: React.MutableRefObject<LooperApi>;
  panelOpenRef: React.MutableRefObject<boolean>;
}

export interface UseLooperTriggersReturn {
  /** Learned fingerprints per transport action, for UI badges + persistence. */
  triggers: LooperTriggerMap;
  /** Action currently armed for MIDI-learn, or null. */
  armedAction: LooperActionKind | null;
  /** Arm an action (stomp binds the next frame); arming the armed one cancels. */
  armLearn: (action: LooperActionKind) => void;
  cancelLearn: () => void;
  clearTrigger: (action: LooperActionKind) => void;
  /** Forget every learned stomp at once. */
  clearAllTriggers: () => void;
  /** Transient "same stomp already assigned to X" feedback for the panel. */
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
  const { midiDevice, looperRef, panelOpenRef } = opts;
  const { status } = midiDevice;

  const [triggers, setTriggers] = useState<LooperTriggerMap>(() => {
    return loadLooperStore()?.triggers ?? {};
  });
  const [armedAction, setArmedAction] = useState<LooperActionKind | null>(null);
  const [learnNotice, setLearnNotice] = useState<LearnNotice | null>(null);

  const triggersRef = useRef(triggers);
  triggersRef.current = triggers;
  const armedActionRef = useRef(armedAction);
  armedActionRef.current = armedAction;
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
        armedAction: armedActionRef.current,
        triggers: triggersRef.current,
        lastMatchAt: lastMatchAtRef.current,
        now: Date.now(),
      });

      switch (decision.type) {
        case 'pass':
          // While armed, an unclassified frame is the interesting case: the
          // stomp reached us but classifyFrame didn't recognize its shape (all
          // shapes there are hypotheses pending capture, docs/protocol-capture.md
          // §4). Log it so the real footswitch frame can be identified.
          if (armedActionRef.current !== null) {
            console.log(
              `[GP-200] looper learn: unclassified frame while armed for` +
                ` ${armedActionRef.current} raw: ${hexOfBytes(data)}`,
            );
          }
          return false;
        case 'learned': {
          lastMatchAtRef.current.set(decision.key, Date.now());
          setTriggers((prev) => ({ ...prev, [decision.action]: decision.fp }));
          setArmedAction(null);
          // Always log the raw frame so the user can diff two switches whose
          // sysex08 signatures might collide (docs/protocol-capture.md §4).
          console.log(
            `[GP-200] looper learn: ${decision.action} ← ${fingerprintKey(decision.fp)}` +
              ` raw: ${hexOfBytes(data)}`,
          );
          if (decision.revertToggle) {
            midiRef.current.sendToggle(decision.revertToggle.block, decision.revertToggle.enabled);
          }
          return true;
        }
        case 'learnRejected': {
          setArmedAction(null);
          showNotice({ action: decision.action, duplicateOf: decision.duplicateOf });
          console.warn(
            `[GP-200] looper learn rejected: ${decision.action} frame already assigned to` +
              ` ${decision.duplicateOf} raw: ${hexOfBytes(data)}`,
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
            dispatchLooperAction(looperRef.current, { kind: decision.action });
          }
          return true;
        }
        case 'debounced':
          return true;
      }
    });
    return () => setTap(null);
  }, [status, looperRef, panelOpenRef]);

  // Disarm when the device goes away; a stranded arm would otherwise bind the
  // first frame of the next session.
  useEffect(() => {
    if (status !== 'connected') setArmedAction(null);
  }, [status]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    };
  }, []);

  const armLearn = (action: LooperActionKind) => {
    setLearnNotice(null);
    setArmedAction((prev) => {
      if (prev === action) return null;
      return action;
    });
  };

  const cancelLearn = () => setArmedAction(null);

  const clearTrigger = (action: LooperActionKind) => {
    setTriggers((prev) => {
      const next = { ...prev };
      delete next[action];
      return next;
    });
  };

  const clearAllTriggers = () => {
    setLearnNotice(null);
    setArmedAction(null);
    setTriggers({});
  };

  return {
    triggers,
    armedAction,
    armLearn,
    cancelLearn,
    clearTrigger,
    clearAllTriggers,
    learnNotice,
  };
}
