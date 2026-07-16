import type { GP200Preset } from './types';
import { GP200PresetSchema } from './types';

export const SysExCodec = {
  /**
   * Encode a parameter value into the 2-byte logarithmic "display value" field
   * that lives at decoded[14:16] of a Param Change message (#80).
   *
   * Reverse-engineered from the Valeton knob-sweep capture
   * (gp200-capture-20260412-143552.pcap): the field is a custom log encoding,
   * identical across params for the same value, fit (±1 LSB) by
   *   u16 = round(16367 + 16 * log2(value))
   * with value <= 0 mapping to 0. Returns [lowByte, highByte] (LE) for
   * decoded[14], decoded[15].
   *
   * The device reads THIS field (not the float32 at [20:24]) for the first
   * parameter of a block, which is why hardcoding 0x6F there zeroed param 0.
   */
  encodeDisplayValue(value: number): Uint8Array {
    let u16 = 0;
    if (value > 0) {
      u16 = Math.round(16367 + 16 * Math.log2(value));
      if (u16 < 0) u16 = 0;
      if (u16 > 0xFFFF) u16 = 0xFFFF;
    }
    return new Uint8Array([u16 & 0xFF, (u16 >> 8) & 0xFF]);
  },

  nibbleDecode(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(Math.floor(data.length / 2));
    for (let i = 0; i < out.length; i++) {
      out[i] = ((data[2 * i] & 0x0F) << 4) | (data[2 * i + 1] & 0x0F);
    }
    return out;
  },

  nibbleEncode(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length * 2);
    for (let i = 0; i < data.length; i++) {
      out[2 * i]     = (data[i] >> 4) & 0x0F;
      out[2 * i + 1] = data[i] & 0x0F;
    }
    return out;
  },

  slotToLabel(slot: number): string {
    const bank = Math.floor(slot / 4) + 1;
    const letter = 'ABCD'[slot % 4];
    return `${bank}${letter}`;
  },

  labelToSlot(label: string): number {
    const match = label.match(/^(\d+)([ABCD])$/);
    if (!match) throw new Error(`Invalid slot label: ${label}`);
    const bank = parseInt(match[1], 10);
    const letter = 'ABCD'.indexOf(match[2]);
    return (bank - 1) * 4 + letter;
  },

  buildReadRequest(slot: number): Uint8Array {
    // CMD=0x11, sub=0x10, 46 bytes — corrected from USB capture 2026-03-19
    // Slot nibble-encoded (high first) at positions [25-26], [37-38], [41-42]
    const sh = (slot >> 4) & 0x0F;
    const sl = slot & 0x0F;
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,  // [0-7]   header
      0x11, 0x10,                                        // [8-9]   CMD, sub
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [10-17] padding
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x01, 0x00,                                        // [22-23] constant
      0x00,                                              // [24]    padding
      sh, sl,                                            // [25-26] slot nibble
      0x00, 0x00, 0x00,                                  // [27-29] padding
      0x01, 0x00,                                        // [30-31] constant
      0x00, 0x00,                                        // [32-33] padding
      0x04, 0x00, 0x00,                                  // [34-36] constant (3 bytes)
      sh, sl,                                            // [37-38] slot nibble
      0x00, 0x00,                                        // [39-40] padding
      sh, sl,                                            // [41-42] slot nibble
      0x00, 0x00,                                        // [43-44] padding
      0xF7,                                              // [45]    end
    ]);
  },

  parsePresetName(sysexMsg: Uint8Array): string {
    // Extract nibble data from a sub=0x18 chunk (offset must be 0)
    // sysexMsg layout: [F0 header(10B)][slot(1B)][off_lo(1B)][off_hi(1B)][nibble_data...][F7]
    const nibbleData = sysexMsg.slice(13, sysexMsg.length - 1);
    const decoded = this.nibbleDecode(nibbleData);
    // In a full preset, name starts at byte 28 (16 bytes). In the first chunk (offset=0),
    // the nibble data covers decoded bytes 0..184, so name is at decoded[28..43].
    let name = '';
    for (let i = 0; i < 16; i++) {
      const b = decoded[28 + i];
      if (b === 0) break;
      name += String.fromCharCode(b);
    }
    return name;
  },

  /** Shared: assemble sorted chunks → nibble-decoded bytes */
  assembleChunks(chunks: Uint8Array[]): Uint8Array {
    const sorted = [...chunks].sort((a, b) => {
      const offA = a[11] | (a[12] << 8);
      const offB = b[11] | (b[12] << 8);
      return offA - offB;
    });
    const nibbleParts = sorted.map(msg => msg.slice(13, msg.length - 1));
    const totalLen = nibbleParts.reduce((s, p) => s + p.length, 0);
    const allNibbles = new Uint8Array(totalLen);
    let pos = 0;
    for (const part of nibbleParts) {
      allNibbles.set(part, pos);
      pos += part.length;
    }
    return this.nibbleDecode(allNibbles);
  },

  /** Parse preset data from decoded bytes (shared by parseReadChunks and parseStateDump) */
  parsePresetFromDecoded(decoded: Uint8Array, fallbackName?: string): GP200Preset {
    let patchName = '';
    if (decoded.length > 43) {
      for (let i = 0; i < 16; i++) {
        const b = decoded[28 + i];
        if (b === 0) break;
        patchName += String.fromCharCode(b);
      }
    }
    patchName = patchName.trim();
    if (!patchName && fallbackName) patchName = fallbackName;

    // Author at decoded[44:60] (16 bytes, null-terminated)
    let author = '';
    if (decoded.length > 59) {
      for (let i = 0; i < 16; i++) {
        const b = decoded[44 + i];
        if (b === 0) break;
        author += String.fromCharCode(b);
      }
    }

    const rawSend = decoded.length > 106 ? decoded[106] : 4;
    const rawReturn = decoded.length > 107 ? decoded[107] : 4;
    const fxLoopSend = rawSend >= 1 && rawSend <= 10 ? rawSend : 4;
    const fxLoopReturn = rawReturn >= 1 && rawReturn <= 10 ? rawReturn : 4;

    const effects: GP200Preset['effects'] = [];
    const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    for (let b = 0; b < 11; b++) {
      const base = 120 + b * 72;
      if (base + 72 > decoded.length) {
        effects.push({ slotIndex: b, enabled: false, effectId: 0, params: new Array(15).fill(0) });
        continue;
      }
      const slotIndex = decoded[base + 4];
      const enabled = decoded[base + 5] === 1;
      const effectId = view.getUint32(base + 8, true);
      const params: number[] = [];
      for (let p = 0; p < 15; p++) {
        params.push(view.getFloat32(base + 12 + p * 4, true));
      }
      effects.push({ slotIndex, enabled, effectId, params });
    }

    return GP200PresetSchema.parse({ version: '1', patchName, author: author || undefined, effects, fxLoopSend, fxLoopReturn, checksum: 0 });
  },

  parseReadChunks(chunks: Uint8Array[]): GP200Preset {
    const decoded = this.assembleChunks(chunks);
    return this.parsePresetFromDecoded(decoded);
  },

  /**
   * @deprecated Chunk offsets overlap (0/311/622/1061/1372 with chunk size
   * 366) and block 10 (VOL) is only partially populated — hardware testing
   * confirmed this pathway is unreliable. Prefer the writePresetToSlot flow
   * (buildToggle + buildParam + buildSaveCommit) which the device handles
   * correctly. Kept only for USB-capture replay during protocol research.
   */
  buildWriteChunks(preset: GP200Preset, slot: number): Uint8Array[] {
    const SYSEX_HEADER = [0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20];

    // Build 876-byte decoded write payload — extended from 732 to include
    // all 11 effect blocks (previously blocks 9=RVB and 10=VOL were omitted,
    // causing silent data loss when those effects were modified).
    // 876 bytes nibble-encoded = 1752 nibble bytes, split into 5 chunks (4×366 + 1×288).
    // Layout: [0:36] write header, [36:68] name+author,
    //         [68:128] middle section with routing, [128:704] 8×72B effect blocks 0-7,
    //         [704:776] effect block 8 complete (72B),
    //         [776:848] effect block 9 (RVB, 72B),
    //         [848:876] effect block 10 (VOL) partial (28B of 72B)
    // NOTE: Block 10 (VOL) is only partially sent (first 28 of 72 bytes).
    // Full block 10 support requires verifying 5-chunk writes via USB capture.
    const PAYLOAD_SIZE = 876;
    const payload = new Uint8Array(PAYLOAD_SIZE).fill(0);
    const view = new DataView(payload.buffer);

    // [0:36] Write header — exact bytes from captured write (Valeton GP-200 Editor)
    // The 0x27 values are static write markers, NOT slot-dependent addresses.
    // Slot is identified by byte[10] in each SysEx chunk header.
    payload.set([
      0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0x27, 0x00,  // [0:8]
      0x01, 0x00, 0x04, 0x00, 0x27, 0x00, 0x27, 0x00,  // [8:16]
      0x02, 0x00, 0x58, 0x00, 0x27, 0x00, 0x78, 0x00,  // [16:24]
      0x32, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [24:32]
      0x00, 0x00, 0x00, 0x00,                            // [32:36]
    ], 0);

    // [36:52] Preset name (16 bytes, null-terminated)
    for (let i = 0; i < 16; i++) {
      payload[36 + i] = i < preset.patchName.length ? preset.patchName.charCodeAt(i) : 0;
    }

    // [52:68] Author (16 bytes, null-terminated)
    if (preset.author) {
      for (let i = 0; i < 16; i++) {
        payload[52 + i] = i < preset.author.length ? preset.author.charCodeAt(i) : 0;
      }
    }

    // [68:108] Middle section — zeros (URL/padding area)

    // [108:128] Routing section
    payload.set([0x08, 0x00, 0x10, 0x00], 108);
    payload[112] = 0x25; payload[113] = 0x00; // static write marker (captured: 0x25)
    payload[114] = preset.fxLoopSend;
    payload[115] = preset.fxLoopReturn;
    // Routing order from preset effects' slotIndex ordering
    for (let i = 0; i < 11; i++) {
      payload[116 + i] = preset.effects[i]?.slotIndex ?? i;
    }
    // [127] = 0x00 terminator (already zero)

    // Clamp NaN/Infinity to 0 — mirrors PRSTDecoder/PRSTEncoder behavior.
    const safeParam = (v: number | undefined) => (v !== undefined && Number.isFinite(v)) ? v : 0;

    // [128:704] Effect blocks 0-7 complete (8 × 72 = 576 bytes)
    for (let b = 0; b < 8; b++) {
      const base = 128 + b * 72;
      const eff = preset.effects[b];
      if (!eff) continue;
      payload[base] = 0x14; payload[base + 1] = 0x00;
      payload[base + 2] = 0x44; payload[base + 3] = 0x00;
      payload[base + 4] = eff.slotIndex;
      payload[base + 5] = eff.enabled ? 1 : 0;
      payload[base + 6] = 0x00; payload[base + 7] = 0x0F;
      view.setUint32(base + 8, eff.effectId, true);
      for (let p = 0; p < 15; p++) {
        view.setFloat32(base + 12 + p * 4, safeParam(eff.params[p]), true);
      }
    }

    // [704:776] Effect block 8 complete (72 bytes)
    if (preset.effects[8]) {
      const base = 704;
      const eff = preset.effects[8];
      payload[base] = 0x14; payload[base + 1] = 0x00;
      payload[base + 2] = 0x44; payload[base + 3] = 0x00;
      payload[base + 4] = eff.slotIndex;
      payload[base + 5] = eff.enabled ? 1 : 0;
      payload[base + 6] = 0x00; payload[base + 7] = 0x0F;
      view.setUint32(base + 8, eff.effectId, true);
      for (let p = 0; p < 15; p++) {
        view.setFloat32(base + 12 + p * 4, safeParam(eff.params[p]), true);
      }
    }

    // [776:848] Effect block 9 (RVB) complete (72 bytes)
    if (preset.effects[9]) {
      const base = 776;
      const eff = preset.effects[9];
      payload[base] = 0x14; payload[base + 1] = 0x00;
      payload[base + 2] = 0x44; payload[base + 3] = 0x00;
      payload[base + 4] = eff.slotIndex;
      payload[base + 5] = eff.enabled ? 1 : 0;
      payload[base + 6] = 0x00; payload[base + 7] = 0x0F;
      view.setUint32(base + 8, eff.effectId, true);
      for (let p = 0; p < 15; p++) {
        view.setFloat32(base + 12 + p * 4, safeParam(eff.params[p]), true);
      }
    }

    // [848:876] Effect block 10 (VOL) partial (28 of 72 bytes: marker+slot+active+const+effID+4 params)
    // TODO: Capture 5-chunk USB write to verify full block 10 support.
    if (preset.effects[10]) {
      const base = 848;
      const eff = preset.effects[10];
      payload[base] = 0x14; payload[base + 1] = 0x00;
      payload[base + 2] = 0x44; payload[base + 3] = 0x00;
      payload[base + 4] = eff.slotIndex;
      payload[base + 5] = eff.enabled ? 1 : 0;
      payload[base + 6] = 0x00; payload[base + 7] = 0x0F;
      view.setUint32(base + 8, eff.effectId, true);
      for (let p = 0; p < 4; p++) {
        view.setFloat32(base + 12 + p * 4, safeParam(eff.params[p]), true);
      }
    }

    // Nibble-encode → 1752 nibble bytes, split into 5 chunks (4×366 + 1×288)
    // Offsets from USB capture 7-chunk write format: 0, 311, 622, 1061, 1372, 1811, 2122
    // Pattern: +311, +311, +439, +311, +439, +311 (alternating 311/439)
    const nibble = this.nibbleEncode(payload);
    const CHUNK_SIZE = 366;
    const numChunks = Math.ceil(nibble.length / CHUNK_SIZE);
    const CHUNK_OFFSETS = [0, 311, 622, 1061, 1372];

    const chunks: Uint8Array[] = [];
    for (let i = 0; i < numChunks; i++) {
      const nibbleData = nibble.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const offLo = CHUNK_OFFSETS[i] & 0xFF;
      const offHi = (CHUNK_OFFSETS[i] >> 8) & 0xFF;

      const chunkBytes: number[] = [];
      chunkBytes.push(...SYSEX_HEADER);
      chunkBytes.push(slot & 0xFF);
      chunkBytes.push(offLo);
      chunkBytes.push(offHi);
      chunkBytes.push(...Array.from(nibbleData));
      chunkBytes.push(0xF7);
      chunks.push(new Uint8Array(chunkBytes));
    }
    return chunks;
  },

  buildIdentityQuery(): Uint8Array {
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x04,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xF7,
    ]);
  },

  buildEnterEditorMode(): Uint8Array {
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x12,
      0x00, 0x00, 0x00,
      0xF7,
    ]);
  },

  buildStateDumpRequest(): Uint8Array {
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x04,
      0x00, 0x00, 0x00, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xF7,
    ]);
  },

  buildVersionCheck(): Uint8Array {
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x0A,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x06, 0x00, 0x00,
      0x0D, 0x04, 0x0F, 0x07, 0x08, 0x0B, 0x00, 0x00, 0x0C, 0x0B, 0x04, 0x05,
      0xF7,
    ]);
  },

  buildAssignmentQuery(section: number, page: number, block: number): Uint8Array {
    const SEC0_HDR = [0x00, 0x00, 0x00, 0x00, 0x09, 0x01, 0x00, 0x01, 0x08];
    const SEC1_HDR = [0x00, 0x00, 0x00, 0x01, 0x02, 0x01, 0x00, 0x01, 0x08];
    const header = section === 1 ? SEC1_HDR : SEC0_HDR;
    // REF_DATA: bytes [26-68] from capture (msg #12, section 0/page 0/block 0)
    const REF_DATA = [
      0x01, 0x00, 0x00,
      0x0C, 0x0E, 0x07, 0x03, 0x0B, 0x02, 0x00, 0x00,
      0x07, 0x02, 0x04, 0x0F, 0x06, 0x05, 0x00, 0x09,
      0x00, 0x0C, 0x0F, 0x0E, 0x0D, 0x0A, 0x00, 0x0B,
      0x09, 0x08, 0x07, 0x05, 0x0E, 0x08, 0x00, 0x02,
      0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ];
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,
      0x11, 0x1C,
      ...header,
      0x00, 0x00,
      page & 0xFF,
      block & 0x0F,
      0x00, 0x00, 0x00,
      ...REF_DATA,
      0xF7,
    ]);
  },

  parseIdentityResponse(msg: Uint8Array): { deviceType: number; firmwareValues: number[] } {
    // sub=0x08 response — bytes [22] and [26] are NOT firmware version
    // (they show 1.2 regardless of actual FW, likely protocol version).
    // Actual firmware version is not transmitted via SysEx identity.
    // We return deviceType only; firmware compat uses version check (sub=0x0A).
    return {
      deviceType: msg[18],
      firmwareValues: [],
    };
  },

  parseVersionResponse(msg: Uint8Array): { accepted: boolean } {
    // Validate basic SysEx structure: F0 header + CMD=0x12 (device→host) + sub=0x0A
    // The original strict check (bytes 21-32 all zero) rejected FW 1.8.0,
    // so we only verify the message envelope is a valid version response.
    if (msg.length < 34) return { accepted: false };
    if (msg[0] !== 0xF0) return { accepted: false };
    if (msg[8] !== 0x12) return { accepted: false };
    if (msg[9] !== 0x0A) return { accepted: false };
    return { accepted: true };
  },

  parseAssignmentResponse(msg: Uint8Array, section: number, page: number): { section: number; page: number; block: number; name: string; rawData: Uint8Array } {
    const block = msg[22];
    const nibbleData = msg.slice(27, msg.length - 1);
    const decoded = this.nibbleDecode(nibbleData);
    let name = '';
    let nameStart = 0;
    while (nameStart < decoded.length && decoded[nameStart] === 0) nameStart++;
    for (let i = nameStart; i < decoded.length; i++) {
      if (decoded[i] === 0) break;
      name += String.fromCharCode(decoded[i]);
    }
    return { section, page, block, name, rawData: decoded };
  },

  parseStateDump(chunks: Uint8Array[]): { slot: number } {
    // State dump uses same nibble-encoded chunk format as read responses.
    // Decoded header: [0:8] constants, [8:10] current slot as LE16.
    // Verified via captures 084047 (slot 13 = 04-B) and 084156 (slot 0 = 01-A).
    if (chunks.length === 0) return { slot: 0 };
    const decoded = this.assembleChunks(chunks);
    if (decoded.length >= 10) {
      const slot = decoded[8] | (decoded[9] << 8);
      if (slot >= 0 && slot < 256) return { slot };
    }
    return { slot: 0 };
  },

  // ── Real-time editing commands (reverse-engineered 2026-03-19) ──────────

  buildToggleEffect(blockIndex: number, enabled: boolean): Uint8Array {
    // CMD=0x12, sub=0x10, 46 bytes — raw SysEx (not nibble-encoded)
    // Confirmed: captures 100548 (WAH OFF, BOOST OFF, DLY ON, MOD ON) + 101538
    // Block indices: 0=PRE 1=WAH 2=BOOST 3=AMP 4=NR 5=CAB 6=EQ 7=MOD 8=DLY 9=RVB 10=VOL
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, // [0-7]   header
      0x12, 0x10,                                        // [8-9]   CMD, sub
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [10-17] padding
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x00, 0x00, 0x00,                                  // [22-24] padding
      0x00, 0x00,                                        // [25-26] zeros
      0x00, 0x00,                                        // [27-28] padding
      0x01, 0x05,                                        // [29-30] constant
      0x00, 0x00, 0x00,                                  // [31-33] padding
      0x04, 0x00, 0x00, 0x00,                            // [34-37] constant
      blockIndex & 0x0F,                                 // [38]    block index
      0x00,                                              // [39]    padding
      enabled ? 0x01 : 0x00,                             // [40]    state
      0x09, 0x0C,                                        // [41-42] constant
      0x00, 0x02,                                        // [43-44] constant
      0xF7,                                              // [45]    end
    ]);
  },

  buildEffectChange(blockIndex: number, effectId: number): Uint8Array {
    // CMD=0x12, sub=0x14, 54 bytes — raw SysEx (not nibble-encoded)
    // Confirmed: captures 134828 (COMP→COMP4→AC Boost) + 143107 (AMP→SnapTone)
    // raw[38]=block, raw[45:47]=variant nibble-encoded, raw[52]=module type
    // NOTE: Sub-category byte (bits 16-23, e.g. 0x10 for User IR) encoding position
    // is unknown — only regular effects (sub-category=0x00) are confirmed via captures.
    const moduleType = (effectId >> 24) & 0xFF;
    const variant = effectId & 0xFF;
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, // [0-7]   header
      0x12, 0x14,                                        // [8-9]   CMD=SET, sub=EFFECT_CHANGE
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [10-17]
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,         // [22-28]
      0x01, 0x06,                                        // [29-30] constant
      0x00, 0x00, 0x00,                                  // [31-33]
      0x08,                                              // [34]    constant
      0x00, 0x00, 0x00,                                  // [35-37]
      blockIndex & 0x0F,                                 // [38]    block index
      0x00, 0x00,                                        // [39-40]
      0x07, 0x06, 0x00, 0x02,                            // [41-44] constant
      (variant >> 4) & 0x0F,                             // [45]    variant high nibble
      variant & 0x0F,                                    // [46]    variant low nibble
      0x00, 0x00, 0x00, 0x00, 0x00,                     // [47-51]
      moduleType & 0xFF,                                 // [52]    module type
      0xF7,                                              // [53]    end
    ]);
  },

  buildParamChange(blockIndex: number, paramIndex: number, effectId: number, value: number): Uint8Array {
    // CMD=0x12, sub=0x18, 62 bytes — nibble-encoded 24-byte payload
    // Confirmed: capture 102448 (DLY Ping Pong: Mix/Feedback/Time/Sync/Trail)
    //            capture 102857 (AMP Mess4 LD: Gain/Presence/Volume/Bass/Middle/Treble)
    // ParamIndex matches effectParams.ts definition order
    // effectId: uint32 LE from preset effect block (e.g. 0x0B000004 = DLY Ping Pong)
    const decoded = new Uint8Array(24);
    const view = new DataView(decoded.buffer);
    decoded[2] = 0x04;                          // constant
    decoded[8] = 0x05;                          // msg type: param change
    decoded[10] = 0x0C;                         // constant
    decoded[12] = blockIndex;                   // 0-10
    decoded[13] = paramIndex;                   // 0-14
    // decoded[14:16] = logarithmic display-value field. The device reads this
    // (not the float32 below) for a block's FIRST parameter, so the old constant
    // 0x6F made param 0 of every effect land at 0 (#80). Encode the real value.
    const disp = this.encodeDisplayValue(value);
    decoded[14] = disp[0];
    decoded[15] = disp[1];
    view.setUint32(16, effectId, true);         // effect code LE
    view.setFloat32(20, value, true);           // parameter value

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(62);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[61] = 0xF7;
    return msg;
  },

  buildPatchSetting(target: number, value: number): Uint8Array {
    // CMD=0x12, sub=0x10, 46 bytes — similar to toggle but different constants
    // Confirmed: capture 140802 (Valeton VOL/PAN/Tempo) — bytes[29:31]=0x00,0x06 (not 0x01,0x05 like toggle)
    // target: 0x00=VOL, 0x01=Tempo, 0x06=PAN
    // value: nibble-encoded at raw[41:43], for PAN-left also raw[43:45]=0x0F,0x0F
    const msg = new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, // [0-7]   header
      0x12, 0x10,                                        // [8-9]   CMD, sub
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [10-17] padding
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x00, 0x00, 0x00,                                  // [22-24] padding
      0x00, 0x00,                                        // [25-26]
      0x00, 0x00,                                        // [27-28]
      0x00, 0x06,                                        // [29-30] patch setting constant (toggle has 0x01,0x05)
      0x00, 0x00, 0x00,                                  // [31-33]
      0x04, 0x00, 0x00, 0x00,                            // [34-37] constant
      target & 0x0F,                                     // [38]    target (VOL/Tempo/PAN)
      0x00,                                              // [39]
      0x00,                                              // [40]    0x00 = patch setting (not toggle)
      (value >> 4) & 0x0F,                               // [41]    value high nibble
      value & 0x0F,                                      // [42]    value low nibble
      0x00, 0x00,                                        // [43-44] 0x00 normally, 0x0F for PAN-left
      0xF7,                                              // [45]    end
    ]);
    // PAN left-of-center: values 128-255, set raw[43:45] = 0x0F, 0x0F
    if (target === 0x06 && value > 127) {
      msg[43] = 0x0F;
      msg[44] = 0x0F;
    }
    // Tempo > 255: high byte in raw[43:45]
    if (target === 0x01 && value > 255) {
      msg[41] = (value >> 4) & 0x0F;
      msg[42] = value & 0x0F;
      msg[43] = (value >> 12) & 0x0F;
      msg[44] = (value >> 8) & 0x0F;
    }
    return msg;
  },

  buildReorderEffects(order: number[], send: number, ret: number): Uint8Array {
    // CMD=0x12, sub=0x20, 78 bytes — nibble-encoded 32-byte payload
    // Confirmed: capture 101538 (NR↔AMP swap) + 101714 (NR↔AMP + DLY↔RVB)
    // order: array of 11 slot indices representing the new chain order
    // decoded[14]=SEND, decoded[15]=RETURN (1..10). decoded[27]=0x44 flags this
    // as a routing-reorder (vs FX-loop move which uses 0x08/0xBA — see buildFxLoopMove).
    // Device responds with sub=0x14 echoing the new routing order
    const decoded = new Uint8Array(32);
    decoded[2] = 0x04;                          // constant
    decoded[8] = 0x08;                          // msg type: reorder
    decoded[10] = 0x10;                         // constant
    decoded[14] = send & 0xFF;                  // SEND position (1..10)
    decoded[15] = ret & 0xFF;                   // RETURN position (1..10)
    for (let i = 0; i < 11 && i < order.length; i++) {
      decoded[16 + i] = order[i];
    }
    decoded[27] = 0x44;                         // terminator

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(78);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[77] = 0xF7;
    return msg;
  },

  buildFxLoopMove(order: number[], send: number, ret: number, which: 'send' | 'return'): Uint8Array {
    // CMD=0x12, sub=0x20, 78 bytes — nibble-encoded 32-byte payload
    // Confirmed: captures 075745 (SEND moves) + 075856 (RETURN moves) — 2026-05-18
    // Same envelope as buildReorderEffects, but with FX-loop discriminators:
    //   decoded[6]=0x51 and decoded[12]=0x51 (vs 0x00 in reorder)
    //   decoded[27]=0x08 (send moved) or 0xBA (return moved), vs 0x44 (reorder)
    // Routing array decoded[16:27] reflects current state (unchanged by this op).
    const decoded = new Uint8Array(32);
    decoded[2] = 0x04;
    decoded[6] = 0x51;
    decoded[8] = 0x08;
    decoded[10] = 0x10;
    decoded[12] = 0x51;
    decoded[14] = send & 0xFF;
    decoded[15] = ret & 0xFF;
    for (let i = 0; i < 11 && i < order.length; i++) {
      decoded[16 + i] = order[i];
    }
    decoded[27] = which === 'send' ? 0x08 : 0xBA;

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(78);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[77] = 0xF7;
    return msg;
  },

  buildSaveCommit(presetName: string, slot: number): Uint8Array {
    // CMD=0x12, sub=0x18, 62 bytes — nibble-encoded "save to slot" commit
    // From captures 100548 + 101538: sent after live edits or write chunks to persist
    // Decoded payload: [0:3]=03 20 14, [4]=sub-slot (A=0,B=1,C=2,D=3), [8:24]=name
    // Confirmed: capture 121732 slot 1B has decoded[4]=0x01, slot 1A has decoded[4]=0x00
    const decoded = new Uint8Array(24);
    decoded[0] = 0x03;
    decoded[1] = 0x20;
    decoded[2] = 0x14;
    decoded[4] = slot;  // full absolute slot number (0-255), nibble-encoded by caller
    // [8:24] = preset name (16 bytes, null-terminated — same as .prst format)
    for (let i = 0; i < 16 && i < presetName.length; i++) {
      decoded[8 + i] = presetName.charCodeAt(i);
    }

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(62);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[61] = 0xF7;
    return msg;
  },

  buildAuthorName(author: string): Uint8Array {
    // CMD=0x12, sub=0x20, 78 bytes — nibble-encoded 32-byte payload
    // Confirmed: capture 143029 pkt 71 — decoded[8]=0x09 (Author msg type)
    // Decoded: 00 00 04 00 00 00 01 00 09 00 14 00 01 00 70 0B [author 16B]
    const decoded = new Uint8Array(32);
    decoded[2] = 0x04;
    decoded[6] = 0x01;
    decoded[8] = 0x09;                          // msg type: author
    decoded[10] = 0x14;
    decoded[12] = 0x01;
    decoded[14] = 0x70;
    decoded[15] = 0x0B;
    for (let i = 0; i < 16 && i < author.length; i++) {
      decoded[16 + i] = author.charCodeAt(i);
    }

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(78);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[77] = 0xF7;
    return msg;
  },

  buildStyleName(styleName: string): Uint8Array {
    // CMD=0x12, sub=0x18, 62 bytes — nibble-encoded 24-byte payload
    // Confirmed: capture 143029 pkt 135 — different header from param change
    // decoded[0:8]=03 20 14 00 01 00 a1 00, decoded[8:24]=style name
    const decoded = new Uint8Array(24);
    decoded[0] = 0x03;
    decoded[1] = 0x20;
    decoded[2] = 0x14;
    decoded[4] = 0x01;
    decoded[6] = 0xa1;
    for (let i = 0; i < 16 && i < styleName.length; i++) {
      decoded[8 + i] = styleName.charCodeAt(i);
    }

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(62);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[61] = 0xF7;
    return msg;
  },

  buildNote(note: string): Uint8Array {
    // CMD=0x12, sub=0x38, 126 bytes — nibble-encoded 56-byte payload
    // Confirmed: capture 143029 pkt 129 — decoded[8]=0x0B (Note msg type)
    // Decoded: 00 00 04 00 00 00 01 00 0B 00 2C 00 01 00 A1 00 [note 40B]
    const decoded = new Uint8Array(56);
    decoded[2] = 0x04;
    decoded[6] = 0x01;
    decoded[8] = 0x0B;                          // msg type: note
    decoded[10] = 0x2C;
    decoded[12] = 0x01;
    decoded[14] = 0xA1;
    for (let i = 0; i < 40 && i < note.length; i++) {
      decoded[16 + i] = note.charCodeAt(i);
    }

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(126);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x38, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[125] = 0xF7;
    return msg;
  },

  buildExpNavigation(page: number, item?: number, blockIndex?: number, paramIndex?: number): Uint8Array {
    // CMD=0x12, sub=0x18, 62 bytes — nibble-encoded "section navigation"
    // Selects which EXP/Mode to edit AND which effect parameter to assign.
    // Confirmed: capture 200517 — decoded[2]=0x40 discriminates from param change,
    // decoded[11]=page (0=EXP1 ModeA, 1=EXP1 ModeB, 2=EXP2)
    // Confirmed: capture 204352 — decoded[13]=blockIndex<<4, decoded[14]=paramIndex<<4
    //   COMP(PRE,block0,param0): decoded[13:15]=00 00
    //   WAH(block1,param1):      decoded[13:15]=10 10
    //   VOL-Volume(block10):     decoded[13:15]=a0 00
    const decoded = new Uint8Array(24);
    decoded[2] = 0x04;                            // discriminator: section nav
    decoded[8] = 0x0C;                            // constant
    decoded[10] = 0x0C;                           // constant
    decoded[11] = page & 0xFF;                    // 0=EXP1A, 1=EXP1B, 2=EXP2
    decoded[12] = (item ?? 0) & 0x0F;            // Para slot: 0=Para1, 1=Para2, 2=Para3
    decoded[13] = (blockIndex ?? 0) & 0x0F;       // effect block (0-10)
    decoded[14] = (paramIndex ?? 0) & 0x0F;       // param index
    decoded[18] = 0xC8;                           // constant (was 0x84 — off-by-one analysis error)
    decoded[19] = 0x42;                           // constant (was 0x20)

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(62);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[61] = 0xF7;
    return msg;
  },

  buildExpAssignment(section: number, page: number, item: number, value: number): Uint8Array {
    // CMD=0x12, sub=0x14, 54 bytes — EXP/QA assignment write
    // Confirmed: capture 200517 — type=0x0E at raw[30]
    // raw[38]=section (0=param select, 1=min/max), raw[39]=page, raw[40]=item (Para 1-3)
    // Nibble-decoded float32 LE at decoded[2:6] for value
    // section=0: float=param dropdown index (0.0=unassign, 1.0+=param)
    // section=1: float=min or max value
    const decoded = new Uint8Array(6);
    decoded[0] = 0x40;                            // constant marker
    decoded[1] = 0x0C;                            // constant marker
    const view = new DataView(decoded.buffer);
    view.setFloat32(2, value, true);              // float32 LE

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(54);
    msg.set([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, // [0-7]   header
      0x12, 0x14,                                        // [8-9]   CMD=SET, sub
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [10-17] padding
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,         // [22-28] padding
      0x00, 0x0E,                                        // [29-30] type=EXP/QA assignment
      0x00, 0x00, 0x00,                                  // [31-33]
      0x08,                                              // [34]    constant
      0x00, 0x00, 0x00,                                  // [35-37]
      section & 0x01,                                    // [38]    section (0=param, 1=min/max)
      page & 0xFF,                                       // [39]    page (0=EXP1A, 1=EXP1B, 2=EXP2)
      item & 0x0F,                                       // [40]    item (0=Para1, 1=Para2, 2=Para3)
    ]);
    msg.set(nibbles, 41);                                // [41-52] nibble-encoded float32
    msg[53] = 0xF7;                                      // [53]    end
    return msg;
  },

  buildPresetChange(slot: number): Uint8Array {
    // CMD=0x12, sub=0x08, 30 bytes — switch device to preset slot
    // Slot nibble-encoded at [25:26] (SysEx data bytes must be 0x00-0x7F)
    // H→D: device switches to slot. D→H: device notifies slot change.
    const sh = (slot >> 4) & 0x0F;
    const sl = slot & 0x0F;
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, // [0-7]   header
      0x12, 0x08,                                        // [8-9]   CMD, sub
      0x00, 0x00, 0x00, 0x00,                            // [10-13] padding
      0x08, 0x01,                                        // [14-15] constant
      0x00, 0x00,                                        // [16-17] padding
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x00, 0x00, 0x00,                                  // [22-24] padding
      sh,                                                // [25]    slot high nibble
      sl,                                                // [26]    slot low nibble
      0x00, 0x00,                                        // [27-28] padding
      0xF7,                                              // [29]    end
    ]);
  },
};
