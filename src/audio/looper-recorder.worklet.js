// AudioWorklet processor that taps its single input and streams raw Float32 PCM
// (all input channels averaged to mono) to the main thread. Runs on the audio
// render thread for sample-accurate capture; the loop station assembles the
// posted chunks into an AudioBuffer. Pure sink: it produces no output.
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
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const firstChannel = channels[0];
    if (!firstChannel || firstChannel.length === 0) return true;
    // Copy into a fresh transferable buffer; the input arrays are reused by
    // the engine after process() returns, so we must not post them directly.
    const samples = new Float32Array(firstChannel.length);
    samples.set(firstChannel);
    for (let ch = 1; ch < channels.length; ch++) {
      const channel = channels[ch];
      for (let i = 0; i < samples.length; i++) samples[i] += channel[i];
    }
    if (channels.length > 1) {
      const scale = 1 / channels.length;
      for (let i = 0; i < samples.length; i++) samples[i] *= scale;
    }
    this.port.postMessage({ type: 'chunk', samples }, [samples.buffer]);
    return true;
  }
}

registerProcessor('looper-recorder', LooperRecorderProcessor);
