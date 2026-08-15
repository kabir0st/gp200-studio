// AudioWorklet processor that taps its single input and streams raw Float32 PCM
// (all input channels averaged to mono) to the main thread. Runs on the audio
// render thread, which is the only place a loop's edges can be placed exactly:
// a setTimeout on the main thread is late by however long the UI is busy, and
// the board's rAF work makes that tens of milliseconds. Every decision about
// WHEN a take starts and stops therefore lives here, driven by `currentFrame`.
//
// The downmix must cover every channel: the GP-200 captures as a stereo USB
// stream and can carry the signal on only one side, so recording a fixed
// channel 0 can capture pure silence while the (downmixing) meters show level.
//
// This file runs in AudioWorkletGlobalScope: plain JS only, no imports, no TS.
// Loaded once via `ctx.audioWorklet.addModule(url)`, where url comes from
// `new URL('./looper-recorder.worklet.js', import.meta.url)`. It is kept a real
// emitted asset (never inlined as a data: URL) by vite.config's assetsInlineLimit
// override, because Chromium's addModule() rejects data: URLs.
//
// ── Control protocol (main thread → processor) ──────────────────────────────
//   { type: 'arm', mode: 'frame', startFrame, bodyFrames, tailFrames }
//       capture begins exactly at `startFrame` (context frames). bodyFrames > 0
//       stops the take by itself after that many frames , a fixed-length take,
//       which is the only way to get a loop with no human reaction time in it.
//   { type: 'arm', mode: 'level', threshold, prerollFrames, holdQuanta,
//     bodyFrames, tailFrames }
//       capture begins on the first note: the processor keeps a rolling
//       pre-roll so the attack that TRIGGERED it is still in the recording.
//   { type: 'stop', stopFrame }
//       end the body at exactly `stopFrame`, then keep capturing the tail. The
//       caller pushes that frame out by the same latency it pushed the start
//       by, so a hand-stopped take is exactly as long as the gap between the
//       two button presses instead of one round trip short.
//   { type: 'cancel' }   abandon everything, emit nothing
//
// ── Data protocol (processor → main thread) ─────────────────────────────────
//   { type: 'started', startFrame, prerollFrames }
//       capture is running. `prerollFrames` is how many of the frames already
//       posted sit BEFORE the level trigger (0 in frame mode).
//   { type: 'chunk', samples }   PCM, in order, body first then tail
//   { type: 'ended', bodyFrames, tailFrames, reason }
//       the take is complete: the first `bodyFrames` posted are the loop, the
//       rest is the ring-out to be blended over its head.
//
// The tail is NOT an afterthought: the loop point is joined by summing that
// ring-out back over the downbeat (see core/loopCapture.ts blendTail), so the
// recorder has to stay open past the end of the loop to have anything to sum.

/** Level has to hold for this many quanta before a 'level' arm fires, so a
 *  cable pop or a single glitchy sample cannot start a take. */
const DEFAULT_HOLD_QUANTA = 2;
/** Once armed, hold-checking accepts anything above this fraction of the
 *  threshold , the attack decays fast and must not have to re-cross. */
const HOLD_RATIO = 0.5;

class LooperRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resetState();
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  resetState() {
    this.state = 'idle'; // idle | waiting | recording | tail
    this.mode = 'frame';
    this.startFrame = 0;
    this.threshold = 0;
    this.holdQuanta = DEFAULT_HOLD_QUANTA;
    this.bodyTarget = 0; // 0 = run until stopped
    this.stopFrame = 0; // 0 = no stop scheduled
    this.tailTarget = 0;
    this.bodyFrames = 0;
    this.tailFrames = 0;
    this.ring = null;
    this.ringWrite = 0;
    this.ringFilled = 0;
    this.crossPending = false;
    this.framesSinceCross = 0;
    this.holdSeen = 0;
    this.endReason = 'stop';
  }

  handleMessage(msg) {
    if (!msg) return;
    if (msg.type === 'arm') {
      this.resetState();
      this.mode = msg.mode === 'level' ? 'level' : 'frame';
      this.startFrame = msg.startFrame || 0;
      this.threshold = msg.threshold || 0;
      this.holdQuanta = msg.holdQuanta || DEFAULT_HOLD_QUANTA;
      this.bodyTarget = Math.max(0, msg.bodyFrames || 0);
      this.tailTarget = Math.max(0, msg.tailFrames || 0);
      if (this.mode === 'level') {
        // Always at least one render quantum, so a trigger always has a ring to
        // report its start frame against.
        const preroll = Math.max(128, msg.prerollFrames || 0);
        this.ring = new Float32Array(preroll);
      }
      this.state = 'waiting';
      return;
    }
    if (msg.type === 'stop') {
      if (this.state === 'recording') this.stopFrame = Math.max(1, msg.stopFrame || 1);
      else if (this.state === 'waiting') this.cancel();
      return;
    }
    if (msg.type === 'cancel') this.cancel();
  }

  cancel() {
    const wasActive = this.state !== 'idle';
    this.resetState();
    if (wasActive) this.port.postMessage({ type: 'cancelled' });
  }

  /** Move from body to tail, ending the take outright when no tail is wanted. */
  finishBody(reason) {
    this.endReason = reason;
    if (this.tailTarget > 0) {
      this.state = 'tail';
      return;
    }
    this.emitEnded(reason);
  }

  emitEnded(reason) {
    const bodyFrames = this.bodyFrames;
    const tailFrames = this.tailFrames;
    this.resetState();
    this.port.postMessage({ type: 'ended', bodyFrames, tailFrames, reason });
  }

  /** Post a copy of `samples` (optionally a slice) as one chunk. */
  emit(samples, from, to) {
    const start = from || 0;
    const end = to === undefined ? samples.length : to;
    if (end <= start) return 0;
    const chunk = new Float32Array(end - start);
    chunk.set(samples.subarray(start, end));
    // Read the length BEFORE posting: transferring the buffer detaches it, and
    // a detached Float32Array reports length 0. Counting frames off the posted
    // chunk is how the fixed-length stop silently never fired.
    const length = chunk.length;
    this.port.postMessage({ type: 'chunk', samples: chunk }, [chunk.buffer]);
    return length;
  }

  /** Average every input channel of this render quantum into one array. */
  downmix(channels) {
    const first = channels[0];
    const mono = new Float32Array(first.length);
    mono.set(first);
    for (let ch = 1; ch < channels.length; ch++) {
      const channel = channels[ch];
      for (let i = 0; i < mono.length; i++) mono[i] += channel[i];
    }
    if (channels.length > 1) {
      const scale = 1 / channels.length;
      for (let i = 0; i < mono.length; i++) mono[i] *= scale;
    }
    return mono;
  }

  writeRing(mono) {
    const ring = this.ring;
    if (!ring || ring.length === 0) return;
    for (let i = 0; i < mono.length; i++) {
      ring[this.ringWrite] = mono[i];
      this.ringWrite = (this.ringWrite + 1) % ring.length;
      if (this.ringFilled < ring.length) this.ringFilled++;
    }
  }

  /** Emit the pre-roll in chronological order and return how many frames went out. */
  flushRing() {
    const ring = this.ring;
    if (!ring || this.ringFilled === 0) return 0;
    const oldest = (this.ringWrite - this.ringFilled + ring.length) % ring.length;
    let sent = 0;
    if (oldest + this.ringFilled <= ring.length) {
      sent += this.emit(ring, oldest, oldest + this.ringFilled);
    } else {
      sent += this.emit(ring, oldest, ring.length);
      sent += this.emit(ring, 0, this.ringFilled - (ring.length - oldest));
    }
    return sent;
  }

  /** First sample index in this quantum at or above `threshold`, or -1. */
  firstCrossing(mono, level) {
    for (let i = 0; i < mono.length; i++) {
      if (Math.abs(mono[i]) >= level) return i;
    }
    return -1;
  }

  /** Start the body here; `offset` is where inside this quantum it begins. */
  beginRecording(mono, offset, prerollFrames) {
    this.state = 'recording';
    this.bodyFrames = prerollFrames;
    this.port.postMessage({
      type: 'started',
      startFrame: currentFrame + offset - prerollFrames,
      prerollFrames,
    });
    this.consumeBody(mono, offset);
  }

  /**
   * Feed one quantum (from `offset`) into the body, spilling into the tail once
   * a fixed length is reached. Splitting inside the quantum is what makes a
   * fixed-length take exact rather than rounded up to a render block.
   */
  consumeBody(mono, offset) {
    const start = offset;
    let limit = mono.length;
    let ending = null;
    // A scheduled stop and a fixed length are the same kind of edge: whichever
    // lands first inside this quantum ends the body there, mid-block, which is
    // what keeps both exact instead of rounded up to a render quantum.
    if (this.stopFrame > 0) {
      const untilStop = this.stopFrame - (currentFrame + start);
      if (untilStop <= limit - start) {
        limit = start + Math.max(0, untilStop);
        ending = 'stop';
      }
    }
    if (this.bodyTarget > 0) {
      const remaining = this.bodyTarget - this.bodyFrames;
      if (remaining <= limit - start) {
        limit = start + remaining;
        ending = 'length';
      }
    }
    this.bodyFrames += this.emit(mono, start, limit);
    if (!ending) return;
    this.finishBody(ending);
    if (this.state === 'tail') this.consumeTail(mono, limit);
  }

  consumeTail(mono, offset) {
    const remaining = this.tailTarget - this.tailFrames;
    if (remaining <= 0) {
      this.emitEnded(this.endReason);
      return;
    }
    const take = Math.min(remaining, mono.length - offset);
    this.tailFrames += this.emit(mono, offset, offset + take);
    if (this.tailFrames >= this.tailTarget) this.emitEnded(this.endReason);
  }

  /** Level-armed: fill the pre-roll and decide whether this quantum triggers. */
  watchForLevel(mono) {
    const crossing = this.firstCrossing(mono, this.threshold);
    if (!this.crossPending) {
      if (crossing < 0) {
        this.writeRing(mono);
        return;
      }
      // Remember where the crossing sits so the pre-roll reported to the main
      // thread points at the attack itself, not at the end of the hold window.
      this.crossPending = true;
      this.holdSeen = 1;
      this.framesSinceCross = mono.length - crossing;
      this.writeRing(mono);
      if (this.holdSeen >= this.holdQuanta) this.triggerFromRing(mono);
      return;
    }
    const held = this.firstCrossing(mono, this.threshold * HOLD_RATIO) >= 0;
    if (!held) {
      // A pop, not a note: forget it and keep listening.
      this.crossPending = false;
      this.holdSeen = 0;
      this.framesSinceCross = 0;
      this.writeRing(mono);
      return;
    }
    this.holdSeen++;
    this.framesSinceCross += mono.length;
    this.writeRing(mono);
    if (this.holdSeen >= this.holdQuanta) this.triggerFromRing(mono);
  }

  /**
   * Fire a level-armed take. Everything the ring holds is emitted first, so the
   * body already contains the attack (and a little air before it); the main
   * thread refines the exact start inside that pre-roll.
   */
  triggerFromRing(mono) {
    const sent = this.flushRing();
    const beforeCross = Math.max(0, sent - this.framesSinceCross);
    this.state = 'recording';
    this.bodyFrames = sent;
    // The ring was just topped up with this quantum, so its oldest frame sits
    // `sent` frames before the END of the current block.
    this.port.postMessage({
      type: 'started',
      startFrame: currentFrame + mono.length - sent,
      prerollFrames: beforeCross,
    });
    // The quantum that completed the hold is already in the ring, so there is
    // nothing left to consume here , but a very short fixed length could
    // already be satisfied by the pre-roll alone.
    if (this.bodyTarget > 0 && this.bodyFrames >= this.bodyTarget) {
      this.finishBody('length');
    }
  }

  process(inputs) {
    if (this.state === 'idle') return true;
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const first = channels[0];
    if (!first || first.length === 0) return true;
    const mono = this.downmix(channels);

    if (this.state === 'waiting') {
      if (this.mode === 'level') {
        this.watchForLevel(mono);
        return true;
      }
      const end = currentFrame + mono.length;
      if (end <= this.startFrame) return true;
      const offset = Math.max(0, this.startFrame - currentFrame);
      this.beginRecording(mono, offset, 0);
      return true;
    }

    if (this.state === 'recording') {
      this.consumeBody(mono, 0);
      return true;
    }

    this.consumeTail(mono, 0);
    return true;
  }
}

registerProcessor('looper-recorder', LooperRecorderProcessor);
