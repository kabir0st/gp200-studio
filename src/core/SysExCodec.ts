import type { GP200Preset } from './types';
import { GP200PresetSchema } from './types';
import { CONTROL_RECORDS_DUMP_OFFSET, parseControlRecords } from './controlRecords';

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
    // CMD=0x11, sub=0x10, 46 bytes. Corrected from USB capture 2026-03-19
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

  /**
   * Name-only slot read: identical request shape to buildReadRequest but
   * sub=0x20 instead of 0x10. The device answers with a single sub=0x18
   * chunk (offset 0) whose decoded[28:44] is the preset name, the same
   * layout parsePresetName already handles. Documented for firmware 1.8.0
   * (toneforge sysex-protocol.md); much faster than pulling all 7 chunks
   * when enumerating all 256 slots, so callers should probe once and fall
   * back to buildReadRequest on timeout.
   */
  buildNameReadRequest(slot: number): Uint8Array {
    const msg = this.buildReadRequest(slot);
    msg[9] = 0x20;
    return msg;
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

    // Per-patch VOL/PAN/TEMPO. Dump mirrors the file shifted -0x28, so file
    // 0x36/0x38/0x3C land at 14/16/20. Defensively clamped like fxLoop above.
    const rawVol = decoded.length > 16 ? decoded[16] : 50;
    const patchVolume = rawVol <= 100 ? rawVol : 50;
    const patchTempo = decoded.length > 15 ? decoded[14] | (decoded[15] << 8) : 120;
    const rawPan = decoded.length > 20 ? decoded[20] : 0;
    const panSigned = rawPan > 127 ? rawPan - 256 : rawPan;
    const patchPan = panSigned >= -50 && panSigned <= 50 ? panSigned : 0;

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

    // Re-order by the routing table at decoded[108..118] (mirrors the .prst
    // routing bytes at 0x94..0x9E; the dump payload sits 0x28 before the
    // file layout, consistent with fxSend/fxReturn at 106/107 and blocks at
    // 120). Without this, a device preset with a reordered chain displays in
    // physical order, and saving it back overwrites the user's real routing
    // with identity order. Same defensive recovery as PRSTDecoder: keep valid
    // in-range non-duplicate bytes in order, append whatever's missing.
    if (decoded.length > 118) {
      const routing: number[] = [];
      const seen = new Set<number>();
      for (let i = 0; i < 11; i++) {
        const v = decoded[108 + i];
        if (v < 11 && !seen.has(v)) {
          routing.push(v);
          seen.add(v);
        }
      }
      for (let si = 0; si < 11; si++) {
        if (!seen.has(si)) routing.push(si);
      }
      const byBlock = [...effects];
      effects.length = 0;
      for (const si of routing) effects.push(byBlock[si]);
    }

    // Controller/EXP assignment records. Dump payload mirrors the file
    // layout shifted -0x28 (name 0x44→28, blocks 0xA0→120), so the tail
    // records sit at 0x3B0-0x28 = 0x388. The strict record validation in
    // parseControlRecords makes a wrong offset yield undefined rather than
    // garbage, so attaching is safe even before hardware confirmation.
    const controls = parseControlRecords(decoded, CONTROL_RECORDS_DUMP_OFFSET);

    return GP200PresetSchema.parse({
      version: '1', patchName, author: author || undefined, effects,
      fxLoopSend, fxLoopReturn, patchVolume, patchPan, patchTempo, checksum: 0,
      expAssignments: controls?.exp,
      ctrlAssignments: controls?.ctrl,
    });
  },

  parseReadChunks(chunks: Uint8Array[]): GP200Preset {
    const decoded = this.assembleChunks(chunks);
    return this.parsePresetFromDecoded(decoded);
  },

  /**
   * Assemble the flash-upload image for a preset from its encoded `.prst`
   * file bytes (PRSTEncoder output or a raw imported file).
   *
   * Ground truth: dumps/patch-upload.pcapng (official editor pushing a patch
   * to slot 9/"3B", 2026-07-18). The image is NOT the whole file:
   *   [0:16]  two fixed TLV records `00 00 04 00 01 00 FF 00` +
   *           `01 00 04 00 FF 00 FF 00` (a write preamble the file lacks)
   *   [16:]   the file content from 0x30 (the `02 00 58 00` metadata TLV)
   *           up to but excluding the trailing 8 bytes (the `C0 04 ...`
   *           footer + BE16 checksum) — verified byte-for-byte against the
   *           capture, whose image tail equals the file's last CTRL record.
   *   [20]    the in-file slot-mirror byte is blanked to 0xFF: the capture
   *           shows the editor sends FF here even when writing to slot 9;
   *           the target slot lives in each chunk's SysEx header instead.
   * A 1224-byte user file therefore yields a 1184-byte image.
   */
  buildUploadImage(fileBytes: Uint8Array): Uint8Array {
    const FOOTER_LEN = 8; // C0 04 00 00 00 00 + 2-byte checksum
    const CONTENT_START = 0x30;
    const content = fileBytes.subarray(CONTENT_START, fileBytes.length - FOOTER_LEN);
    const image = new Uint8Array(16 + content.length);
    image.set([
      0x00, 0x00, 0x04, 0x00, 0x01, 0x00, 0xFF, 0x00,
      0x01, 0x00, 0x04, 0x00, 0xFF, 0x00, 0xFF, 0x00,
    ]);
    image.set(content, 16);
    image[20] = 0xFF; // blank the slot-mirror byte (file 0x34), per capture
    return image;
  },

  /**
   * Frame an upload image as 0x12/0x20 flash-write chunks for `slot`.
   * Per the same capture: 183 raw bytes per chunk (366 nibbles), target slot
   * at byte[10], and the RAW-image offset 7-bit-split at [11] (low) / [12]
   * (high) — offset = b12*128 + b11. A 1184-byte image yields 7 chunks
   * (6×380B + 1×186B frames). The device commits to flash directly; no
   * save-commit follows (hardware-verified: survives power-cycle).
   */
  buildUploadChunks(image: Uint8Array, slot: number): Uint8Array[] {
    const CHUNK_RAW = 183;
    const chunks: Uint8Array[] = [];
    for (let off = 0; off < image.length; off += CHUNK_RAW) {
      const raw = image.subarray(off, Math.min(off + CHUNK_RAW, image.length));
      const nibble = this.nibbleEncode(raw);
      const msg = new Uint8Array(13 + nibble.length + 1);
      msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x20]);
      msg[10] = slot & 0x7F;
      msg[11] = off & 0x7F;
      msg[12] = (off >> 7) & 0x7F;
      msg.set(nibble, 13);
      msg[msg.length - 1] = 0xF7;
      chunks.push(msg);
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
    // sub=0x08 response: bytes [22] and [26] are NOT firmware version
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
    // CMD=0x12, sub=0x10, 46 bytes, raw SysEx (not nibble-encoded)
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
    // CMD=0x12, sub=0x14, 54 bytes, raw SysEx (not nibble-encoded)
    // Confirmed: captures 134828 (COMP→COMP4→AC Boost) + 143107 (AMP→SnapTone)
    // raw[38]=block, raw[45:47]=variant nibble-encoded, raw[52]=module type
    // NOTE: Sub-category byte (bits 16-23, e.g. 0x10 for User IR) encoding position
    // is unknown; only regular effects (sub-category=0x00) are confirmed via captures.
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
    // CMD=0x12, sub=0x18, 62 bytes, nibble-encoded 24-byte payload
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
    // CMD=0x12, sub=0x10, 46 bytes, similar to toggle but different constants
    // Confirmed: capture 140802 (Valeton VOL/PAN/Tempo): bytes[29:31]=0x00,0x06 (not 0x01,0x05 like toggle)
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
    // CMD=0x12, sub=0x20, 78 bytes, nibble-encoded 32-byte payload
    // Confirmed: capture 101538 (NR↔AMP swap) + 101714 (NR↔AMP + DLY↔RVB)
    // order: array of 11 slot indices representing the new chain order
    // decoded[14]=SEND, decoded[15]=RETURN (1..10). decoded[27]=0x44 flags this
    // as a routing-reorder (vs FX-loop move which uses 0x08/0xBA; see buildFxLoopMove).
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
    // CMD=0x12, sub=0x20, 78 bytes, nibble-encoded 32-byte payload
    // Confirmed: captures 075745 (SEND moves) + 075856 (RETURN moves), 2026-05-18
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
    // CMD=0x12, sub=0x18, 62 bytes, nibble-encoded "save to slot" commit
    // From captures 100548 + 101538: sent after live edits or write chunks to persist
    // Decoded payload: [0:3]=03 20 14, [4]=sub-slot (A=0,B=1,C=2,D=3), [8:24]=name
    // Confirmed: capture 121732 slot 1B has decoded[4]=0x01, slot 1A has decoded[4]=0x00
    const decoded = new Uint8Array(24);
    decoded[0] = 0x03;
    decoded[1] = 0x20;
    decoded[2] = 0x14;
    decoded[4] = slot;  // full absolute slot number (0-255), nibble-encoded by caller
    // [8:24] = preset name (16 bytes, null-terminated; same as .prst format)
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
    // CMD=0x12, sub=0x20, 78 bytes, nibble-encoded 32-byte payload
    // Confirmed: capture 143029 pkt 71: decoded[8]=0x09 (Author msg type)
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
    // CMD=0x12, sub=0x18, 62 bytes, nibble-encoded 24-byte payload
    // Confirmed: capture 143029 pkt 135: different header from param change
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
    // CMD=0x12, sub=0x38, 126 bytes, nibble-encoded 56-byte payload
    // Confirmed: capture 143029 pkt 129: decoded[8]=0x0B (Note msg type)
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
    // CMD=0x12, sub=0x18, 62 bytes, nibble-encoded "section navigation"
    // Selects which EXP/Mode to edit AND which effect parameter to assign.
    // Confirmed: capture 200517: decoded[2]=0x40 discriminates from param change,
    // decoded[11]=page (0=EXP1 ModeA, 1=EXP1 ModeB, 2=EXP2)
    // Confirmed: capture 204352: decoded[13]=blockIndex<<4, decoded[14]=paramIndex<<4
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
    decoded[18] = 0xC8;                           // constant (was 0x84; off-by-one analysis error)
    decoded[19] = 0x42;                           // constant (was 0x20)

    const nibbles = this.nibbleEncode(decoded);
    const msg = new Uint8Array(62);
    msg.set([0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, 0x12, 0x18, 0x00, 0x00, 0x00]);
    msg.set(nibbles, 13);
    msg[61] = 0xF7;
    return msg;
  },

  buildExpAssignment(section: number, page: number, item: number, value: number): Uint8Array {
    // CMD=0x12, sub=0x14, 54 bytes, EXP/QA assignment write
    // Confirmed: capture 200517: type=0x0E at raw[30]
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

  /**
   * Per-patch CTRL footswitch assignment write — the live sibling of
   * buildExpAssignment (same CMD/sub/length, different record type).
   *
   * Ground truth: dumps/ctrl-assignment/ (2026-08-08, fw 1.8.0), six frames
   * across four captures, cross-validated against the patch the editor then
   * exported (`01-A strat.prst`, whose tail decodes to CTRL 1 state=1
   * mask=0x004 and CTRL 8 state=0 mask=0x400 — the last frame of each
   * session, state byte included).
   *
   *   [30-33] 0f 00 00 00  record type u32 LE = TYPE_CTRL (the EXP writer
   *                        sends 0x0E here; the CTRL TLV type is 0x000F)
   *   [34-37] 08 00 00 00  record size u32 LE = the 8-byte CTRL payload
   *   [38-39] ctrlIndex    (ctl-1-* → 00, ctl-8-* → 07)
   *   [40-41] state        saved toggle position (ctl-1 sessions → 01,
   *                        ctl-8 → 00, matching the exported tail)
   *   [42-45] zeros        payload+2..3, the "uninitialized" window the
   *                        editor writes as zeros
   *   [46-49] blockMask    u16 LE (ctl-1-assign-dist → 04 00 00 00;
   *                        ctl-8-assign-vol → 00 00 04 00, confirming bit 10)
   *
   * This is a WHOLE-MASK write, not a per-bit toggle: assigning VOL on CTRL 8
   * sent 0x400 alone and the export shows the previously-set DST bit gone. No
   * navigation frame precedes it (unlike the EXP path, which needs
   * buildExpNavigation) — each captured action is exactly one frame.
   */
  buildCtrlAssignment(ctrlIndex: number, blockMask: number, state = 0): Uint8Array {
    const msg = new Uint8Array(54);
    msg.set([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32, // [0-7]   header
      0x12, 0x14,                                        // [8-9]   CMD=SET, sub
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [10-17] padding
      0x04, 0x00, 0x00, 0x00,                            // [18-21] constant
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,  // [22-29] padding
      0x0F, 0x00, 0x00, 0x00,                            // [30-33] type=CTRL assignment
      0x08, 0x00, 0x00, 0x00,                            // [34-37] payload size 8
    ]);
    // Every payload field is nibble-split (4 bits per byte, LOW nibble first)
    // so no data byte can exceed 0x7F. Note this is NOT nibbleEncode, which
    // packs a byte array high-nibble-first.
    //
    // KNOWN WRONG for mask bits 4-7 (NR/CAB/EQ/MOD → byte [47]). The capture
    // only ever exercised bits 0, 2 and 10, i.e. bytes [46] and [48]; [47] is
    // interpolation, and hardware testing 2026-08-08 shows the device ignores
    // it. A rival model — [46] carrying the whole low byte — fits every
    // captured frame equally well. Needs an EQ/MOD capture to settle;
    // docs/protocol-capture.md §3.
    msg[38] = ctrlIndex & 0x0F;
    msg[39] = (ctrlIndex >> 4) & 0x0F;
    msg[40] = state & 0x0F;
    msg[41] = (state >> 4) & 0x0F;
    // [42-45] stay zero.
    msg[46] = blockMask & 0x0F;
    msg[47] = (blockMask >> 4) & 0x0F;
    msg[48] = (blockMask >> 8) & 0x0F;
    msg[49] = (blockMask >> 12) & 0x0F;
    msg[53] = 0xF7;                                      // [53]    end
    return msg;
  },

  buildPresetChange(slot: number): Uint8Array {
    // CMD=0x12, sub=0x08, 30 bytes, switch device to preset slot
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

  /**
   * Generic 30-byte global-settings write (CMD=0x12, sub=0x08). Decoded from
   * the dumps/ capture set (docs/protocol-capture.md §0.2): one frame per
   * changed setting, addressed by bytes [13]/[14]/[15] (family) and
   * [21]/[22] (setting id), value in [25..28] (per-setting layout). The
   * device echoes the frame back verbatim; senders must raise the FX
   * suppression window so the echo is ignored (see useMidiDevice's
   * settings-echo guard for the [21]/[22]!=0 discriminator).
   */
  buildSettingsWrite(fields: {
    b13?: number; b14: number; b15?: number;
    b21?: number; b22?: number;
    b25?: number; b26?: number; b27?: number; b28?: number;
  }): Uint8Array {
    return new Uint8Array([
      0xF0, 0x21, 0x25, 0x7E, 0x47, 0x50, 0x2D, 0x32,  // [0-7]   header
      0x12, 0x08,                                        // [8-9]   CMD, sub
      0x00, 0x00, 0x00,                                  // [10-12] padding
      fields.b13 ?? 0x00,                                // [13]    family hi
      fields.b14,                                        // [14]    family
      fields.b15 ?? 0x01,                                // [15]    constant
      0x00, 0x00,                                        // [16-17] padding
      0x04, 0x00, 0x00,                                  // [18-20] constant
      fields.b21 ?? 0x00,                                // [21]    setting id hi
      fields.b22 ?? 0x00,                                // [22]    setting id lo
      0x00, 0x00,                                        // [23-24] padding
      fields.b25 ?? 0x00,                                // [25]    value field
      fields.b26 ?? 0x00,                                // [26]    value field
      fields.b27 ?? 0x00,                                // [27]    value field
      fields.b28 ?? 0x00,                                // [28]    value field
      0xF7,                                              // [29]    end
    ]);
  },

  /** FS Mode: 0=Patch, 1=Stomp, 2=User (capture: fs-template-change). */
  buildFsMode(mode: number): Uint8Array {
    return this.buildSettingsWrite({ b14: 0x08, b21: 0x01, b22: 0x08, b26: mode & 0x03 });
  },

  /** Auto Cab Match on/off (capture: auto-cab-match). */
  buildAutoCabMatch(on: boolean): Uint8Array {
    let value = 0;
    if (on) value = 1;
    return this.buildSettingsWrite({ b14: 0x08, b21: 0x02, b22: 0x04, b26: value });
  },

  /**
   * FS TAP/HOLD target: record index at [26] = (fs-1)*2 + (0 TAP / 1 HOLD),
   * action id nibbled across [27] (high) / [28] (low). Action ids live in
   * src/core/footswitchSettings.ts (captures: fs-1-tap/hold-all-changes,
   * FS-Tap-None-Set-1-8).
   */
  buildFsTarget(fs: number, kind: 'tap' | 'hold', actionId: number): Uint8Array {
    let holdBit = 0;
    if (kind === 'hold') holdBit = 1;
    const record = (fs - 1) * 2 + holdBit;
    return this.buildSettingsWrite({
      b14: 0x0F, b22: 0x01,
      b25: 0x00, b26: record,
      b27: (actionId >> 4) & 0x0F, b28: actionId & 0x0F,
    });
  },

  /** FS combo target: combo 0..3 = FS1+5..FS4+8 (capture: fs-combination-set-none). */
  buildFsCombo(comboIndex: number, actionId: number): Uint8Array {
    return this.buildSettingsWrite({
      b14: 0x0F, b22: 0x01,
      b25: 0x01, b26: comboIndex & 0x03,
      b27: (actionId >> 4) & 0x0F, b28: actionId & 0x0F,
    });
  },
};
