import { BufferGenerator } from './BufferGenerator';
import { GP200PresetSchema, type GP200Preset } from './types';

// Mirror of PRSTDecoder offsets — confirmed against real .prst files from GP-200
const PRST_MAGIC         = 'TSRP';
const DEVICE_ID          = '2-PG';
const TOTAL_SIZE         = 1224;
const OFFSET_MAGIC       = 0x00;
const OFFSET_DEVICE_ID   = 0x10;
const OFFSET_FW_VERSION  = 0x14;  // 4 bytes: 00 01 01 00
const OFFSET_TIMESTAMP   = 0x1C;  // 4 bytes LE uint32
const OFFSET_MRAP        = 0x28;
const OFFSET_MRAP_SIZE   = 0x2C;
const MRAP_CONTENT_SIZE  = 1172;

// Pre-name metadata (0x30-0x43)
const OFFSET_PRE_META    = 0x30;

const OFFSET_PATCH_NAME  = 0x44;
const PATCH_NAME_MAX     = 16;   // name is 16 bytes, author follows at 0x54
const OFFSET_AUTHOR      = 0x54;
const AUTHOR_MAX         = 16;

// Routing section (0x8C-0x9F)
const OFFSET_ROUTING     = 0x8C;
const OFFSET_FX_SEND     = 0x92;
const OFFSET_FX_RETURN   = 0x93;

// Effect blocks
const EFFECT_BLOCK_COUNT = 11;
const EFFECT_BLOCK_START = 0xA0;
const EFFECT_BLOCK_SIZE  = 0x48;
const PARAMS_OFFSET      = 0x0C;
const PARAMS_COUNT       = 15;

const OFFSET_CHECKSUM    = 0x4C6;

export class PRSTEncoder {
  encode(preset: GP200Preset): ArrayBuffer {
    GP200PresetSchema.parse(preset);

    const gen = new BufferGenerator(TOTAL_SIZE);

    // If this preset was decoded from a real .prst, start from those bytes
    // so any region the editor doesn't model (controller/EXP mappings,
    // header padding, routing-section extras) round-trips byte-exact.
    if (preset.rawSource && preset.rawSource.byteLength >= TOTAL_SIZE) {
      gen.writeBytes(0, preset.rawSource.subarray(0, TOTAL_SIZE));
    }

    // ── File header (0x00-0x2F) ──────────────────────────────────────────
    // When a rawSource is present, all file-header and pre-name-metadata
    // bytes are already correct — skip re-seeding them so we don't change
    // values the editor doesn't own (timestamp, pre-meta constants).
    if (!preset.rawSource) {
      gen.writeAscii(OFFSET_MAGIC, PRST_MAGIC, 4);
      gen.writeUint8(0x0B, 0x06);
      gen.writeAscii(OFFSET_DEVICE_ID, DEVICE_ID, 4);
      const verNum = Number.parseInt(preset.version, 10);
      gen.writeUint8(OFFSET_FW_VERSION, 0x00);
      gen.writeUint8(OFFSET_FW_VERSION + 1, Number.isFinite(verNum) ? verNum & 0xFF : 0x01);
      gen.writeUint8(OFFSET_FW_VERSION + 2, 0x01);
      gen.writeUint8(OFFSET_FW_VERSION + 3, 0x00);
      gen.writeUint32LE(OFFSET_TIMESTAMP, Math.floor(Date.now() / 1000) & 0xFFFFFFFF);
      gen.writeUint16LE(0x24, 0x0494);
      gen.writeAscii(OFFSET_MRAP, 'MRAP', 4);
      gen.writeUint32LE(OFFSET_MRAP_SIZE, MRAP_CONTENT_SIZE);

      gen.writeUint8(OFFSET_PRE_META, 0x02);
      gen.writeUint8(OFFSET_PRE_META + 2, 0x58);
      gen.writeUint8(OFFSET_PRE_META + 6, 0x78);
      gen.writeUint8(OFFSET_PRE_META + 8, 0x32);
    } else {
      // Even with rawSource, write the version byte so an edit flow that
      // changes preset.version propagates through a round-trip.
      const verNum = Number.parseInt(preset.version, 10);
      gen.writeUint8(OFFSET_FW_VERSION + 1, Number.isFinite(verNum) ? verNum & 0xFF : 0x01);
    }

    // ── Patch name (0x44-0x53) ───────────────────────────────────────────
    gen.writeAscii(OFFSET_PATCH_NAME, preset.patchName, PATCH_NAME_MAX);

    // ── Author (0x54-0x63) ────────────────────────────────────────────
    // Always write the full field (zero-filled when author is cleared) so
    // that removing an author on a rawSource-based preset actually clears
    // the old bytes in the round-tripped buffer.
    gen.writeAscii(OFFSET_AUTHOR, preset.author ?? '', AUTHOR_MAX);

    // ── Routing section (0x8C-0x9F) ──────────────────────────────────────
    // Header constants only seeded for synthetic presets; rawSource already
    // carries the correct ones. Routing-order bytes (OFFSET_ROUTING+8..+18)
    // always reflect the current effects[] playback order.
    if (!preset.rawSource) {
      gen.writeUint8(OFFSET_ROUTING, 0x08);
      gen.writeUint8(OFFSET_ROUTING + 1, 0x00);
      gen.writeUint8(OFFSET_ROUTING + 2, 0x10);
      gen.writeUint8(OFFSET_ROUTING + 3, 0x00);
    }
    for (let i = 0; i < EFFECT_BLOCK_COUNT; i++) {
      const slot = preset.effects[i];
      gen.writeUint8(OFFSET_ROUTING + 8 + i, slot ? slot.slotIndex : i);
    }
    // FX-loop SEND/RETURN positions (1..10). Always written, regardless of
    // rawSource, because the editor owns these bytes.
    gen.writeUint8(OFFSET_FX_SEND, preset.fxLoopSend);
    gen.writeUint8(OFFSET_FX_RETURN, preset.fxLoopReturn);

    // ── Effect blocks (0xA0-0x3AF, 11 × 72 bytes) ───────────────────────
    // Each slot's physical byte position is determined by its slotIndex
    // (PRST block identity 0..10 = PRE..VOL). Array order captures routing
    // order and is written separately in the routing section above.
    //
    // Only the editor-modeled fields (slotIndex, enabled, effectId, 15×f32
    // params) are overwritten. Marker/padding constants stay whatever the
    // rawSource had (or are seeded below when rawSource is absent).
    const hasRaw = Boolean(preset.rawSource);
    const written = new Set<number>();
    for (const slot of preset.effects) {
      const base = EFFECT_BLOCK_START + slot.slotIndex * EFFECT_BLOCK_SIZE;
      if (!hasRaw) {
        gen.writeUint8(base + 0, 0x14);
        gen.writeUint8(base + 2, 0x44);
        gen.writeUint8(base + 7, 0x0F);
      }
      gen.writeUint8(base + 4, slot.slotIndex);
      gen.writeUint8(base + 5, slot.enabled ? 1 : 0);
      gen.writeUint32LE(base + 8, slot.effectId);
      for (let p = 0; p < PARAMS_COUNT && p < slot.params.length; p++) {
        const val = slot.params[p];
        gen.writeFloat32LE(base + PARAMS_OFFSET + p * 4, Number.isFinite(val) ? val : 0);
      }
      written.add(slot.slotIndex);
    }
    if (!hasRaw) {
      for (let i = 0; i < EFFECT_BLOCK_COUNT; i++) {
        if (written.has(i)) continue;
        const base = EFFECT_BLOCK_START + i * EFFECT_BLOCK_SIZE;
        gen.writeUint8(base + 0, 0x14);
        gen.writeUint8(base + 2, 0x44);
        gen.writeUint8(base + 4, i);
        gen.writeUint8(base + 7, 0x0F);
      }
    }


    // ── Checksum (0x4C6-0x4C7) ───────────────────────────────────────────
    const buf = gen.toArrayBuffer();
    const bytes = new Uint8Array(buf);
    let sum = 0;
    for (let i = 0; i < OFFSET_CHECKSUM; i++) {
      sum += bytes[i];
    }
    const checksum = sum & 0xFFFF;
    bytes[OFFSET_CHECKSUM]     = (checksum >> 8) & 0xFF;
    bytes[OFFSET_CHECKSUM + 1] = checksum & 0xFF;

    return buf;
  }
}
