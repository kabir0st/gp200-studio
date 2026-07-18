// While the Loop Station dialog is open the GP-200's footswitches belong to the
// looper, so the pedal must stop acting on them itself. This hook rewrites the
// device-global FootSwitch settings on open and puts them back on close.
//
// WHY the device settings and not a revert-after-the-fact: a CTRL footswitch can
// toggle a whole blockMask of effects in one press (controlRecords.ts), and the
// old approach — let the toggle happen, then send an undo — could only revert a
// single block, left an audible flicker, and mis-targeted the block outright for
// the 0x0c switches. Taking the switches away at the source fixes all three.
//
// TAP target is FS_ACTION.MIDI, not NONE: the switch must still EMIT something
// for the MIDI-learn tap to fingerprint, it just must not change the sound.
// classifyFrame's CC branch keys off whatever CC number arrives, so it needs no
// table of its own (the placeholder FS_CC_MAP is not on this path).
//
// RESTORE IS A WRITE-ONLY BEST EFFORT. The settings protocol has no read-back
// (docs/protocol-capture.md §0.2), so the pedal's pre-takeover values cannot be
// queried — this restores what the user declared in the panel, persisted via
// deviceSettings. That guessing is exactly why the previous takeover was
// deleted in c380497; the difference here is that the value is the user's
// stated one rather than an assumed default.

import { useCallback, useRef, useEffect } from 'react';
import { FS_ACTION } from '@/core/deviceSettings';

const FS_ALL = [1, 2, 3, 4, 5, 6, 7, 8];

/** FS Mode 2 = User: the per-switch TAP/HOLD targets are what take effect. */
const FS_MODE_USER = 2;

export interface FsTakeoverSender {
  sendFsMode: (mode: number) => void;
  sendFsTarget: (fs: number, kind: 'tap' | 'hold', actionId: number) => void;
}

export interface UseFsTakeoverOpts {
  sender: FsTakeoverSender;
  /** True while the device is usable; a takeover is never sent when it isn't. */
  connected: boolean;
  /** FS mode to write back on release (the user's declared normal mode). */
  restoreMode: number;
  /** TAP action ids for FS1..FS8 to write back on release. */
  restoreTaps: readonly number[];
}

export interface UseFsTakeoverReturn {
  /** Hand the footswitches to the looper. Idempotent. */
  apply: () => void;
  /** Give them back. No-op unless a takeover is currently applied. */
  release: () => void;
}

export function useFsTakeover(opts: UseFsTakeoverOpts): UseFsTakeoverReturn {
  const { sender, connected, restoreMode, restoreTaps } = opts;

  // Refs so apply/release stay stable for callers that hold them in effects,
  // and so release() reads the CURRENT restore values, not a stale closure.
  const senderRef = useRef(sender);
  senderRef.current = sender;
  const restoreModeRef = useRef(restoreMode);
  restoreModeRef.current = restoreMode;
  const restoreTapsRef = useRef(restoreTaps);
  restoreTapsRef.current = restoreTaps;

  const appliedRef = useRef(false);

  const apply = useCallback(() => {
    if (appliedRef.current || !connected) return;
    appliedRef.current = true;
    senderRef.current.sendFsMode(FS_MODE_USER);
    for (const fs of FS_ALL) {
      senderRef.current.sendFsTarget(fs, 'tap', FS_ACTION.MIDI);
    }
    console.log('[GP-200] FS takeover applied (mode=User, all TAP → MIDI)');
  }, [connected]);

  const release = useCallback(() => {
    if (!appliedRef.current) return;
    appliedRef.current = false;
    // Deliberately not gated on `connected`: if the pedal is gone there is
    // nothing to restore, and the send layer already no-ops without an output.
    senderRef.current.sendFsMode(restoreModeRef.current);
    for (const fs of FS_ALL) {
      const action = restoreTapsRef.current[fs - 1] ?? FS_ACTION.NONE;
      senderRef.current.sendFsTarget(fs, 'tap', action);
    }
    console.log(`[GP-200] FS takeover released (mode=${restoreModeRef.current})`);
  }, []);

  // A disconnect mid-takeover strands the flag: the pedal is gone, so nothing
  // can be restored, but a reconnect must not think a takeover is still live.
  useEffect(() => {
    if (!connected) appliedRef.current = false;
  }, [connected]);

  return { apply, release };
}
