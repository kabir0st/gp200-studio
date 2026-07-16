import type { GP200Preset } from './types';

/**
 * The subset of useMidiSend the live-push sequence needs. Kept as a narrow
 * interface so the sequence is unit-testable with a recording fake.
 */
export interface PresetPushSender {
  sendEffectChange: (blockIndex: number, effectId: number) => void;
  sendParamChange: (blockIndex: number, paramIndex: number, effectId: number, value: number) => void;
  sendToggle: (blockIndex: number, enabled: boolean) => void;
  /** Mirror the signal-chain order to the device (order = slotIndices in playback order). */
  sendReorder: (order: number[], send: number, ret: number) => void;
  sendAuthor: (author: string) => void;
}

export interface PushProgress {
  /** completed work units — one per block per pass */
  completed: number;
  /** total work units = blocks × 2 passes */
  total: number;
  /** 'configuring' = pass 1, 'finalizing' = pass 2, 'done' = fully sent */
  phase: 'configuring' | 'finalizing' | 'done';
}

export interface PresetPushOptions {
  /** ms to wait after an effect change before writing that block's params */
  effectChangeSettleMs?: number;
  /** ms between consecutive param writes */
  interParamDelayMs?: number;
  /** ms after a block's toggle before moving on to the next block */
  interBlockDelayMs?: number;
  /** Injectable sleep — overridden in tests to record timing without waiting. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Aborts the push mid-flight. A full push takes ~15s; if the user loads
   * another preset meanwhile the caller aborts the in-flight one so two pushes
   * never interleave their param writes on the device.
   */
  signal?: AbortSignal;
  /** Progress callback, fired after each block and once more when done. */
  onProgress?: (progress: PushProgress) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Live-preview push: send a freshly-loaded preset to the connected GP-200
 * without saving it to a slot.
 *
 * Order per block matters: effect TYPE first (sub=0x14), then params (sub=0x18),
 * then the on/off state (sub=0x10). Without the effect change the device keeps
 * whatever algorithm it had and every param/toggle lands on the wrong effect (#80).
 *
 * Block addressing uses each effect's fixed slotIndex (0=PRE..10=VOL), NOT the
 * array/loop position. PRSTDecoder returns effects in playback (routing) order,
 * so for a reordered preset the array position diverges from slotIndex; the
 * device addresses live edits by the fixed block identity, so sending the array
 * position lands every write on the wrong physical block (#90). The chain ORDER
 * itself is a separate concern: sendReorder mirrors the routing so the device's
 * signal path matches the loaded preset (#90).
 *
 * #80 follow-up: a fixed settle alone cannot win the race. A param write targets
 * a parameter *inside* the algorithm the effect-change just selected; if it
 * arrives before the device finished loading that algorithm it is dropped and
 * the default value remains. Load time is variable — the simplest effect (EQ)
 * was ready right at 250ms (lost only its first param), complex algorithms
 * (amp/chorus/reverb) need longer (lost most params). Two defences:
 *   1. settle 400ms after each effect change (was 250).
 *   2. a SECOND param pass after every block is configured — by then all 11
 *      algorithms are loaded and settled, so any write that raced a still-
 *      loading block in pass 1 lands for sure on the re-send.
 */
export async function pushPresetToDevice(
  decoded: GP200Preset,
  sender: PresetPushSender,
  options: PresetPushOptions = {},
): Promise<void> {
  const settle = options.effectChangeSettleMs ?? 400;
  // 40ms between param writes. USB captures of real device/editor traffic show
  // the GP-200 never receives two *different* params closer than ~124ms apart,
  // and even same-target knob sweeps never drop below ~19ms. Our former 8ms
  // burst is a cadence the device never sees in the wild and it swallows it
  // (the dropped first-param-of-block was the #80 symptom). 40ms sits clear of
  // the device's processing window while keeping a full load reasonably fast.
  const paramGap = options.interParamDelayMs ?? 40;
  const blockGap = options.interBlockDelayMs ?? 10;
  const sleep = options.sleep ?? defaultSleep;
  const { signal, onProgress } = options;

  const total = decoded.effects.length * 2; // pass 1 + pass 2
  let completed = 0;

  const sendBlockParams = async (eff: GP200Preset['effects'][number]) => {
    const block = eff.slotIndex; // fixed block identity, not the array position (#90)
    for (let p = 0; p < eff.params.length; p++) {
      if (eff.params[p] !== undefined) {
        sender.sendParamChange(block, p, eff.effectId, eff.params[p]);
        await sleep(paramGap);
      }
    }
    // Re-send param 0 at the end of the block's burst. The device swallows the
    // FIRST param-change of a block (it opens the block's edit context), so
    // param 0 — always sent first — never lands during a load, even though the
    // identical message works when sent alone (manual knob edit). Re-sending it
    // after the others, when the context is already open, makes it stick (#80).
    if (eff.params.length > 0 && eff.params[0] !== undefined) {
      sender.sendParamChange(block, 0, eff.effectId, eff.params[0]);
      await sleep(paramGap);
    }
  };

  // Pass 1: per block — effect type, settle, params, toggle.
  for (let i = 0; i < decoded.effects.length; i++) {
    if (signal?.aborted) return;
    const eff = decoded.effects[i];
    sender.sendEffectChange(eff.slotIndex, eff.effectId);
    await sleep(settle);
    if (signal?.aborted) return;
    await sendBlockParams(eff);
    sender.sendToggle(eff.slotIndex, eff.enabled);
    await sleep(blockGap);
    completed += 1;
    onProgress?.({ completed, total, phase: 'configuring' });
  }

  // Pass 2: every algorithm is loaded now — re-send all params so writes that
  // raced a still-loading block in pass 1 are applied (#80).
  for (let i = 0; i < decoded.effects.length; i++) {
    if (signal?.aborted) return;
    await sendBlockParams(decoded.effects[i]);
    completed += 1;
    onProgress?.({ completed, total, phase: 'finalizing' });
  }

  if (signal?.aborted) return;
  // Mirror the signal-chain order last: block writes above are slot-addressed
  // (order-independent), so a single reorder after them applies the preset's
  // routing without racing the per-block edits. Sent standalone (like the
  // author) to dodge the device's first-message-of-a-burst swallow (#90).
  sender.sendReorder(decoded.effects.map((e) => e.slotIndex), decoded.fxLoopSend, decoded.fxLoopReturn);
  if (decoded.author) sender.sendAuthor(decoded.author);
  onProgress?.({ completed: total, total, phase: 'done' });
}
