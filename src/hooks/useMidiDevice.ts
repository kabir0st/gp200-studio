import { useState, useRef, useCallback, useEffect } from 'react';
import { SysExCodec } from '@/core/SysExCodec';
import type { GP200Preset } from '@/core/types';
import { useMidiSend } from './useMidiSend';

const READ_TIMEOUT_MS = 3000;

// Gate the chunk-based full-preset push behind a dev-only flag. Hardware
// testing showed the payload layout is unreliable (overlapping chunk
// offsets, only partial block-10 support); the writePresetToSlot flow
// (toggle + params + save-commit) is the supported path. Remove this flag
// once the USB capture is re-analyzed and buildWriteChunks is reliable.
const ENABLE_PUSH_PRESET = import.meta.env.DEV;

function isSysEx(data: Uint8Array, cmd: number, sub: number): boolean {
  return (
    data.length > 10 &&
    data[0] === 0xF0 &&
    data[1] === 0x21 && data[2] === 0x25 && data[3] === 0x7E &&
    data[4] === 0x47 && data[5] === 0x50 && data[6] === 0x2D && data[7] === 0x32 &&
    data[8] === cmd && data[9] === sub
  );
}

/** Safely extract a Uint8Array from a MIDI message event's data field.
 *  The real MIDIMessageEvent.data is Uint8Array; our mock also passes a Uint8Array. */
function getBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof DataView) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data as ArrayBuffer);
}

export interface UseMidiDeviceReturn {
  status: 'disconnected' | 'connecting' | 'handshaking' | 'connected' | 'error';
  handshakeStep: string | null;
  errorMessage: string | null;
  deviceName: string | null;
  currentSlot: number | null;
  presetNames: (string | null)[];
  namesLoadProgress: number;
  deviceInfo: { deviceType: number; firmwareValues: number[]; versionAccepted: boolean } | null;
  currentPreset: GP200Preset | null;
  cabIrNames: { section: number; page: number; block: number; name: string; rawData: Uint8Array }[];

  connect: () => Promise<void>;
  disconnect: () => void;
  loadPresetNames: () => Promise<void>;
  pullPreset: (slot: number) => Promise<GP200Preset>;
  pushPreset: (preset: GP200Preset, slot: number) => Promise<void>;
  writePresetToSlot: (preset: GP200Preset, slot: number) => Promise<void>;
  saveToSlot: (presetName: string, slot?: number) => Promise<void>;
  sendToggle: (blockIndex: number, enabled: boolean) => void;
  sendParamChange: (blockIndex: number, paramIndex: number, effectId: number, value: number) => void;
  sendReorder: (order: number[], send: number, ret: number) => void;
  sendFxLoopMove: (order: number[], send: number, ret: number, which: 'send' | 'return') => void;
  sendSlotChange: (slot: number) => void;
  sendAuthor: (author: string) => void;
  sendStyleName: (styleName: string) => void;
  sendNote: (note: string) => void;
  sendEffectChange: (blockIndex: number, effectId: number) => void;
  sendPatchVolume: (value: number) => void;
  sendPatchPan: (deviceValue: number) => void;
  sendPatchTempo: (bpm: number) => void;
  sendRawChunks: (chunks: Uint8Array[], delayMs: number, onProgress?: (i: number, total: number) => void) => Promise<void>;
  sendExpParamSelect: (page: number, item: number, blockIndex: number, paramIdx: number) => void;
  sendExpMinMax: (page: number, item: number, min: number, max: number) => void;
  setOnDeviceChange: (cb: ((slot: number | null) => void) | null) => void;
  setOnDeviceToggle: (cb: ((blockIndex: number, enabled: boolean) => void) | null) => void;
  setOnDeviceEffectChange: (cb: ((blockIndex: number, effectId: number) => void) | null) => void;
  setOnDeviceParamChange: (cb: ((blockIndex: number, paramIndex: number, value: number) => void) | null) => void;
}

// Minimal shape we actually use — avoids conflicts with DOM's MIDIInput / MIDIOutput
interface GP200Input {
  name: string | null;
  onmidimessage: ((event: { data: unknown }) => void) | null;
}
interface GP200Output {
  send: (data: Uint8Array | number[]) => void;
}
interface GP200Access {
  inputs: { values: () => Iterable<GP200Input> };
  outputs: { values: () => Iterable<GP200Output> };
}

function waitForResponse(
  input: GP200Input,
  match: (data: Uint8Array) => boolean,
  timeoutMs: number,
  baseHandler: (event: { data: unknown }) => void,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      input.onmidimessage = baseHandler;
      reject(new Error('Response timeout'));
    }, timeoutMs);
    input.onmidimessage = (event: { data: unknown }) => {
      const data = getBytes(event.data);
      baseHandler(event);
      if (match(data)) {
        clearTimeout(timer);
        input.onmidimessage = baseHandler;
        resolve(data);
      }
    };
  });
}

function collectChunks(
  input: GP200Input,
  cmd: number,
  sub: number,
  expectedCount: number,
  timeoutMs: number,
  baseHandler: (event: { data: unknown }) => void,
): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const timer = setTimeout(() => {
      input.onmidimessage = baseHandler;
      reject(new Error('Chunk collection timeout'));
    }, timeoutMs);
    input.onmidimessage = (event: { data: unknown }) => {
      const data = getBytes(event.data);
      baseHandler(event);
      if (isSysEx(data, cmd, sub)) {
        chunks.push(new Uint8Array(data));
        if (chunks.length === expectedCount) {
          clearTimeout(timer);
          input.onmidimessage = baseHandler;
          resolve(chunks);
        }
      }
    };
  });
}

export function useMidiDevice(): UseMidiDeviceReturn {
  const [status, setStatus] = useState<UseMidiDeviceReturn['status']>('disconnected');
  const [handshakeStep, setHandshakeStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const [presetNames, setPresetNames] = useState<(string | null)[]>(new Array(256).fill(null));
  const [namesLoadProgress, setNamesLoadProgress] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState<UseMidiDeviceReturn['deviceInfo']>(null);
  const [currentPreset, setCurrentPreset] = useState<GP200Preset | null>(null);
  const wasConnectedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [cabIrNames, setAssignments] = useState<UseMidiDeviceReturn['cabIrNames']>([]);

  const outputRef          = useRef<GP200Output | null>(null);
  const inputRef           = useRef<GP200Input | null>(null);
  const presetNamesRef     = useRef<(string | null)[]>(new Array(256).fill(null));
  const currentSlotRef     = useRef<number | null>(null);
  const namesLoadAbortRef  = useRef<boolean>(false);
  const namesLoadRunningRef = useRef<boolean>(false);

  // Delegate all send operations, device-initiated callback registration,
  // and FX-state echo suppression to useMidiSend. The parent hook keeps
  // connection state + preset ops; useMidiSend owns everything else we
  // send to or receive from the pedal.
  //
  // onSlotChange keeps the local currentSlot state in sync whenever the
  // user triggers a slot change via sendSlotChange — previously that was
  // done inline at the end of the send callback.
  const send = useMidiSend({
    outputRef,
    onSlotChange: (slot) => {
      setCurrentSlot(slot);
      currentSlotRef.current = slot;
    },
  });
  const {
    deviceCallbacks: {
      onDeviceChangeRef,
      onDeviceToggleRef,
      onDeviceEffectChangeRef,
      onDeviceParamChangeRef,
    },
    suppressFxCountRef,
    suppressFxFor,
  } = send;

  const onMidiMessage = useCallback((event: { data: unknown }) => {
    const data = getBytes(event.data);
    // sub=0x08 D→H: multipurpose — preset change echo vs FX state response
    // Distinguish by data[14]: 0x08 = preset change echo, other = FX state response
    if (isSysEx(data, 0x12, 0x08) && data.length >= 28) {
      if (data[14] === 0x08) {
        // Preset change echo — slot nibble-encoded at data[25:26]
        const slot = ((data[25] & 0x0F) << 4) | (data[26] & 0x0F);
        if (slot >= 0 && slot < 256) {
          console.log(`[GP-200] device slot change: ${slot} (${SysExCodec.slotToLabel(slot)})`);
          setCurrentSlot(slot); currentSlotRef.current = slot;
          onDeviceChangeRef.current?.(slot);
        }
      } else if (suppressFxCountRef.current === 0) {
        // FX state response — device reports effect toggle from hardware
        // data[22]=block_id (0=PRE..10=VOL), data[24]=state (0=OFF, non-zero=ON)
        // Suppressed during our own sends (responses are echoes, not hardware changes)
        const blockId = data[22];
        const state = data[24];
        if (blockId >= 0 && blockId <= 10) {
          console.log(`[GP-200] device FX toggle: block=${blockId} state=${state}`);
          onDeviceToggleRef.current?.(blockId, state !== 0);
        }
      }
    }
    // sub=0x0C D→H: effect change response (user changed effect type on hardware)
    // Format (38B raw): payload[12]=blockIndex, payload[26]=module(high byte),
    // payload[19:21]=variant nibble-encoded: effectId = (module<<24) | (p[19]<<4) | p[20]
    if (isSysEx(data, 0x12, 0x0C) && data.length >= 38) {
      const p = data.subarray(10); // payload starts after header
      const blockIndex = p[12];
      const moduleType = p[26];
      const variant = (p[19] << 4) | p[20];
      const effectId = (moduleType << 24) | variant;
      console.log(`[GP-200] device effect change: block=${blockIndex} effectId=0x${effectId.toString(16).padStart(8,'0')}`);
      onDeviceEffectChangeRef.current?.(blockIndex, effectId);
      // Suppress FX state responses that follow (they report stale toggle states).
      suppressFxFor(500);
    }
    // sub=0x10 D→H: toggle OR knob notification (46 bytes)
    // Discriminator: bytes[29:37] all zeros = knob notification, otherwise = toggle
    if (isSysEx(data, 0x12, 0x10) && data.length >= 45) {
      const isKnob = data[29] === 0 && data[30] === 0 && data[31] === 0 && data[32] === 0 &&
                     data[33] === 0 && data[34] === 0 && data[35] === 0 && data[36] === 0;
      if (isKnob) {
        // Knob notification: block at [22], param at [24], nibble float32 at [37:45]
        const blockId = data[22];
        const paramIdx = data[24];
        const hi0 = data[37], lo0 = data[38], hi1 = data[39], lo1 = data[40];
        const hi2 = data[41], lo2 = data[42], hi3 = data[43], lo3 = data[44];
        const buf = new Uint8Array([(hi0 << 4) | lo0, (hi1 << 4) | lo1, (hi2 << 4) | lo2, (hi3 << 4) | lo3]);
        const value = new DataView(buf.buffer).getFloat32(0, true);
        if (blockId >= 0 && blockId <= 10) {
          onDeviceParamChangeRef.current?.(blockId, paramIdx, value);
        }
      } else {
        // Toggle notification: block at [38], state at [40]
        const blockId = data[38];
        const state = data[40];
        if (blockId >= 0 && blockId <= 10) {
          console.log(`[GP-200] device toggle: block=${blockId} state=${state}`);
          onDeviceToggleRef.current?.(blockId, state !== 0);
        }
      }
    }
  // suppressFxFor is intentionally omitted: it's a plain function (not
  // useCallback-memoised) that only closes over the stable suppressFxCountRef,
  // so its identity changing every render doesn't affect behavior — but
  // including it would make onMidiMessage (and everything that depends on
  // it, e.g. `connect` below) unstable every render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [onDeviceChangeRef, onDeviceToggleRef, onDeviceEffectChangeRef, onDeviceParamChangeRef, suppressFxCountRef]);

  const connect = useCallback(async () => {
    setStatus('connecting');
    setErrorMessage(null);
    try {
      if (!('requestMIDIAccess' in navigator)) {
        throw new Error('Web MIDI API not supported in this browser');
      }
      const access = await (
        navigator as unknown as {
          requestMIDIAccess: (opts: { sysex: boolean }) => Promise<GP200Access>;
        }
      ).requestMIDIAccess({ sysex: true });

      const output = Array.from(access.outputs.values()).find(p => {
        // name can be string | null on real MIDIPort
        const n = p as unknown as { name: string | null };
        return typeof n.name === 'string' && n.name.includes('GP-200');
      }) ?? null;
      const input = Array.from(access.inputs.values()).find(p => {
        const n = p as unknown as { name: string | null };
        return typeof n.name === 'string' && n.name.includes('GP-200');
      }) ?? null;

      if (!output || !input) {
        throw new Error('GP-200 not found in MIDI ports');
      }

      outputRef.current = output;
      inputRef.current  = input;
      input.onmidimessage = onMidiMessage;
      setDeviceName(input.name);
      setStatus('handshaking');
      setHandshakeStep(null);

      // --- Handshake sequence ---
      try {
        // Step 1-2: Identity
        setHandshakeStep('Identity…');
        output.send(SysExCodec.buildIdentityQuery());
        const identityMsg = await waitForResponse(
          input, (d) => isSysEx(d, 0x12, 0x08), READ_TIMEOUT_MS, onMidiMessage
        );
        const identity = SysExCodec.parseIdentityResponse(identityMsg);

        // Step 3-4: Enter editor mode
        setHandshakeStep('Editor Mode…');
        output.send(SysExCodec.buildEnterEditorMode());
        await new Promise(r => setTimeout(r, 100));

        // Step 5-6: State dump (0x4E — current slot at decoded[8:10] LE16)
        setHandshakeStep('State Dump…');
        output.send(SysExCodec.buildStateDumpRequest());
        const dumpChunks = await collectChunks(input, 0x12, 0x4E, 5, READ_TIMEOUT_MS, onMidiMessage);
        const { slot } = SysExCodec.parseStateDump(dumpChunks);
        setCurrentSlot(slot); currentSlotRef.current = slot;

        // Step 7-8: Version check
        setHandshakeStep('Firmware Check…');
        output.send(SysExCodec.buildVersionCheck());
        const versionMsg = await waitForResponse(
          input, (d) => isSysEx(d, 0x12, 0x0A), READ_TIMEOUT_MS, onMidiMessage
        );
        const { accepted } = SysExCodec.parseVersionResponse(versionMsg);
        setDeviceInfo({ ...identity, versionAccepted: accepted });

        // Step 9: Assignment polling (non-critical, short timeout, bail on first failure)
        setHandshakeStep('Controller…');
        const ASSIGN_TIMEOUT = 300;
        const assignmentEntries: UseMidiDeviceReturn['cabIrNames'] = [];
        const assignmentPlan = [
          { section: 0, pages: [[0, 16], [1, 4]] },
          { section: 1, pages: [[0, 10]] },
        ];
        let assignFailed = false;
        for (const { section, pages } of assignmentPlan) {
          if (assignFailed) break;
          for (const [page, blockCount] of pages) {
            if (assignFailed) break;
            for (let block = 0; block < blockCount; block++) {
              try {
                output.send(SysExCodec.buildAssignmentQuery(section, page, block));
                const resp = await waitForResponse(
                  input, (d) => isSysEx(d, 0x12, 0x1C), ASSIGN_TIMEOUT, onMidiMessage
                );
                assignmentEntries.push(SysExCodec.parseAssignmentResponse(resp, section, page));
              } catch {
                assignFailed = true; break; // bail on first failure — device unresponsive
              }
            }
          }
        }
        setAssignments(assignmentEntries);

        // Step 10: Pull current bank (4 slots)
        const bankBase = Math.floor(slot / 4) * 4;
        const bankPresets: (GP200Preset | null)[] = [null, null, null, null];
        for (let i = 0; i < 4; i++) {
          const s = bankBase + i;
          const label = SysExCodec.slotToLabel(s);
          setHandshakeStep(`Slot ${label}…`);
          try {
            output.send(SysExCodec.buildReadRequest(s));
            const chunks = await collectChunks(input, 0x12, 0x18, 7, READ_TIMEOUT_MS, onMidiMessage);
            const p = SysExCodec.parseReadChunks(chunks);
            bankPresets[i] = p;
            setHandshakeStep(`Slot ${label} · ${p.patchName}`);
            if (s === slot) setCurrentPreset(p);
            presetNamesRef.current[s] = p.patchName;
          } catch {
            setHandshakeStep(`Slot ${label} · –`);
          }
          await new Promise(r => setTimeout(r, 20));
        }
        setPresetNames([...presetNamesRef.current]);

        // Step 11: Done
        setHandshakeStep(null);
        setStatus('connected');
      } catch (err) {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Handshake failed');
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
    }
  }, [onMidiMessage]);

  const disconnect = useCallback(() => {
    namesLoadAbortRef.current = true;
    namesLoadRunningRef.current = false;
    if (inputRef.current) inputRef.current.onmidimessage = null;
    outputRef.current = null;
    inputRef.current  = null;
    setStatus('disconnected');
    setDeviceName(null);
    setCurrentSlot(null); currentSlotRef.current = null;
    setErrorMessage(null);
    setDeviceInfo(null);
    setCurrentPreset(null);
    setAssignments([]);
  }, []);

  /** Abort background name loading and wait for it to stop */
  const pauseNameLoading = useCallback(async () => {
    if (namesLoadRunningRef.current) {
      namesLoadAbortRef.current = true;
      // Wait for the running loop to finish (max ~600ms for one in-flight request)
      for (let i = 0; i < 20 && namesLoadRunningRef.current; i++) {
        await new Promise(r => setTimeout(r, 50));
      }
    }
  }, []);

  const pullPreset = useCallback(async (slot: number): Promise<GP200Preset> => {
    await pauseNameLoading();
    return new Promise((resolve, reject) => {
      if (!outputRef.current || !inputRef.current) {
        reject(new Error('Not connected'));
        return;
      }
      const chunks: Uint8Array[] = [];
      let attempts = 0;
      let timer: ReturnType<typeof setTimeout>;

      function tryRequest() {
        chunks.length = 0;
        timer = setTimeout(() => {
          if (attempts < 1) {
            attempts++;
            tryRequest();
          } else {
            if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
            setStatus('error');
            setErrorMessage('Read timeout');
            reject(new Error('Read timeout'));
          }
        }, READ_TIMEOUT_MS);

        if (inputRef.current) {
          inputRef.current.onmidimessage = (event: { data: unknown }) => {
            const data = getBytes(event.data);
            console.log('[GP-200] pull rx:', Array.from(data).map(b => b.toString(16).padStart(2,'0')).join(' '));
            onMidiMessage(event);
            if (isSysEx(data, 0x12, 0x18)) {
              chunks.push(data);
              if (chunks.length === 7) {
                clearTimeout(timer);
                if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
                try { resolve(SysExCodec.parseReadChunks(chunks)); }
                catch (e) { reject(e); }
              }
            }
          };
        }

        const req = SysExCodec.buildReadRequest(slot);
        console.log('[GP-200] pull tx:', Array.from(req).map(b => b.toString(16).padStart(2,'0')).join(' '));
        outputRef.current!.send(req);
      }

      tryRequest();
    });
  }, [onMidiMessage, pauseNameLoading]);

  const pushPreset = useCallback(async (preset: GP200Preset, slot: number): Promise<void> => {
    if (!ENABLE_PUSH_PRESET) {
      console.warn('[GP-200] pushPreset is disabled in production — use writePresetToSlot');
      return;
    }
    await pauseNameLoading();
    if (!outputRef.current) throw new Error('Not connected');
    console.log(`[GP-200] push: slot=${slot} (${SysExCodec.slotToLabel(slot)}) name="${preset.patchName}"`);

    // Step 1: Send 4 write chunks (blocks 0-8 partial, 732 bytes decoded)
    // Write chunks go directly to flash storage for the target slot.
    // Captured Valeton flow: write chunks only, NO save-commit after (save-commit
    // overwrites flash with the editing buffer, discarding write chunk data).
    const chunks = SysExCodec.buildWriteChunks(preset, slot);
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[GP-200] push chunk ${i+1}/${chunks.length}: ${chunks[i].length}B`);
      outputRef.current.send(chunks[i]);
      await new Promise(r => setTimeout(r, 20));
    }

    // Step 2: Wait for device to process write chunks, then switch to the slot
    await new Promise(r => setTimeout(r, 150));
    const commitMsg = SysExCodec.buildPresetChange(slot);
    console.log(`[GP-200] push preset-change: slot=${slot}`);
    outputRef.current.send(commitMsg);

    // Update local state
    presetNamesRef.current[slot] = preset.patchName;
    setPresetNames([...presetNamesRef.current]);
    setCurrentSlot(slot); currentSlotRef.current = slot;

    console.log('[GP-200] push complete');
  }, [pauseNameLoading]);

  const saveToSlot = useCallback(async (presetName: string, slot?: number): Promise<void> => {
    if (!outputRef.current) return;
    // Save-commit persists the device's current editing buffer to flash.
    // Live edits (toggle, param, reorder) already updated the editing buffer.
    // Valeton flow: save-commit → preset-change (re-select slot to confirm).
    // decoded[4] must be the sub-slot index (A=0,B=1,C=2,D=3) — otherwise device saves to wrong slot!
    const targetSlot = slot ?? currentSlotRef.current ?? 0;
    const msg = SysExCodec.buildSaveCommit(presetName, targetSlot);
    console.log(`[GP-200] save-commit: name="${presetName}" slot=${targetSlot} (sub=${targetSlot % 4})`);
    outputRef.current.send(msg);
    // Wait for device to write to flash
    await new Promise(r => setTimeout(r, 300));
  }, []);

  const writePresetToSlot = useCallback(async (preset: GP200Preset, slot: number): Promise<void> => {
    await pauseNameLoading();
    if (!outputRef.current) throw new Error('Not connected');
    const output = outputRef.current;
    const label = SysExCodec.slotToLabel(slot);
    console.log(`[GP-200] writeToSlot: slot=${slot} (${label}) name="${preset.patchName}"`);

    // Step 1: Switch device to the target slot (loads current data into editing buffer)
    output.send(SysExCodec.buildPresetChange(slot));
    await new Promise(r => setTimeout(r, 200));

    // Step 2: Send all effects via live editing for each slot.
    // Per block: set the effect TYPE first (buildEffectChange, sub=0x14), then
    // params, then on/off state. Without the effect change the device keeps the
    // algorithm it already had loaded and the params/toggle apply to the wrong
    // effect, so the saved slot ends up as "whatever was already there" (#80).
    // IMPORTANT: address each block by its fixed slotIndex (0=PRE..10=VOL), NOT
    // the array position. PRSTDecoder returns effects in playback order, so for
    // a reordered preset the array position diverges from slotIndex and array
    // addressing writes every effect to the wrong physical block (#90).
    for (let i = 0; i < preset.effects.length; i++) {
      const eff = preset.effects[i];
      output.send(SysExCodec.buildEffectChange(eff.slotIndex, eff.effectId));
      await new Promise(r => setTimeout(r, 30));
      for (let p = 0; p < eff.params.length; p++) {
        if (eff.params[p] !== undefined) {
          output.send(SysExCodec.buildParamChange(eff.slotIndex, p, eff.effectId, eff.params[p]));
          await new Promise(r => setTimeout(r, 8));
        }
      }
      output.send(SysExCodec.buildToggleEffect(eff.slotIndex, eff.enabled));
      await new Promise(r => setTimeout(r, 15));
    }

    // Step 3: mirror the signal-chain order so the saved slot keeps the preset's
    // routing (the block writes above are slot-addressed and order-independent),
    // then send author + save-commit to persist (#90).
    await new Promise(r => setTimeout(r, 50));
    output.send(SysExCodec.buildReorderEffects(
      preset.effects.map(e => e.slotIndex), preset.fxLoopSend, preset.fxLoopReturn,
    ));
    await new Promise(r => setTimeout(r, 30));
    if (preset.author) {
      output.send(SysExCodec.buildAuthorName(preset.author));
      await new Promise(r => setTimeout(r, 30));
    }
    output.send(SysExCodec.buildSaveCommit(preset.patchName, slot));
    // Wait for device to finish writing to flash before returning
    await new Promise(r => setTimeout(r, 300));
    console.log(`[GP-200] writeToSlot complete: ${label} → "${preset.patchName}"`);

    // Update local state
    presetNamesRef.current[slot] = preset.patchName;
    setPresetNames([...presetNamesRef.current]);
    setCurrentSlot(slot); currentSlotRef.current = slot;
  }, [pauseNameLoading]);

  const loadPresetNames = useCallback(async (): Promise<void> => {
    if (!outputRef.current || !inputRef.current) return;
    if (namesLoadRunningRef.current) return; // already running
    namesLoadRunningRef.current = true;
    namesLoadAbortRef.current = false;
    const NAME_TIMEOUT = 500; // 500ms per slot (device responds in ~20ms normally)
    const BATCH_SIZE = 8;     // Update UI every 8 slots instead of every slot

    for (let s = 0; s < 256; s++) {
      if (namesLoadAbortRef.current) break;
      if (presetNamesRef.current[s] !== null) {
        setNamesLoadProgress(s + 1);
        continue;
      }
      const name = await new Promise<string | null>((resolve) => {
        const slotNum = s;
        const timer = setTimeout(() => {
          if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
          resolve(null);
        }, NAME_TIMEOUT);
        if (inputRef.current) {
          inputRef.current.onmidimessage = (event: { data: unknown }) => {
            const data = getBytes(event.data);
            onMidiMessage(event);
            if (isSysEx(data, 0x12, 0x18)) {
              const off = data[11] | (data[12] << 8);
              if (off === 0) {
                clearTimeout(timer);
                if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
                resolve(SysExCodec.parsePresetName(data));
              }
            }
          };
        }
        outputRef.current!.send(SysExCodec.buildReadRequest(slotNum));
      });
      if (namesLoadAbortRef.current) break;
      presetNamesRef.current[s] = name;
      // Batch UI updates: only re-render every BATCH_SIZE slots or on the last slot
      if ((s + 1) % BATCH_SIZE === 0 || s === 255) {
        setPresetNames([...presetNamesRef.current]);
      }
      setNamesLoadProgress(s + 1);
    }
    // Final flush in case we stopped mid-batch
    setPresetNames([...presetNamesRef.current]);
    if (inputRef.current) inputRef.current.onmidimessage = onMidiMessage;
    namesLoadRunningRef.current = false;
  }, [onMidiMessage]);

  // All send* helpers + device-callback setters come from useMidiSend (see
  // the top of the hook where `send` is instantiated). The return value at
  // the bottom spreads them onto the public API.

  // Track connection state for auto-reconnect
  useEffect(() => {
    if (status === 'connected') {
      wasConnectedRef.current = true;
      reconnectAttemptsRef.current = 0;
    }
  }, [status]);

  // Auto-reconnect when connection drops (USB replug, page navigation)
  useEffect(() => {
    if (status === 'disconnected' && wasConnectedRef.current && reconnectAttemptsRef.current < 3) {
      reconnectTimerRef.current = setTimeout(() => {
        reconnectAttemptsRef.current++;
        console.log(`[GP-200] auto-reconnect attempt ${reconnectAttemptsRef.current}/3`);
        connect();
      }, 2000);
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [status, connect]);

  return {
    status, handshakeStep, errorMessage, deviceName, currentSlot, presetNames, namesLoadProgress,
    deviceInfo, currentPreset, cabIrNames,
    connect, disconnect, loadPresetNames, pullPreset, pushPreset, writePresetToSlot, saveToSlot,
    // Send operations + device-callback registration are owned by useMidiSend.
    sendEffectChange: send.sendEffectChange,
    sendToggle: send.sendToggle,
    sendParamChange: send.sendParamChange,
    sendReorder: send.sendReorder,
    sendFxLoopMove: send.sendFxLoopMove,
    sendSlotChange: send.sendSlotChange,
    sendAuthor: send.sendAuthor,
    sendStyleName: send.sendStyleName,
    sendNote: send.sendNote,
    sendPatchVolume: send.sendPatchVolume,
    sendPatchPan: send.sendPatchPan,
    sendPatchTempo: send.sendPatchTempo,
    sendExpParamSelect: send.sendExpParamSelect,
    sendExpMinMax: send.sendExpMinMax,
    sendRawChunks: send.sendRawChunks,
    setOnDeviceChange: send.setOnDeviceChange,
    setOnDeviceToggle: send.setOnDeviceToggle,
    setOnDeviceEffectChange: send.setOnDeviceEffectChange,
    setOnDeviceParamChange: send.setOnDeviceParamChange,
  };
}
