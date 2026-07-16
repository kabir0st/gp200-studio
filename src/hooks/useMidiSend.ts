import { useCallback, useRef } from 'react';
import { SysExCodec } from '@/core/SysExCodec';

// Minimal output shape — the same interface useMidiDevice uses internally.
// Kept local to avoid a cross-import just for a 1-field type.
interface MidiOutput {
  send: (data: Uint8Array | number[]) => void;
}

// Device-initiated callback types. Four channels, one per message family:
// - slot change  → onDeviceChange(slot)
// - FX toggle    → onDeviceToggle(blockIndex, enabled)
// - effect swap  → onDeviceEffectChange(blockIndex, effectId)
// - knob turn    → onDeviceParamChange(blockIndex, paramIndex, value)
type OnDeviceChange = (slot: number | null) => void;
type OnDeviceToggle = (blockIndex: number, enabled: boolean) => void;
// Returns whether the change was actually applied — hardware toggles produce
// sub=0x0C frames that decode to bogus effect changes, and the dispatcher must
// only suppress follow-up FX-state messages after a REAL effect swap.
type OnDeviceEffectChange = (blockIndex: number, effectId: number) => boolean;
type OnDeviceParamChange = (blockIndex: number, paramIndex: number, value: number) => void;
// Real-time hardware controls (footswitch press, EXP-pedal position) — the
// loop station binds these. Wire format pending capture (docs/protocol-capture.md).
type OnFootswitch = (fsNumber: number, state: boolean) => void;
type OnExpPosition = (value: number) => void; // 0..127

export interface DeviceCallbackRefs {
  onDeviceChangeRef: React.MutableRefObject<OnDeviceChange | null>;
  onDeviceToggleRef: React.MutableRefObject<OnDeviceToggle | null>;
  onDeviceEffectChangeRef: React.MutableRefObject<OnDeviceEffectChange | null>;
  onDeviceParamChangeRef: React.MutableRefObject<OnDeviceParamChange | null>;
  onFootswitchRef: React.MutableRefObject<OnFootswitch | null>;
  onExpPositionRef: React.MutableRefObject<OnExpPosition | null>;
}

export interface UseMidiSendReturn {
  // Effect-level sends
  sendEffectChange: (blockIndex: number, effectId: number) => void;
  sendToggle: (blockIndex: number, enabled: boolean) => void;
  sendParamChange: (blockIndex: number, paramIndex: number, effectId: number, value: number) => void;
  sendReorder: (order: number[], send: number, ret: number) => void;
  sendFxLoopMove: (order: number[], send: number, ret: number, which: 'send' | 'return') => void;
  sendSlotChange: (slot: number) => void;
  sendAuthor: (author: string) => void;
  sendStyleName: (styleName: string) => void;
  sendNote: (note: string) => void;
  // Patch-level sends
  sendPatchVolume: (value: number) => void;
  sendPatchPan: (deviceValue: number) => void;
  sendPatchTempo: (bpm: number) => void;
  // Expression pedal
  sendExpParamSelect: (page: number, item: number, blockIndex: number, paramIdx: number) => void;
  sendExpMinMax: (page: number, item: number, min: number, max: number) => void;
  // Bulk
  sendRawChunks: (
    chunks: Uint8Array[],
    delayMs: number,
    onProgress?: (i: number, total: number) => void,
  ) => Promise<void>;
  // Device-callback setters
  setOnDeviceChange: (cb: OnDeviceChange | null) => void;
  setOnDeviceToggle: (cb: OnDeviceToggle | null) => void;
  setOnDeviceEffectChange: (cb: OnDeviceEffectChange | null) => void;
  setOnDeviceParamChange: (cb: OnDeviceParamChange | null) => void;
  setOnFootswitch: (cb: OnFootswitch | null) => void;
  setOnExpPosition: (cb: OnExpPosition | null) => void;
  // Internal plumbing consumed by useMidiDevice's onMidiMessage handler
  deviceCallbacks: DeviceCallbackRefs;
  suppressFxCountRef: React.MutableRefObject<number>;
  suppressFxFor: (ms: number) => void;
  /** Optional: schedule a slot-change side-effect caller (for sendSlotChange). */
  onSlotChange?: (slot: number) => void;
}

interface UseMidiSendOpts {
  /** Ref to the current MIDI output. Null while disconnected. */
  outputRef: React.MutableRefObject<MidiOutput | null>;
  /** Called when sendSlotChange is invoked, so the outer hook can update
   *  its currentSlot / currentSlotRef in sync. */
  onSlotChange?: (slot: number) => void;
}

/**
 * Hook that owns the "what do I send to the GP-200?" side of the device
 * integration. Covers:
 *   - all 14 send* functions (effect/patch/exp/bulk)
 *   - the FX-state echo suppression counter (bug-fixed in PR1)
 *   - the 4 device-initiated callback registration slots
 *
 * Extracted from useMidiDevice (2026-04-11, clean-code PR3) — the parent
 * hook previously weighed 727 LOC and mixed connection lifecycle with
 * send helpers. This hook receives only an outputRef and an optional
 * slot-change sync callback; it owns everything else locally.
 *
 * Stability: all sends are useCallback-memoised with empty deps because
 * they only close over stable refs (outputRef, suppressFxCountRef). No
 * stale-closure risk.
 */
export function useMidiSend(opts: UseMidiSendOpts): UseMidiSendReturn {
  const { outputRef, onSlotChange } = opts;

  // Device-initiated callback slots. The onMidiMessage handler in the
  // parent hook reads .current on each ref to dispatch incoming SysEx.
  const onDeviceChangeRef = useRef<OnDeviceChange | null>(null);
  const onDeviceToggleRef = useRef<OnDeviceToggle | null>(null);
  const onDeviceEffectChangeRef = useRef<OnDeviceEffectChange | null>(null);
  const onDeviceParamChangeRef = useRef<OnDeviceParamChange | null>(null);
  const onFootswitchRef = useRef<OnFootswitch | null>(null);
  const onExpPositionRef = useRef<OnExpPosition | null>(null);

  // Suppress FX state toggles when we're actively sending commands (responses
  // are echoes, not hardware changes). Counter, not a boolean + single timer:
  // rapid overlapping sends would otherwise clear each other's timers and end
  // suppression too early. Each call increments the counter and schedules its
  // own decrement — the ref is "suppressed" while > 0.
  const suppressFxCountRef = useRef(0);

  // Plain functions, not useCallback — they only close over the stable ref
  // and we pass them by reference, never depend on them in useEffect deps.
  function suppressFxFor(ms: number) {
    suppressFxCountRef.current += 1;
    setTimeout(() => {
      suppressFxCountRef.current = Math.max(0, suppressFxCountRef.current - 1);
    }, ms);
  }
  function suppressFxBriefly() {
    suppressFxFor(200);
  }

  const sendEffectChange = useCallback((blockIndex: number, effectId: number) => {
    if (!outputRef.current) return;
    suppressFxBriefly();
    const msg = SysExCodec.buildEffectChange(blockIndex, effectId);
    console.log(`[GP-200] effect change: block=${blockIndex} effectId=0x${effectId.toString(16).padStart(8, '0')}`);
    outputRef.current.send(msg);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendToggle = useCallback((blockIndex: number, enabled: boolean) => {
    if (!outputRef.current) return;
    suppressFxBriefly();
    const msg = SysExCodec.buildToggleEffect(blockIndex, enabled);
    console.log(`[GP-200] toggle: block=${blockIndex} enabled=${enabled}`);
    outputRef.current.send(msg);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendParamChange = useCallback(
    (blockIndex: number, paramIndex: number, effectId: number, value: number) => {
      if (!outputRef.current) return;
      suppressFxBriefly();
      const msg = SysExCodec.buildParamChange(blockIndex, paramIndex, effectId, value);
      console.log(`[GP-200] param change: block=${blockIndex} param=${paramIndex} value=${value} effectId=0x${effectId.toString(16).padStart(8, '0')}`);
      outputRef.current.send(msg);
    },
    [outputRef],
  );

  const sendReorder = useCallback((order: number[], send: number, ret: number) => {
    if (!outputRef.current) return;
    const msg = SysExCodec.buildReorderEffects(order, send, ret);
    console.log('[GP-200] reorder:', order, 'send:', send, 'ret:', ret);
    outputRef.current.send(msg);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendFxLoopMove = useCallback(
    (order: number[], send: number, ret: number, which: 'send' | 'return') => {
      if (!outputRef.current) return;
      const msg = SysExCodec.buildFxLoopMove(order, send, ret, which);
      console.log(`[GP-200] fxLoop ${which}: send=${send} ret=${ret}`);
      outputRef.current.send(msg);
    },
    [outputRef],
  );

  const sendSlotChange = useCallback((slot: number) => {
    if (!outputRef.current) return;
    // sub=0x08 with slot at byte[26] — confirmed via capture 222343
    const msg = SysExCodec.buildPresetChange(slot);
    console.log(`[GP-200] slot change: ${slot} (${SysExCodec.slotToLabel(slot)})`);
    outputRef.current.send(msg);
    onSlotChange?.(slot);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendAuthor = useCallback((author: string) => {
    if (!outputRef.current) return;
    const msg = SysExCodec.buildAuthorName(author);
    console.log(`[GP-200] author: "${author}"`);
    outputRef.current.send(msg);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendStyleName = useCallback((styleName: string) => {
    if (!outputRef.current) return;
    const msg = SysExCodec.buildStyleName(styleName);
    console.log(`[GP-200] style: "${styleName}"`);
    outputRef.current.send(msg);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendNote = useCallback((note: string) => {
    if (!outputRef.current) return;
    const msg = SysExCodec.buildNote(note);
    console.log(`[GP-200] note: "${note}"`);
    outputRef.current.send(msg);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendPatchVolume = useCallback((value: number) => {
    if (!outputRef.current) return;
    suppressFxBriefly();
    outputRef.current.send(SysExCodec.buildPatchSetting(0x00, value));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendPatchPan = useCallback((deviceValue: number) => {
    if (!outputRef.current) return;
    suppressFxBriefly();
    outputRef.current.send(SysExCodec.buildPatchSetting(0x06, deviceValue));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendPatchTempo = useCallback((bpm: number) => {
    if (!outputRef.current) return;
    suppressFxBriefly();
    outputRef.current.send(SysExCodec.buildPatchSetting(0x01, bpm));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendExpParamSelect = useCallback(
    (page: number, item: number, blockIndex: number, paramIdx: number) => {
      if (!outputRef.current) return;
      suppressFxBriefly();
      // Only navigation — confirmed: capture 204352 sends ONLY sub=0x18 for param change
      // decoded[12]=item<<4 selects Para slot (0/1/2), confirmed: capture 200517
      const msg = SysExCodec.buildExpNavigation(page, item, blockIndex, paramIdx);
      console.log(`[GP-200] EXP nav: page=${page} item=${item} block=${blockIndex} param=${paramIdx}`);
      outputRef.current.send(msg);
    },
    [outputRef],
  );

  const sendExpMinMax = useCallback(
    (page: number, item: number, min: number, max: number) => {
      if (!outputRef.current) return;
      suppressFxBriefly();
      const out = outputRef.current;
      // Min (section=0) + Max (section=1) — confirmed: capture 203838
      out.send(SysExCodec.buildExpAssignment(0, page, item, min));
      out.send(SysExCodec.buildExpAssignment(1, page, item, max));
    },
    [outputRef],
  );

  const sendRawChunks = useCallback(
    async (
      chunks: Uint8Array[],
      delayMs: number,
      onProgress?: (i: number, total: number) => void,
    ): Promise<void> => {
      if (!outputRef.current) throw new Error('Not connected');
      suppressFxBriefly();
      for (let i = 0; i < chunks.length; i++) {
        outputRef.current.send(chunks[i]);
        onProgress?.(i + 1, chunks.length);
        if (i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
      console.log(`[GP-200] sendRawChunks: ${chunks.length} chunks sent with ${delayMs}ms delay`);
    },
    [outputRef],
  );

  return {
    sendEffectChange,
    sendToggle,
    sendParamChange,
    sendReorder,
    sendFxLoopMove,
    sendSlotChange,
    sendAuthor,
    sendStyleName,
    sendNote,
    sendPatchVolume,
    sendPatchPan,
    sendPatchTempo,
    sendExpParamSelect,
    sendExpMinMax,
    sendRawChunks,
    setOnDeviceChange: (cb) => {
      onDeviceChangeRef.current = cb;
    },
    setOnDeviceToggle: (cb) => {
      onDeviceToggleRef.current = cb;
    },
    setOnDeviceEffectChange: (cb) => {
      onDeviceEffectChangeRef.current = cb;
    },
    setOnDeviceParamChange: (cb) => {
      onDeviceParamChangeRef.current = cb;
    },
    setOnFootswitch: (cb) => {
      onFootswitchRef.current = cb;
    },
    setOnExpPosition: (cb) => {
      onExpPositionRef.current = cb;
    },
    deviceCallbacks: {
      onDeviceChangeRef,
      onDeviceToggleRef,
      onDeviceEffectChangeRef,
      onDeviceParamChangeRef,
      onFootswitchRef,
      onExpPositionRef,
    },
    suppressFxCountRef,
    suppressFxFor,
  };
}
