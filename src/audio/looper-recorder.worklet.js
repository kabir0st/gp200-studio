// AudioWorklet processor that taps its single input and streams raw Float32 PCM
// (mono, channel 0) to the main thread. Runs on the audio render thread for
// sample-accurate capture; the loop station assembles the posted chunks into an
// AudioBuffer. Pure sink: it produces no output.
//
// This file runs in AudioWorkletGlobalScope: plain JS only, no imports, no TS.
// Loaded once via `ctx.audioWorklet.addModule(url)`, where url comes from
// `new URL('./looper-recorder.worklet.js', import.meta.url)`. It is kept a real
// emitted asset (never inlined as a data: URL) by vite.config's assetsInlineLimit
// override, because Chromium's addModule() rejects data: URLs.
//
// Control protocol (main thread → processor, via port.postMessage):
//   { type: 'start' }  begin forwarding frames
//   { type: 'stop' }   stop forwarding
// Data protocol (processor → main thread):
//   { type: 'chunk', samples: Float32Array }   one render quantum of input

class LooperRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg && msg.type === 'start') this.recording = true;
      else if (msg && msg.type === 'stop') this.recording = false;
    };
  }

  process(inputs) {
    if (!this.recording) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;
    // Copy into a fresh transferable buffer; the input array is reused by the
    // engine after process() returns, so we must not post it directly.
    const samples = new Float32Array(channel.length);
    samples.set(channel);
    this.port.postMessage({ type: 'chunk', samples }, [samples.buffer]);
    return true;
  }
}

registerProcessor('looper-recorder', LooperRecorderProcessor);
